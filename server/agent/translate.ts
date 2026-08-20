// Des messages du SDK vers le modèle de rejeu.
//
// C'est le seul endroit du serveur qui connaît la forme des messages du SDK.
// Tout ce qui est en aval — le flux SSE, la timeline du front — ne voit que des
// `TranscriptEvent` et des `Block`, c'est-à-dire exactement ce que
// `server/transcript.ts` produit en relisant un `.jsonl`. Une session pilotée
// s'affiche donc avec les composants du rejeu, sans une ligne de rendu neuve.
//
// Deux flux disent la même chose à deux moments : les `stream_event` donnent le
// texte au fil de la frappe, le message `assistant` donne la version complète et
// fiable (les entrées d'outils n'y sont plus tronquées). On affiche le premier et
// on se corrige sur le second — d'où le `replace-event` systématique.

import { randomUUID } from 'node:crypto';
import type { AgentUpsert } from '../../shared/agent.ts';
import type { Compaction } from '../../shared/context.ts';
import type {
  Block,
  TranscriptEvent,
  TranscriptImage,
  ToolResult,
} from '../../shared/transcript.ts';
import { num, str } from '../json.ts';
import { repairJson } from './partial.ts';

type Rec = Record<string, unknown>;

/**
 * Le pas de diffusion d'une entrée d'outil en train de se composer.
 *
 * Réparer un fragment coûte un parcours de tout ce qui est arrivé : le faire à
 * chaque trame reviendrait à relire le début du texte des centaines de fois pour
 * un `Write` un peu long. Un dixième de seconde suffit à voir une commande
 * s'écrire, et borne le travail.
 */
const INPUT_STEP_MS = 120;

/**
 * Au-delà, on cesse de réparer.
 *
 * Ce qui dépasse cette taille est un corps de fichier, pas un argument : la ligne
 * de résumé n'en montrera jamais que le début, déjà arrivé.
 *
 * La borne était à 8 000, et une entrée d'outil *est* parfois ce qu'on regarde :
 * une `AskUserQuestion` portant des maquettes ASCII pèse précisément cet
 * ordre-là. La carte se figeait donc à mi-question pendant toute la frappe, puis
 * se complétait d'un coup à la fin du message. Réparer coûte un parcours de
 * caractères : à 64 000, toutes les 120 ms, c'est une milliseconde.
 */
const INPUT_MAX = 64_000;

const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * À quel sous-agent appartient ce message — `undefined` pour le fil principal.
 *
 * Le SDK transmet ce qu'un sous-agent fait dans le **même** flux que le reste,
 * en marquant ses messages du `parent_tool_use_id` de l'appel `Agent` qui l'a
 * lancé. Sans lire cette marque, ses appels d'outil se rendaient dans le fil
 * principal — puis une seconde fois dans la piste de l'agent, une fois le disque
 * relu, qui les range, lui, où ils sont.
 *
 * L'identifiant employé est celui de l'appel, faute de mieux en direct : le nom
 * du sidecar n'existe pas encore. Il suffit à ce qui compte ici — la partition
 * se fait sur la seule présence d'un `agentId` (voir `useAgentTracks`), et ces
 * lignes quittent donc le fil principal. La fin du tour les remplace par celles
 * du disque, qui portent la véritable identité du run.
 */
function agentOf(message: Rec): string | undefined {
  return str(message.parent_tool_use_id) || undefined;
}

/**
 * Le texte d'un `tool_result`, qui arrive tantôt en chaîne, tantôt en blocs.
 * Les blocs non textuels (images) sont ignorés ici : le flux vivant ne
 * transporte pas d'octets, et le rejeu les retrouvera sur le disque.
 */
export function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  return arr(content)
    .map((b) => {
      const block = rec(b);
      return block.type === 'text' ? str(block.text) : '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Le message vide que le CLI synthétise quand un tour n'a rien produit.
 *
 * La chaîne est en dur de son côté ; elle l'est donc aussi du nôtre. Comparer
 * plutôt que de tester « aucun texte » est volontaire : un tour réellement muet
 * arrive sans bloc du tout, et se rend déjà correctement.
 */
const SILENT_TURN = '(no content)';

/**
 * Une commande `/` tapée au composeur : son nom, puis ses arguments.
 *
 * Le nom accepte le `:` d'une commande de plugin (`plugin:skill`) et le `-` des
 * noms composés. Une barre suivie d'autre chose — un chemin absolu collé, par
 * exemple — n'est pas une commande et reste un tour ordinaire.
 */
const SLASH_COMMAND = /^\/([a-zA-Z0-9][\w:.-]*)(?:\s+([\s\S]*))?$/;

function isSilent(payload: Rec): boolean {
  const blocks = arr(payload.content);
  if (blocks.length !== 1) return false;
  const block = rec(blocks[0]);
  return str(block.type) === 'text' && str(block.text).trim() === SILENT_TURN;
}

export class Translator {
  /** L'état courant de la timeline, dans l'ordre d'arrivée. */
  readonly events: TranscriptEvent[] = [];

  private readonly byUuid = new Map<string, TranscriptEvent>();
  /** Où retrouver le bloc `tool_use` d'un identifiant d'outil, pour y coller son résultat. */
  private readonly toolIndex = new Map<string, { uuid: string; index: number }>();
  private lastUuid: string | null = null;
  /** L'événement assistant en cours de streaming, s'il y en a un. */
  private streamingUuid: string | null = null;
  /** Le JSON d'entrée d'un `tool_use` en cours de frappe, par bloc. */
  private readonly toolJson = new Map<string, { text: string; at: number; capped?: boolean }>();
  /** Combien de blocs les messages complets ont déjà scellés, par `message.id`. */
  private readonly sealed = new Map<string, number>();

  private register(event: TranscriptEvent): void {
    this.events.push(event);
    this.byUuid.set(event.uuid, event);
    this.lastUuid = event.uuid;
  }

  /**
   * Oublier tout le fil : la conversation repart à vide.
   *
   * C'est ce que `/clear` provoque, et ce n'est pas un compactage — le CLI
   * n'écrit plus dans le même `.jsonl`, il en ouvre un autre. Garder les tours
   * précédents à l'écran laisserait lire, au-dessus du curseur, une conversation
   * dont l'agent n'a plus aucun souvenir.
   *
   * Les index se vident avec la liste : un `tool_use` d'avant la coupure n'aura
   * jamais son résultat, et son `uuid` ne doit pas capturer celui d'après.
   */
  reset(): void {
    this.events.length = 0;
    this.byUuid.clear();
    this.toolIndex.clear();
    this.toolJson.clear();
    this.sealed.clear();
    this.lastUuid = null;
    this.streamingUuid = null;
  }

  /**
   * Un tour tapé par l'humain. Le runner l'appelle avant de pousser le prompt.
   *
   * Les images collées deviennent un bloc `image` posé **avant** le texte, dans
   * l'ordre où le message part au modèle — et c'est le même bloc que le rejeu
   * produit en relisant le `.jsonl`, si bien que `UserBubble` les rend sans rien
   * savoir de leur provenance.
   *
   * Une commande `/` prend la forme que le parseur lui donnera : `slash-command`
   * et son bloc, jamais un tour humain. Ce n'est pas cosmétique — l'Atelier
   * recoud le direct au disque en comptant les tours humains de part et d'autre,
   * seul repère commun aux deux sources. Compter ici une commande que le disque
   * ne compte pas décalait la couture d'un tour : après un `/compact`, la
   * frontière de compaction se retrouvait des deux côtés, et le fil affichait
   * une phase de plus que la session n'en avait vécu.
   */
  appendUserPrompt(text: string, images: TranscriptImage[] = []): AgentUpsert[] {
    const slash = images.length ? null : SLASH_COMMAND.exec(text.trim());
    const event: TranscriptEvent = {
      uuid: randomUUID(),
      parentUuid: this.lastUuid,
      kind: 'user',
      role: 'user',
      timestamp: Date.now(),
      isSidechain: false,
      isMeta: false,
      origin: slash ? 'slash-command' : 'human',
      blocks: slash
        ? [{ kind: 'slash_command' as const, name: `/${slash[1]}`, text: slash[2] ?? '' }]
        : [
            ...(images.length ? [{ kind: 'image' as const, images }] : []),
            { kind: 'text' as const, text },
          ],
    };
    this.register(event);
    return [{ kind: 'append-event', event }];
  }

  /** Une ligne de service (erreur du runner, interruption) montrée dans le fil. */
  appendSystem(text: string, level = 'info'): AgentUpsert[] {
    const event: TranscriptEvent = {
      uuid: randomUUID(),
      parentUuid: this.lastUuid,
      kind: 'system',
      timestamp: Date.now(),
      isSidechain: false,
      isMeta: true,
      subtype: 'atelier',
      level,
      blocks: [{ kind: 'text', text }],
    };
    this.register(event);
    return [{ kind: 'append-event', event }];
  }

  /**
   * La frontière d'une compaction, telle que le SDK l'annonce sur-le-champ.
   *
   * Sans elle, une compaction n'existait que dans le `.jsonl`, et l'Atelier ne la
   * montrait qu'au tour suivant — la fenêtre se vidait sous les yeux du lecteur
   * sans que rien ne le dise. Le direct en sait moins que le disque :
   * `post_tokens` et `duration_ms` sont facultatifs et manquent le plus souvent à
   * chaud. On laisse alors 0, que le marqueur lit comme « pas encore connu »
   * plutôt que comme une fenêtre vidée à zéro ; la relecture du disque, en fin de
   * tour, remplacera l'événement par sa version chiffrée.
   */
  appendCompaction(message: Rec): AgentUpsert[] {
    const meta = rec(message.compact_metadata);
    const timestamp = Date.now();
    const uuid = str(message.uuid) || randomUUID();
    const compaction: Compaction = {
      uuid,
      timestamp,
      trigger: str(meta.trigger) === 'auto' ? 'auto' : 'manual',
      preTokens: num(meta.pre_tokens),
      postTokens: num(meta.post_tokens),
      durationMs: num(meta.duration_ms),
    };
    const event: TranscriptEvent = {
      uuid,
      parentUuid: this.lastUuid,
      kind: 'compaction',
      timestamp,
      isSidechain: false,
      isMeta: true,
      compaction,
      blocks: [],
    };
    this.register(event);
    return [{ kind: 'append-event', event }];
  }

  /**
   * Pose sur une compaction le résumé qu'elle a produit.
   *
   * Il n'arrive pas avec la frontière mais **juste après**, dans le message que
   * le CLI se renvoie à lui-même pour recharger la conversation. D'où ces deux
   * temps : la compaction s'annonce tout de suite — sans quoi un résumé qui ne
   * viendrait pas l'emporterait dans son silence — et se complète ensuite.
   *
   * Les blocs sont ceux qu'un événement porte d'ordinaire : le relecteur de
   * transcript en produit exactement autant pour cette même compaction, si bien
   * que le direct et la relecture ne racontent pas deux histoires.
   */
  attachSummary(uuid: string, text: string): AgentUpsert[] {
    const event = this.byUuid.get(uuid);
    if (!event || !text.trim()) return [];
    event.blocks = [{ kind: 'text', text }];
    return [{ kind: 'replace-event', event }];
  }

  // ── Flux vivant ───────────────────────────────────────────────────────────

  onStreamEvent(message: Rec): AgentUpsert[] {
    const ev = rec(message.event);
    switch (ev.type) {
      case 'message_start':
        return this.startAssistant(rec(rec(ev.message).id ? ev.message : {}), agentOf(message));
      case 'content_block_start':
        return this.startBlock(num(ev.index, 0), rec(ev.content_block));
      case 'content_block_delta':
        return this.appendDelta(num(ev.index, 0), rec(ev.delta));
      default:
        return [];
    }
  }

  private startAssistant(message: Rec, agentId?: string): AgentUpsert[] {
    // L'identifiant de la réponse API fait un `uuid` stable : le message
    // `assistant` final portera le même, et se posera donc sur cet événement-ci
    // au lieu d'en créer un second.
    const uuid = str(message.id) || randomUUID();
    if (this.byUuid.has(uuid)) {
      this.streamingUuid = uuid;
      return [];
    }
    const event: TranscriptEvent = {
      uuid,
      parentUuid: this.lastUuid,
      kind: 'assistant',
      role: 'assistant',
      timestamp: Date.now(),
      isSidechain: agentId !== undefined,
      isMeta: false,
      model: str(message.model) || undefined,
      blocks: [],
      ...(agentId ? { agentId } : {}),
    };
    this.register(event);
    this.streamingUuid = uuid;
    return [{ kind: 'append-event', event }];
  }

  private startBlock(index: number, contentBlock: Rec): AgentUpsert[] {
    const event = this.streaming();
    if (!event) return [];
    // Les blocs arrivent dans l'ordre, mais un trou resterait un trou : on
    // comble plutôt que de laisser un tableau creux, que rien en aval ne sait lire.
    while (event.blocks.length < index) event.blocks.push({ kind: 'text', text: '' });

    const type = str(contentBlock.type);
    let block: Block;
    if (type === 'tool_use') {
      block = {
        kind: 'tool_use',
        id: str(contentBlock.id),
        name: str(contentBlock.name),
        input: {},
        result: null,
      };
      if (block.id) this.toolIndex.set(block.id, { uuid: event.uuid, index });
      this.toolJson.delete(`${event.uuid}:${index}`);
    } else if (type === 'thinking' || type === 'redacted_thinking') {
      block = { kind: 'thinking', text: '', redacted: type === 'redacted_thinking' };
    } else {
      block = { kind: 'text', text: '' };
    }
    event.blocks[index] = block;
    return [{ kind: 'replace-event', event }];
  }

  private appendDelta(index: number, delta: Rec): AgentUpsert[] {
    const event = this.streaming();
    const block = event?.blocks[index];
    if (!event || !block) return [];

    const type = str(delta.type);
    if (type === 'input_json_delta') return this.appendInput(event, index, str(delta.partial_json));

    const text =
      type === 'text_delta'
        ? str(delta.text)
        : type === 'thinking_delta'
          ? str(delta.thinking)
          : '';
    if (!text) return [];

    block.text = (block.text ?? '') + text;
    return [{ kind: 'text-delta', uuid: event.uuid, blockIndex: index, text }];
  }

  /**
   * L'entrée d'un outil telle qu'elle se compose.
   *
   * On la montrait autrefois vide jusqu'à la réponse complète, au motif qu'un
   * JSON à moitié arrivé ne veut rien dire. C'est vrai du fragment brut, pas de
   * ce qu'on en tire : `repairJson` en fait à chaque pas un objet valide, dont
   * la dernière valeur grandit. Une carte d'outil affiche donc son nom *et* sa
   * commande en train d'être tapée, au lieu d'un nom seul pendant une seconde.
   */
  private appendInput(event: TranscriptEvent, index: number, fragment: string): AgentUpsert[] {
    if (!fragment) return [];
    const key = `${event.uuid}:${index}`;
    const buffer = this.toolJson.get(key) ?? { text: '', at: 0 };
    buffer.text += fragment;
    this.toolJson.set(key, buffer);

    const now = Date.now();
    // Passé la borne on ne relit plus — mais on relit **une dernière fois**. Un
    // premier fragment déjà plus gros qu'elle laissait sinon la carte sur un
    // `{}` jusqu'à la fin du message : figer sur ce qu'on a vu est le propos,
    // figer sur rien n'en est pas.
    if (buffer.text.length > INPUT_MAX) {
      if (buffer.capped) return [];
      buffer.capped = true;
    } else if (now - buffer.at < INPUT_STEP_MS) {
      return [];
    }
    buffer.at = now;

    const input = repairJson(buffer.text);
    if (!input) return [];
    const block = event.blocks[index];
    if (!block) return [];
    block.input = input;
    return [{ kind: 'tool-input', uuid: event.uuid, blockIndex: index, input }];
  }

  private streaming(): TranscriptEvent | null {
    return this.streamingUuid ? (this.byUuid.get(this.streamingUuid) ?? null) : null;
  }

  // ── Messages complets ─────────────────────────────────────────────────────

  /**
   * La version qui fait foi : entrées d'outils entières, relevé de tokens.
   *
   * **Une réponse arrive en plusieurs messages.** Le CLI en émet un par bloc —
   * le raisonnement, puis la prose, puis chaque appel d'outil — tous portant le
   * même `message.id`, celui-là même qu'on prend pour `uuid` afin qu'ils se
   * posent sur un seul événement. Leur `content` est donc un *fragment* de la
   * réponse, jamais son entier : le remplacer effaçait tout ce qui précédait, et
   * seul le dernier bloc survivait. À l'écran, une réponse qui expliquait sa
   * décision avant d'agir n'était plus qu'un appel d'outil nu — la phrase avait
   * bien été écrite, elle disparaissait à l'arrivée du message suivant.
   *
   * Chaque message se pose donc **à la suite** de ce que les précédents ont
   * scellé. Le curseur suit exactement les index du streaming, qui reçoit les
   * mêmes blocs dans le même ordre : un fragment recouvre la version frappée en
   * direct du bloc qu'il décrit, et seulement celle-là.
   */
  onAssistant(message: Rec): AgentUpsert[] {
    const payload = rec(message.message);
    const uuid = str(payload.id) || randomUUID();
    const agentId = agentOf(message);
    // Un tour qui n'a rien à dire — la réponse à `/clear` en est une — arrive
    // avec ce texte en dur. Le rendre donnerait une bulle « (no content) » juste
    // sous un fil qu'on vient d'effacer. On n'écarte que ce qui n'existe pas
    // déjà : un message en cours de streaming garde son événement.
    if (!this.byUuid.has(uuid) && isSilent(payload)) return [];
    let event = this.byUuid.get(uuid);
    if (!event) {
      event = {
        uuid,
        parentUuid: this.lastUuid,
        kind: 'assistant',
        role: 'assistant',
        timestamp: Date.now(),
        isSidechain: agentId !== undefined,
        isMeta: false,
        blocks: [],
        ...(agentId ? { agentId } : {}),
      };
      this.register(event);
    }

    event.model = str(payload.model) || event.model;
    const usage = rec(payload.usage);
    if (Object.keys(usage).length) {
      event.usage = {
        input: num(usage.input_tokens),
        output: num(usage.output_tokens),
        cacheRead: num(usage.cache_read_input_tokens),
        cacheCreate: num(usage.cache_creation_input_tokens),
      };
    }

    // Les résultats déjà collés survivent au remplacement : un outil rapide peut
    // avoir répondu avant que la réponse complète n'arrive.
    const previous = new Map<string, ToolResult | null | undefined>();
    for (const b of event.blocks) if (b.id) previous.set(b.id, b.result);

    const target = event;
    const base = this.sealed.get(uuid) ?? 0;
    const content = arr(payload.content);
    // Un trou resterait un trou, comme au streaming : rien en aval ne sait lire
    // un tableau creux.
    while (target.blocks.length < base) target.blocks.push({ kind: 'text', text: '' });

    content.forEach((raw, offset) => {
      const index = base + offset;
      const b = rec(raw);
      const type = str(b.type);
      if (type === 'tool_use') {
        const id = str(b.id);
        if (id) this.toolIndex.set(id, { uuid, index });
        target.blocks[index] = {
          kind: 'tool_use',
          id,
          name: str(b.name),
          input: b.input ?? {},
          result: previous.get(id) ?? null,
        } satisfies Block;
      } else if (type === 'thinking' || type === 'redacted_thinking') {
        target.blocks[index] = {
          kind: 'thinking',
          text: str(b.thinking),
          redacted: type === 'redacted_thinking',
        } satisfies Block;
      } else {
        target.blocks[index] = { kind: 'text', text: str(b.text) } satisfies Block;
      }
      // L'entrée fait foi désormais : le fragment qui la préfigurait n'a plus de
      // raison d'occuper la mémoire d'une session qui dure des heures. Seuls les
      // blocs scellés ici sont oubliés — un appel suivant peut encore se frapper.
      this.toolJson.delete(`${uuid}:${index}`);
    });
    this.sealed.set(uuid, base + content.length);

    return [{ kind: 'replace-event', event }];
  }

  /**
   * Les résultats d'outils, que le SDK renvoie côté « user ».
   *
   * On les colle sur leur `tool_use` plutôt que d'en faire des événements : c'est
   * l'appariement que fait déjà le parseur de transcript, et ce que `ToolCall.vue`
   * attend — un appel replié montre son résultat, pas une ligne de plus.
   */
  onUser(message: Rec): AgentUpsert[] {
    const payload = rec(message.message);
    const upserts: AgentUpsert[] = [];
    const touched = new Set<string>();
    const orphans: Block[] = [];

    for (const raw of arr(payload.content)) {
      const b = rec(raw);
      if (str(b.type) !== 'tool_result') continue;
      const toolUseId = str(b.tool_use_id);
      const result: ToolResult = {
        content: resultText(b.content),
        isError: b.is_error === true,
      };
      // Deux noms pour un même champ : le flux vivant le dit en `tool_use_result`,
      // les lignes de `.jsonl` en `toolUseResult`. On ne lisait que le second —
      // donc jamais rien en direct, alors que c'est lui qui porte le détail
      // structuré d'un `Read` ou d'un `Edit`.
      const meta = message.tool_use_result ?? message.toolUseResult;
      if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        result.meta = meta as Rec;
      }

      const at = this.toolIndex.get(toolUseId);
      const event = at ? this.byUuid.get(at.uuid) : undefined;
      const block = event?.blocks[at?.index ?? -1];
      if (event && block) {
        block.result = result;
        touched.add(event.uuid);
        continue;
      }
      // Sans appel apparié, on montre le résultat seul plutôt que de le perdre.
      orphans.push({
        kind: 'tool_result',
        toolUseId,
        content: result.content,
        isError: result.isError,
      });
    }

    for (const uuid of touched) {
      const event = this.byUuid.get(uuid);
      if (event) upserts.push({ kind: 'replace-event', event });
    }

    if (orphans.length) {
      // Un résultat sans appel apparié appartient quand même à qui l'a demandé :
      // celui d'un sous-agent doit sortir du fil principal comme son appel.
      const agentId = agentOf(message);
      const event: TranscriptEvent = {
        uuid: randomUUID(),
        parentUuid: this.lastUuid,
        kind: 'user',
        role: 'user',
        timestamp: Date.now(),
        isSidechain: agentId !== undefined,
        isMeta: true,
        origin: 'tool-result',
        blocks: orphans,
        ...(agentId ? { agentId } : {}),
      };
      this.register(event);
      upserts.push({ kind: 'append-event', event });
    }

    return upserts;
  }
}
