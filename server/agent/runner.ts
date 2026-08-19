// Une session possédée par AURA : le processus, sa timeline, ses abonnés.
//
// Le runner ne connaît pas HTTP. C'est délibéré : une session ne doit pas mourir
// parce qu'on a fermé un onglet, et deux onglets doivent pouvoir regarder le même
// travail. Les requêtes poussent (`send`, `interrupt`) et s'abonnent
// (`subscribe`) ; le cycle de vie appartient au registre, pas à la requête.

import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { CLAUDE_DIR } from '../claude/paths.ts';
import { t } from '../i18n/index.ts';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentSession,
  AgentStatus,
  AgentUpsert,
  AskQuestion,
  PermissionAnswer,
  PermissionRequest,
  PromptAttachment,
  SlashCommandInfo,
} from '../../shared/agent.ts';
import type { TranscriptImage } from '../../shared/transcript.ts';
import { imageSize, isHiResVisionModel, visualTokens } from '../transcript.ts';
import { AsyncQueue } from './queue.ts';
import { ActivityTracker, type Change } from './activity.ts';
import { isOutputPath, readSince, ShellTracker } from './shells.ts';
import { Translator } from './translate.ts';
import { longPath, projectSlug } from './slug.ts';
import { PendingAnswer } from './pending.ts';
import { ASK_TOOL, createAskServer, harnessSentence, NO_ANSWER } from './ask.ts';
import { num, str } from '../json.ts';

type Rec = Record<string, unknown>;

/** Ce que l'API accepte de lire ; la route filtre sur la même liste. */
type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/** Une image telle qu'elle part dans le message, en base64. */
interface ImageBlock {
  type: 'image';
  source: { type: 'base64'; media_type: ImageMediaType; data: string };
}

// Mêmes coercions que `translate.ts`, qui les garde locales pour la même
// raison : ce qui vient du SDK n'est typé qu'à moitié.
const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Les commandes du SDK, ramenées à la forme du wire.
 *
 * Elles arrivent par deux chemins — la réponse à `supportedCommands()` et le
 * message `commands_changed` — dont un seul est typé. Le même filtre pour les
 * deux : ce qui n'a pas de nom ne se propose pas, et un indice d'argument vide
 * ne traverse pas le réseau.
 */
export function toCommands(input: unknown): SlashCommandInfo[] {
  return arr(input)
    .map((raw) => {
      const c = rec(raw);
      const name = str(c.name);
      if (!name) return null;
      const hint = str(c.argumentHint);
      const aliases = arr(c.aliases).map(String).filter(Boolean);
      return {
        name,
        description: str(c.description),
        ...(hint ? { argumentHint: hint } : {}),
        ...(aliases.length ? { aliases } : {}),
      };
    })
    .filter((c): c is SlashCommandInfo => c !== null);
}

export interface RunnerOptions {
  cwd: string;
  model?: string;
  permissionMode?: string;
  /** Identifiant SDK d'une session à prolonger. Voir `resume` plus bas. */
  resume?: string;
}

/**
 * Au bout de combien de temps une demande sans réponse se referme d'elle-même.
 *
 * Les demandes de permission n'ont pas d'échéance côté CLI : sans cela, un
 * onglet fermé au mauvais moment laisserait un processus suspendu pour toujours.
 * Un quart d'heure laisse le temps d'aller réfléchir devant le code, et refuse
 * par défaut — jamais l'inverse.
 */
const ANSWER_TIMEOUT_MS = 15 * 60_000;

/**
 * Le délai laissé au CLI pour sortir de lui-même avant qu'on le tue.
 *
 * Il y a un vrai intérêt à ce qu'il sorte seul : en partant proprement, il
 * efface son propre fichier de `~/.claude/sessions` — celui dont la page de
 * stream déduit qu'une session est en activité. Un processus tué le laisse
 * derrière lui, et le fantôme survit à sa cause.
 *
 * Cinq secondes : une session au repos rend la main en moins d'une, et attendre
 * davantage ne changerait rien à celles qui ne répondent plus du tout.
 */
const STOP_GRACE_MS = 5_000;

/**
 * Le pas minimal entre deux relevés d'activité qui ne changent qu'un compteur.
 *
 * Les tokens de raisonnement et les chronos d'outils arrivent par dizaines par
 * seconde. Les diffuser tous saturerait le canal pour un chiffre que personne ne
 * lit à cette vitesse ; un quart de seconde donne un compteur qui court sans
 * saccade. Un changement de phase, lui, ne passe jamais par ce filtre.
 */
const ACTIVITY_STEP_MS = 250;

/**
 * Le pas auquel on va voir si un shell de fond a écrit quelque chose.
 *
 * Le flux dit le départ et la fin ; il ne dit rien de l'intervalle. Or c'est
 * l'intervalle qui distingue une sentinelle qui progresse d'une sentinelle
 * coincée — `until netstat … :5001` boucle sans écrire un octet. Deux secondes :
 * un `stat` sur une poignée de fichiers, et seulement tant qu'un shell est
 * réputé vivant.
 */
const SHELL_POLL_MS = 2_000;

export class SessionRunner {
  readonly session: AgentSession;

  private readonly translator = new Translator();
  /** Ce que l'agent fait *maintenant* — un présent, pas une histoire. */
  private readonly activity = new ActivityTracker();
  private lastActivityAt = 0;
  /**
   * Ce que la fenêtre de contexte porte, relevé sur les réponses du modèle.
   *
   * Le total est **exact**, et c'est tout l'intérêt : `input + cache_read +
   * cache_creation` est la même somme que `transcript.ts` emploie pour ancrer la
   * page Contexte (voir `settleTurn`). Deux surfaces qui lisent la même session
   * ne peuvent donc pas annoncer deux remplissages différents — mais celle-ci
   * n'a aucun fichier à relire.
   *
   * Le runner **relève et ne juge pas** : ni limite, ni pourcentage, ni seuil.
   * Rapporter ce nombre à la fenêtre du modèle demande `contextLimitFor`, et
   * décider s'il mérite qu'on en parle est l'affaire de qui l'affiche.
   */
  private readonly fenetre = { tokens: 0, max: 0 };
  /**
   * La compaction qui attend son résumé, s'il y en a une.
   *
   * Le SDK envoie la frontière, puis **séparément** le résumé — un message
   * `user` marqué `isSynthetic`, dont le contenu est la conversation entière
   * réécrite. Mesuré : il suit immédiatement, et rien d'autre ne s'intercale.
   * Ce champ est ce qui relie les deux, et il ne vit qu'entre eux.
   */
  private compactionSansResume: string | null = null;
  /** Ce que la session a lancé en arrière-plan, et qui lui survit. */
  private readonly shells = new ShellTracker();
  private shellPoll: ReturnType<typeof setInterval> | null = null;
  /** Où en est la lecture du transcript, en octets. Voir `readShellEnds`. */
  private transcriptAt = 0;
  private readonly queue = new AsyncQueue<SDKUserMessage>();
  private readonly subscribers = new Set<(upsert: AgentUpsert) => void>();
  private query: Query | null = null;
  private stopped = false;
  /**
   * Le dernier geste humain reçu — pas le dernier octet du modèle.
   *
   * C'est ce que le balayeur du registre interroge pour décider qu'une session
   * est abandonnée. On ne le rafraîchit donc qu'aux gestes qui viennent d'en
   * face : ouvrir le flux, envoyer un tour, trancher une demande. Le laisser
   * bouger au rythme du SDK ferait qu'une session partie en boucle se
   * garderait elle-même en vie indéfiniment — l'inverse de ce qu'on cherche.
   */
  private touchedAt = Date.now();
  /** Le dernier tour envoyé, pour savoir d'où vient une remise à zéro. */
  private lastPrompt = '';
  /**
   * Les images collées, par identifiant, le temps de la session.
   *
   * Elles vivent en mémoire et nulle part ailleurs : le CLI les écrit lui-même
   * dans son `.jsonl`, et c'est cette copie-là que le rejeu relira. Celle-ci ne
   * sert qu'à les afficher dans le fil avant que le fichier n'existe. Elle
   * meurt avec le runner, comme le reste de la session.
   */
  private readonly attachments = new Map<string, { mediaType: string; bytes: Buffer }>();
  /**
   * De quoi couper le processus du CLI, et non seulement lui parler.
   *
   * Fermer la file d'entrée annonce « plus de messages » : un CLI au repos en
   * déduit qu'il peut sortir, un CLI en plein tour ne le lit même pas. Sans ce
   * levier, arrêter une session en cours la retirait du registre — donc la
   * rendait injoignable — pendant que son processus continuait de tourner.
   */
  private readonly aborter = new AbortController();

  /** Les demandes de permission en vol, par identifiant AURA. */
  private readonly permissions = new Map<string, PendingAnswer<PermissionResult>>();
  /** Les questions en vol. Même mécanique, autre canal : rien à autoriser ici. */
  private readonly asks = new Map<string, PendingAnswer<string>>();
  /**
   * Les règles suggérées par le SDK pour la demande en cours, gardées le temps
   * qu'un humain choisisse « toujours autoriser ». Elles ne se devinent pas :
   * c'est le SDK qui sait quelle règle couvrirait exactement ce cas.
   */
  private readonly suggestions = new Map<string, PermissionUpdate[]>();
  /**
   * L'entrée d'origine de chaque demande, qu'une autorisation doit repasser
   * telle quelle — voir `answerPermission`.
   */
  private readonly permissionInputs = new Map<string, Record<string, unknown>>();

  /**
   * La session que celle-ci prolonge, s'il y en a une.
   *
   * La reprise du SDK se fait **en place** : même `sessionId`, historique
   * rechargé, nouveaux tours ajoutés au même `.jsonl`. Il n'y a donc pas de
   * fichier à fusionner ni d'identifiant à réconcilier — c'est la même session,
   * qui recommence à respirer.
   */
  private readonly resume: string;

  constructor(options: RunnerOptions) {
    const cwd = longPath(options.cwd);
    this.resume = options.resume ?? '';
    this.session = {
      runId: randomUUID(),
      // Reprise : l'identifiant est connu d'avance, on le pré-renseigne au lieu
      // d'attendre `init`. Le transcript est donc résoluble dès la création — le
      // rejeu et les panneaux dérivés n'attendent pas le premier tour.
      sessionId: this.resume,
      cwd,
      slug: projectSlug(cwd),
      model: options.model ?? '',
      permissionMode: options.permissionMode ?? 'default',
      status: 'idle',
      startedAt: Date.now(),
      ...(this.resume ? { resumed: true } : {}),
    };
  }

  // ── Abonnement ────────────────────────────────────────────────────────────

  /**
   * S'abonner au flux. L'appelant reçoit d'abord tout l'état, puis les upserts —
   * un onglet ouvert au milieu d'un tour voit donc la même chose qu'un onglet
   * présent depuis le début.
   */
  subscribe(send: (upsert: AgentUpsert) => void): () => void {
    send({
      kind: 'snapshot',
      session: this.session,
      events: this.translator.events,
      // L'activité fait partie de l'état : un onglet ouvert au milieu d'un
      // `Bash` de trente secondes doit voir le `Bash`, pas un écran arrêté.
      activity: this.activity.snapshot(),
      // Les shells encore plus : celui qui tient un port a pu partir il y a une
      // heure, bien avant que cet onglet n'existe.
      shells: this.shells.snapshot(),
    });
    this.touchedAt = Date.now();
    this.subscribers.add(send);
    return () => {
      this.subscribers.delete(send);
      // Le départ compte autant que l'arrivée : sans cela, une session qu'on
      // regarde depuis une heure partirait à la seconde où le dernier onglet se
      // ferme, l'horloge n'ayant pas bougé depuis l'abonnement.
      this.touchedAt = Date.now();
    };
  }

  /**
   * Le fichier de sortie d'un shell, s'il est bien ce qu'il prétend être.
   *
   * La route ne connaît qu'un identifiant : c'est ici que le chemin se retrouve,
   * et `isOutputPath` le vérifie avant qu'il ne serve — il vient d'un message du
   * CLI, pas de nous.
   */
  shellOutputPath(shellId: string): string | undefined {
    const path = this.shells.outputPath(shellId);
    return path && isOutputPath(path, shellId) ? path : undefined;
  }

  /**
   * Cette session peut-elle être ramassée ?
   *
   * Trois conditions, et il les faut toutes. Personne ne regarde. Elle ne
   * travaille pas — un tour de vingt minutes n'est pas un abandon, et le CLI
   * n'écouterait de toute façon pas qu'on lui ferme son entrée. Et le dernier
   * geste humain remonte à plus loin que le délai.
   *
   * Un flux ouvert protège **sans réserve**, et c'est un choix. On sait qu'il ne
   * prouve pas qu'un humain regarde : le navigateur gèle un onglet d'arrière-plan
   * sans fermer sa socket, donc un onglet oublié garde sa session en vie. Couper
   * sous les yeux de quelqu'un qui revient d'un autre onglet coûterait pourtant
   * plus cher que cette place occupée — et la place, elle, se voit dans la liste
   * des sessions en cours et se libère d'un geste. C'est `MAX_SESSIONS` qui borne
   * le parc ; ce délai-ci ne ramasse que ce que plus rien ne relie à un écran.
   *
   * Le jugement vit ici plutôt que dans le registre parce que les trois choses
   * qu'il regarde sont privées, et doivent le rester : les exposer une à une
   * pour qu'un autre les recombine inviterait à recombiner autrement.
   */
  expired(ttlMs: number): boolean {
    if (this.stopped) return false;
    if (this.subscribers.size > 0) return false;
    if (this.session.status === 'working') return false;
    return Date.now() - this.touchedAt > ttlMs;
  }

  /**
   * Ce que la fenêtre porte, et le plus grand contexte jamais observé.
   *
   * `max` n'est pas un superlatif décoratif : c'est la **preuve** qu'attend
   * `contextLimitFor`. Un modèle à fenêtre longue s'enregistre sans son suffixe
   * `[1m]`, si bien qu'un contexte dépassant 200 k est le seul témoin certain de
   * la grande fenêtre. Une copie, pour que personne n'écrive dans le relevé.
   */
  get contextWindow(): { tokens: number; max: number } {
    return { ...this.fenetre };
  }

  private emit(upserts: AgentUpsert[]): void {
    for (const upsert of upserts) {
      for (const send of this.subscribers) {
        try {
          send(upsert);
        } catch {
          // Un abonné mort ne doit pas interrompre le tour ; sa route le retirera.
        }
      }
    }
  }

  private setStatus(status: AgentStatus, error?: string): void {
    this.session.status = status;
    if (error) this.session.error = error;
    this.emit([{ kind: 'status', status, ...(error ? { error } : {}) }]);
    // Hors travail, il n'y a plus rien en cours : sans cette remise à zéro, la
    // dernière phase resterait affichée jusqu'au tour suivant — un « Réflexion »
    // figé sous un composeur qui attend, ce qui est pire que rien.
    if (status !== 'working') this.pushActivity(this.activity.reset());
  }

  /**
   * La conversation repart à vide : on remonte un fil neuf.
   *
   * Le CLI n'écrit plus dans le même `.jsonl` — il en ouvre un autre, dont
   * l'identifiant nous est donné ici, avant même l'`init` qui suivra. Garder les
   * tours d'avant à l'écran laisserait lire une conversation dont l'agent n'a
   * plus aucun souvenir : le terminal, lui, efface. On efface donc aussi, et on
   * bascule sur la nouvelle session — c'est elle que le rejeu doit ouvrir.
   *
   * Un `snapshot` plutôt qu'un upsert dédié : c'est déjà le message qui dit
   * « voilà tout l'état », et les abonnés savent le traiter. Le rejouer suffit.
   *
   * L'identifiant du nouveau transcript ne se prend **pas** ici. Le message
   * porte bien un `new_conversation_id`, mais il ne nomme aucun fichier : un
   * `/clear` mesuré de bout en bout a annoncé `1612e772…` puis écrit dans
   * `cbc62f66…`. Seul l'`init` qui suit dit la vérité, et il arrive dans la
   * foulée — on le laisse donc faire, quitte à ce que le fil vide porte encore
   * l'ancien identifiant le temps d'un aller-retour.
   */
  private resetConversation(): void {
    this.translator.reset();
    // La fenêtre est vide dès maintenant, et non au prochain tour : sans cela,
    // qui demande son état juste après un `/clear` lirait le remplissage d'une
    // conversation qui n'existe plus. `max` survit — il ne dit rien de cette
    // conversation-ci, il prouve la taille de la fenêtre du modèle.
    this.fenetre.tokens = 0;
    // Le SDK émet aussi ce message hors `/clear` — sortie du mode plan, ouverture
    // d'une session neuve. On ne nomme donc la commande que si c'est bien elle
    // qu'on vient d'envoyer.
    const byClear = /^\/clear\b/.test(this.lastPrompt);
    this.translator.appendSystem(t(byClear ? 'agent.clearedByCommand' : 'agent.cleared'), 'warn');
    this.emit([
      {
        kind: 'snapshot',
        session: this.session,
        events: this.translator.events,
        activity: this.activity.snapshot(),
        // La conversation repart à vide, pas la machine : un serveur lancé avant
        // le `/clear` tient toujours son port, et reste donc à l'écran.
        shells: this.shells.snapshot(),
      },
    ]);
  }

  /**
   * Diffuse l'activité, tout de suite ou au pas suivant.
   *
   * Un changement de phase part sans attendre — c'est ce que l'écran montre. Un
   * simple compteur attend le pas : voir `ACTIVITY_STEP_MS`.
   */
  private pushActivity(change: Change): void {
    if (!change) return;
    const now = Date.now();
    if (change === 'minor' && now - this.lastActivityAt < ACTIVITY_STEP_MS) return;
    this.lastActivityAt = now;
    this.emit([{ kind: 'activity', activity: this.activity.snapshot() }]);
  }

  /**
   * Diffuse la liste des shells, et réarme la relecture au passage.
   *
   * Le minuteur ne tourne que s'il y a quelque chose à relire — même motif que
   * le balayeur du registre et que `watch.ts` : on arme au premier arrivant, on
   * désarme au dernier parti. Une session qui n'a rien lancé en arrière-plan ne
   * doit pas battre toutes les deux secondes pour rien.
   */
  private pushShells(): void {
    this.emit([{ kind: 'shells', shells: this.shells.snapshot() }]);
    this.armShellPoll();
  }

  private armShellPoll(): void {
    const watching = this.shells.running().length > 0;
    if (watching && !this.shellPoll) {
      // `unref` : suivre un serveur de dev ne doit jamais être la raison pour
      // laquelle Node reste en vie.
      this.shellPoll = setInterval(() => void this.readShellSizes(), SHELL_POLL_MS);
      this.shellPoll.unref();
      return;
    }
    if (!watching && this.shellPoll) {
      clearInterval(this.shellPoll);
      this.shellPoll = null;
    }
  }

  /**
   * Va voir ce que les fichiers de sortie sont devenus.
   *
   * Le seul endroit de ce chantier qui touche le disque, et il ne lit rien : un
   * `stat` donne la taille et la date, c'est-à-dire tout ce que l'écran montre.
   * Un fichier disparu ou illisible ne change simplement rien — le silence qu'il
   * laisse se lit déjà comme un silence.
   */
  private async readShellSizes(): Promise<void> {
    let changed = false;
    for (const shell of this.shells.running()) {
      const path = this.shells.outputPath(shell.id);
      if (!path) continue;
      try {
        const info = await stat(path);
        if (this.shells.observe(shell.id, info.size, info.mtimeMs)) changed = true;
      } catch {
        // Rien à dire : ni le fichier ni son absence ne sont une nouvelle.
      }
    }
    if (await this.readShellEnds()) changed = true;
    if (changed) this.emit([{ kind: 'shells', shells: this.shells.snapshot() }]);
  }

  /**
   * Les fins de shell, lues dans le transcript que le CLI écrit.
   *
   * Le SDK ne relaie pas les messages que le harnais injecte — voir
   * `ShellTracker.fromTranscript`. On lit donc le `.jsonl` de la session, et
   * seulement ce qui s'y est ajouté depuis la dernière passe : suivre un serveur
   * de dev pendant une heure ne doit pas relire son transcript entier toutes les
   * deux secondes.
   */
  private async readShellEnds(): Promise<boolean> {
    const { sessionId, slug } = this.session;
    if (!sessionId || !slug) return false;
    const path = join(CLAUDE_DIR, 'projects', slug, `${sessionId}.jsonl`);

    try {
      const { size } = await stat(path);
      if (size <= this.transcriptAt) {
        // Un fichier qui rétrécit veut dire qu'on regarde un autre transcript :
        // un `/clear` en a ouvert un neuf. On repart de son début.
        if (size < this.transcriptAt) this.transcriptAt = 0;
        return false;
      }
      // Page par page jusqu'à rattraper le fichier. La queue ne conviendrait
      // pas : au-delà de sa borne elle jette le milieu, et le milieu est
      // précisément là où une notification de fin se trouve quand le tour
      // précédent a beaucoup écrit. Une fin manquée l'est pour de bon — le
      // harnais ne la réécrit jamais.
      let changed = false;
      let cursor = this.transcriptAt;
      while (cursor < size) {
        const page = await readSince(path, cursor);
        this.transcriptAt = page.next;
        if (this.shells.fromTranscript(page.text)) changed = true;
        if (page.next <= cursor) break;
        cursor = page.next;
      }
      return changed;
    } catch {
      return false;
    }
  }

  // ── Pilotage ──────────────────────────────────────────────────────────────

  /** Pousse un tour. Le premier démarre la boucle ; les suivants la nourrissent. */
  send(prompt: string, attachments: PromptAttachment[] = []): void {
    if (this.stopped) return;
    this.touchedAt = Date.now();
    // Gardé pour une seule raison : quand la conversation se remet à zéro, c'est
    // lui qui dit si l'ordre venait de `/clear` ou d'ailleurs.
    this.lastPrompt = prompt.trimStart();
    const joined = this.keep(attachments);
    this.emit(this.translator.appendUserPrompt(prompt, joined.images));
    this.queue.push({
      type: 'user',
      // Les images avant le texte, comme le CLI les envoie : la consigne se lit
      // après ce qu'elle commente.
      message: { role: 'user', content: [...joined.blocks, { type: 'text', text: prompt }] },
      parent_tool_use_id: null,
      session_id: this.session.sessionId,
    });
    this.setStatus('working');
    // Après `setStatus`, qui ne remet à zéro que hors travail : l'attente
    // commence à l'envoi, pas au premier message du SDK.
    this.pushActivity(this.activity.beginTurn());
    this.ensureQuery();
  }

  /**
   * Range les images d'un tour et rend de quoi les montrer des deux côtés.
   *
   * Deux formes du même octet, et il faut les deux : le SDK veut le base64 dans
   * le message, le fil ne veut qu'une adresse — c'est la règle du protocole, et
   * elle vaut d'autant plus ici qu'une capture pèse plus que toute la timeline.
   * Les octets restent donc dans le runner, servis à part par la route qui porte
   * ce `runId`.
   *
   * Le coût en tokens se calcule au palier du modèle *choisi* : c'est la seule
   * chose qu'on sache au moment de l'envoi, `resolvedModel` n'arrivant qu'après
   * l'`init`. Une session ouverte sur « celui des réglages » annonce donc le
   * palier bas — sous-estimer une fois vaut mieux qu'inventer.
   */
  private keep(attachments: PromptAttachment[]): {
    blocks: ImageBlock[];
    images: TranscriptImage[];
  } {
    const blocks: ImageBlock[] = [];
    const images: TranscriptImage[] = [];
    const hiRes = isHiResVisionModel(this.session.resolvedModel ?? this.session.model);

    for (const [index, attachment] of attachments.entries()) {
      const data = attachment.data;
      const mediaType = attachment.mediaType || 'image/png';
      if (!data) continue;

      const id = randomUUID();
      this.attachments.set(id, { mediaType, bytes: Buffer.from(data, 'base64') });

      blocks.push({
        type: 'image',
        // Le type est une union fermée côté SDK ; la route l'a déjà vérifié
        // contre la même liste avant d'accepter le tour.
        source: { type: 'base64', media_type: mediaType as ImageMediaType, data },
      });
      const size = imageSize(data, mediaType);
      images.push({
        // `uuid` et `index` désignent une ligne de `.jsonl` : celle-ci n'existe
        // pas encore. C'est `url` qui porte l'adresse, et le rejeu reprendra la
        // voie normale une fois le fichier écrit.
        uuid: '',
        index,
        mediaType,
        bytes: Buffer.byteLength(data, 'base64'),
        ...(size ? { ...size, tokens: visualTokens(size.width, size.height, hiRes) } : {}),
        url: `/api/agent/sessions/${this.session.runId}/attachment?id=${id}`,
      });
    }
    return { blocks, images };
  }

  /** Les octets d'une image jointe, pour la route qui la sert. */
  attachment(id: string): { mediaType: string; bytes: Buffer } | undefined {
    return this.attachments.get(id);
  }

  /**
   * Démarre la boucle si elle ne tourne pas encore.
   *
   * Le processus du CLI ne se lance qu'ici, et le plus tard possible : une
   * session créée puis abandonnée sans un mot ne doit rien coûter. Mais tout ce
   * qui interroge le SDK — la liste des commandes, et non plus seulement l'envoi
   * d'un tour — a besoin qu'il existe : d'où ce point de passage unique plutôt
   * qu'un démarrage recopié à chaque appelant.
   *
   * `run()` assigne `this.query` avant son premier `await` : au retour, la
   * `Query` est donc déjà là.
   */
  private ensureQuery(): void {
    if (!this.query && !this.stopped) void this.run();
  }

  /**
   * Les commandes `/` que cette session accepte.
   *
   * Le SDK répond avant même le premier tour — c'est mesuré, environ une
   * seconde, le temps que le CLI démarre. Il reste la seule source qui les
   * rassemble toutes : intégrées, projet, utilisateur et Skills.
   *
   * Une liste vide plutôt qu'une erreur si le SDK ne répond pas : l'écran perd
   * son autocomplétion, la saisie à la main reste possible, et rien ne mérite
   * d'interrompre une session pour ça.
   */
  async commands(): Promise<SlashCommandInfo[]> {
    if (this.stopped) return [];
    this.ensureQuery();
    try {
      return toCommands(await this.query?.supportedCommands());
    } catch {
      return [];
    }
  }

  /**
   * Changer de mode de permission sans repartir de zéro.
   *
   * Cela n'existe qu'en entrée streamée — c'est notre cas. Tant que la boucle
   * n'a pas démarré (aucun message envoyé), il n'y a pas de `Query` à qui
   * parler : on note la valeur, et elle sera passée à `query()` au premier tour.
   * Dans les deux cas la session en garde trace, pour que l'écran dise ce qui
   * s'applique et non ce qui a été choisi à l'ouverture.
   *
   * Le modèle, lui, se change par `/model`, que le CLI exécute de son côté :
   * rien à piloter ici. L'`init` qui suit met `resolvedModel` à jour, et la
   * barre de session le montre.
   */
  async setPermissionMode(mode: string): Promise<void> {
    this.session.permissionMode = mode;
    if (this.query) await this.query.setPermissionMode(mode as never);
    this.emit([{ kind: 'session', session: this.session }]);
  }

  async interrupt(): Promise<void> {
    // `interrupt()` n'existe qu'en entrée streamée — c'est le cas ici — et rend
    // la main quand le tour est effectivement coupé.
    await this.query?.interrupt();
    this.emit(this.translator.appendSystem('Tour interrompu.', 'warn'));
    // Le `result` qui suit remettrait l'activité à zéro de toute façon ; le
    // faire ici évite qu'un « Bash · 12 s » survive au geste qui l'a coupé.
    this.pushActivity(this.activity.reset());
  }

  /**
   * Arrêt définitif : on demande, puis on impose.
   *
   * Fermer la file suffit à une session au repos — le CLI lit la fin de son
   * entrée entre deux tours et sort de lui-même, en effaçant au passage son
   * fichier de `~/.claude/sessions`. Elle ne suffit pas pendant un tour : le CLI
   * ne regarde pas son entrée tant qu'il travaille. Or le registre, lui, oublie
   * la session tout de suite — le processus deviendrait donc injoignable et
   * survivrait indéfiniment, visible dans la page de stream et comptant toujours
   * sur le quota.
   *
   * D'où le filet : passé le délai de grâce, on coupe. `grace: 0` coupe sans
   * attendre — c'est ce que fait l'extinction du serveur, qui n'a plus le temps
   * d'être patiente.
   */
  stop(grace = STOP_GRACE_MS): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.shellPoll) {
      clearInterval(this.shellPoll);
      this.shellPoll = null;
    }
    // Une demande en attente tient le SDK suspendu : il ne lirait jamais la fin
    // de la file tant qu'elle dure. On tranche avant de fermer.
    for (const pending of this.permissions.values()) {
      pending.settle({ behavior: 'deny', message: t('agent.sessionStopped') });
    }
    for (const pending of this.asks.values()) pending.settle(NO_ANSWER);
    this.queue.close();

    // Pas de boucle démarrée : il n'y a aucun processus derrière.
    if (!this.query) return;
    if (grace <= 0) {
      this.aborter.abort();
      return;
    }
    // `unref` : ce filet ne doit pas retenir Node en vie. À l'extinction on
    // passe `grace: 0`, donc il n'y a rien à attendre de ce minuteur-là.
    setTimeout(() => {
      if (this.query) this.aborter.abort();
    }, grace).unref();
  }

  // ── Les deux ponts vers l'humain ──────────────────────────────────────────

  /**
   * Le pont de permission : on suspend le SDK sur une promesse, on pousse la
   * demande en SSE, et un `POST` la dénoue.
   *
   * Notre propre outil de question ne passe pas par là : il n'y a rien à
   * autoriser, et le faire arbitrer deux fois demanderait deux gestes pour une
   * seule décision.
   */
  private async decide(
    toolName: string,
    input: Record<string, unknown>,
    options: Rec,
  ): Promise<PermissionResult> {
    if (toolName === ASK_TOOL) return { behavior: 'allow', updatedInput: input };

    const id = randomUUID();
    const request: PermissionRequest = {
      id,
      toolName,
      input,
      toolUseId: str(options.toolUseID),
      // `title` est le libellé à privilégier d'après le SDK, mais arrive souvent
      // vide : on garde les trois niveaux de repli plutôt qu'un seul.
      title: str(options.title) || undefined,
      displayName: str(options.displayName) || undefined,
      description: str(options.description) || undefined,
      blockedPath: str(options.blockedPath) || undefined,
      decisionReason: str(options.decisionReason) || undefined,
      askedAt: Date.now(),
    };

    this.permissionInputs.set(id, input);
    const suggestions = Array.isArray(options.suggestions)
      ? (options.suggestions as PermissionUpdate[])
      : [];
    if (suggestions.length) this.suggestions.set(id, suggestions);

    const pending = new PendingAnswer<PermissionResult>(ANSWER_TIMEOUT_MS, () => {
      this.emit([{ kind: 'permission-settled', id, answer: 'deny' }]);
      return { behavior: 'deny', message: t('agent.permissionTimeout') };
    });
    this.permissions.set(id, pending);
    this.emit([{ kind: 'permission-request', request }]);

    // Une interruption pendant l'attente doit libérer le tour, pas le figer.
    const signal = options.signal;
    if (signal instanceof AbortSignal) {
      signal.addEventListener(
        'abort',
        () => {
          if (pending.settle({ behavior: 'deny', message: 'Tour interrompu.' })) {
            this.emit([{ kind: 'permission-settled', id, answer: 'deny' }]);
          }
        },
        { once: true },
      );
    }

    try {
      return await pending.promise;
    } finally {
      this.permissions.delete(id);
      this.suggestions.delete(id);
      this.permissionInputs.delete(id);
    }
  }

  /** Répond à une demande de permission. Rend `false` si elle n'est plus en vol. */
  answerPermission(id: string, answer: PermissionAnswer, reason?: string): boolean {
    const pending = this.permissions.get(id);
    if (!pending?.pending) return false;
    this.touchedAt = Date.now();

    // `updatedInput` est obligatoire à l'exécution alors que le type le dit
    // optionnel : sans lui, la validation du CLI rejette la réponse et l'outil
    // ne s'exécute jamais. On repasse l'entrée d'origine, inchangée.
    const input = this.permissionInputs.get(id) ?? {};
    const result: PermissionResult =
      answer === 'deny'
        ? { behavior: 'deny', message: reason?.trim() || t('agent.deniedFromAtelier') }
        : {
            behavior: 'allow',
            updatedInput: input,
            ...(answer === 'allow-always' && this.suggestions.has(id)
              ? { updatedPermissions: this.suggestions.get(id) }
              : {}),
          };

    if (!pending.settle(result)) return false;
    this.emit([{ kind: 'permission-settled', id, answer }]);
    return true;
  }

  /** Suspend l'outil de question jusqu'à ce qu'un formulaire réponde. */
  private askHuman(questions: AskQuestion[]): Promise<string> {
    const id = randomUUID();
    const pending = new PendingAnswer<string>(ANSWER_TIMEOUT_MS, () => {
      this.emit([{ kind: 'ask-settled', id }]);
      return NO_ANSWER;
    });
    this.asks.set(id, pending);
    this.emit([{ kind: 'ask-request', request: { id, questions, askedAt: Date.now() } }]);
    return pending.promise.finally(() => this.asks.delete(id));
  }

  /** Répond à une question. Rend `false` si elle n'est plus en vol. */
  answerAsk(id: string, answers: Record<string, string>, notes?: string): boolean {
    const pending = this.asks.get(id);
    if (!pending?.pending) return false;
    this.touchedAt = Date.now();
    if (!pending.settle(harnessSentence(answers, notes))) return false;
    this.emit([{ kind: 'ask-settled', id }]);
    return true;
  }

  // ── La boucle ─────────────────────────────────────────────────────────────

  private async run(): Promise<void> {
    this.query = query({
      prompt: this.queue,
      options: {
        cwd: this.session.cwd,
        // Le fil qui relie `stop()` au processus. Sans lui, l'arrêt n'est qu'une
        // demande polie que seul un CLI au repos écoute.
        abortController: this.aborter,
        includePartialMessages: true,
        permissionMode: this.session.permissionMode as never,
        ...(this.session.model ? { model: this.session.model } : {}),
        ...(this.resume ? { resume: this.resume } : {}),
        // On exécute nous-mêmes les questions à l'utilisateur : voir `ask.ts`.
        mcpServers: { atelier: createAskServer((questions) => this.askHuman(questions)) },
        toolAliases: { AskUserQuestion: ASK_TOOL },
        canUseTool: (toolName, input, options) => this.decide(toolName, input, options),
      },
    });

    try {
      for await (const message of this.query) {
        this.consume(message);
      }
      this.setStatus('ended');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.emit(this.translator.appendSystem(t('agent.sessionEnded', { message }), 'error'));
      this.setStatus('failed', message);
    } finally {
      this.query = null;
    }
  }

  /**
   * Le contexte d'une réponse, tel que le modèle l'a facturé.
   *
   * Les trois termes, et pas seulement `input_tokens` : ce qui est relu du cache
   * occupe la fenêtre exactement comme ce qui ne l'est pas — c'est le prix qui
   * diffère, pas la place. Ne compter que `input_tokens` sur une session bien
   * cachée annoncerait quelques milliers de tokens là où la fenêtre en porte
   * cent mille.
   *
   * Un `usage` absent ou vide ne remet rien à zéro : une réponse sans relevé ne
   * prouve pas que la fenêtre s'est vidée, elle ne dit rien.
   */
  private releveFenetre(usage: Rec): void {
    const total =
      num(usage.input_tokens) +
      num(usage.cache_read_input_tokens) +
      num(usage.cache_creation_input_tokens);
    if (total <= 0) return;
    this.fenetre.tokens = total;
    if (total > this.fenetre.max) this.fenetre.max = total;
  }

  /**
   * Le message qui suit une compaction porte-t-il son résumé ?
   *
   * Trois conditions, et les trois comptent. Une compaction doit attendre —
   * sinon le message est un tour ordinaire. `isSynthetic` distingue le résumé du
   * `<local-command-stdout>` qui le suit, lequel porte `isReplay` et ne dit que
   * « Compacted ». Et le contenu doit être une **chaîne** : un tour ordinaire
   * porte une liste de blocs, jamais du texte nu.
   *
   * Rendre `true` consomme le message : il n'a rien à faire dans le fil sous sa
   * forme brute — c'est la conversation entière réécrite, et `onUser` n'en
   * tirerait de toute façon rien, n'y cherchant que des résultats d'outils.
   */
  private capteResume(message: Rec): boolean {
    const uuid = this.compactionSansResume;
    if (!uuid || message.isSynthetic !== true) return false;
    this.compactionSansResume = null;

    const contenu = rec(message.message).content;
    if (typeof contenu !== 'string') return false;
    this.emit(this.translator.attachSummary(uuid, contenu));
    return true;
  }

  private consume(message: Rec): void {
    // Avant tout dispatch : la plupart des messages qui disent où en est l'agent
    // ne produisent aucun événement de timeline, et sortaient donc par le
    // `default` sans laisser de trace.
    this.pushActivity(this.activity.consume(message));
    if (this.shells.consume(message)) this.pushShells();

    switch (str(message.type)) {
      case 'system':
        if (str(message.subtype) === 'init') {
          // `init` n'arrive qu'après lecture du premier prompt : c'est ici, et
          // pas à la création, qu'on apprend l'identifiant du SDK — donc où le
          // lien vers le rejeu devient possible.
          this.session.sessionId = str(message.session_id);
          // `resolvedModel` et non `model` : le choix de l'utilisateur reste ce
          // qu'il a choisi, l'identifiant employé se dit à côté.
          this.session.resolvedModel = str(message.model) || undefined;
          this.emit([{ kind: 'session', session: this.session }]);
          return;
        }
        // Une compaction est le seul autre message `system` qui change ce que le
        // lecteur voit : la fenêtre se vide, et sans cette ligne le fil n'en
        // disait rien avant le tour suivant. Les autres sous-types ne portent que
        // de la machinerie, et sortent par le bas comme avant.
        if (str(message.subtype) === 'compact_boundary') {
          // Une compaction change la fenêtre sans qu'aucune réponse ne le dise :
          // sans ces deux lignes, le relevé resterait celui d'avant jusqu'au
          // tour suivant — c'est-à-dire faux précisément au moment où l'on
          // regarde. `pre_tokens` est par ailleurs le plus grand contexte que
          // cette session ait porté, et souvent le premier à dépasser 200 k :
          // c'est ici, plus tôt que partout ailleurs, que la grande fenêtre se
          // prouve.
          const meta = rec(message.compact_metadata);
          const avant = num(meta.pre_tokens);
          if (avant > this.fenetre.max) this.fenetre.max = avant;
          this.fenetre.tokens = num(meta.post_tokens);
          const upserts = this.translator.appendCompaction(message);
          const premier = upserts[0];
          this.compactionSansResume = premier?.kind === 'append-event' ? premier.event.uuid : null;
          this.emit(upserts);
          return;
        }
        // Le CLI pousse la liste entière dès qu'elle bouge — un Skill découvert
        // en cours de route, par exemple. On la relaie telle quelle : le client
        // remplace la sienne, il n'a rien à réconcilier.
        if (str(message.subtype) === 'commands_changed') {
          this.emit([{ kind: 'commands', commands: toCommands(message.commands) }]);
        }
        return;
      case 'conversation_reset':
        this.resetConversation();
        return;
      case 'stream_event':
        this.emit(this.translator.onStreamEvent(message));
        return;
      case 'assistant':
        this.releveFenetre(rec(rec(message.message).usage));
        this.emit(this.translator.onAssistant(message));
        return;
      case 'user':
        if (this.capteResume(message)) return;
        this.emit(this.translator.onUser(message));
        return;
      case 'result':
        // Le tour est fini ; la session, elle, reste ouverte pour le suivant.
        this.setStatus('waiting');
        return;
      default:
        return;
    }
  }
}
