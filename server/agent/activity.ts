// Ce que l'agent est en train de faire, à la seconde.
//
// Le SDK dit beaucoup plus que ce que la timeline sait montrer. Un tour, vu du
// fil, c'est deux transitions : « au travail », puis « à vous ». Vu du flux,
// c'est une requête en vol, un raisonnement muet, un `Bash` qui met douze
// secondes, un compactage, parfois une nouvelle tentative après un 529. Aucun de
// ces moments ne produit d'événement de transcript — ils ne laissent donc aucune
// trace à l'écran, et une session qui travaille ressemble à une session bloquée.
//
// Ce suiveur ne construit rien de durable : il n'a qu'un présent, qu'il remplace.
// C'est la raison pour laquelle il vit à côté du `Translator` et non dedans —
// l'un écrit une histoire, l'autre tient un instant.

import type { ActiveTool, AgentActivity, AgentPhase } from '../../shared/agent.ts';
import { num, str } from '../json.ts';

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * L'ampleur d'un changement, qui décide s'il part tout de suite.
 *
 * `major` change ce qui est écrit à l'écran — la phase, la liste des outils. Il
 * doit partir sans attendre. `minor` ne bouge qu'un compteur : quelques dizaines
 * de trames par seconde s'y pressent, et les diffuser toutes remplirait le canal
 * SSE pour un chiffre que l'œil ne suit pas à cette vitesse.
 */
export type Change = 'major' | 'minor' | null;

export class ActivityTracker {
  private phase: AgentPhase | null = null;
  private since = 0;
  private turnStartedAt = 0;
  private thinkingTokens = 0;
  private outputTokens = 0;
  private retry: AgentActivity['retry'];
  /** Les outils en vol, dans l'ordre de départ. */
  private readonly tools = new Map<string, ActiveTool>();

  snapshot(): AgentActivity {
    return {
      phase: this.phase,
      since: this.since,
      turnStartedAt: this.turnStartedAt,
      ...(this.thinkingTokens ? { thinkingTokens: this.thinkingTokens } : {}),
      ...(this.outputTokens ? { outputTokens: this.outputTokens } : {}),
      tools: [...this.tools.values()],
      ...(this.retry ? { retry: this.retry } : {}),
    };
  }

  /**
   * Un tour part.
   *
   * Le SDK ne dit rien pendant la seconde qui suit l'envoi — il lit son entrée,
   * monte la requête, l'expédie. C'était le dernier trou de l'écran : on venait
   * d'appuyer sur Entrée et rien ne bougeait. L'attente commence donc ici, sans
   * attendre qu'un message vienne la confirmer.
   */
  beginTurn(): Change {
    return this.setPhase('requesting');
  }

  /** Tout s'arrête : fin de tour, ou fin de session. */
  reset(): Change {
    if (!this.phase && !this.tools.size) return null;
    this.phase = null;
    this.since = Date.now();
    this.turnStartedAt = 0;
    this.thinkingTokens = 0;
    this.outputTokens = 0;
    this.retry = undefined;
    this.tools.clear();
    return 'major';
  }

  private setPhase(phase: AgentPhase | null): Change {
    if (this.phase === phase) return null;
    // Le tour commence à la première phase et ne se rouvre pas ensuite : c'est
    // ce qui distingue son chrono de celui de la phase.
    if (phase && !this.turnStartedAt) this.turnStartedAt = Date.now();
    this.phase = phase;
    this.since = Date.now();
    if (phase !== 'retrying') this.retry = undefined;
    return 'major';
  }

  /**
   * Lit un message du SDK et rend ce qu'il a changé.
   *
   * Le suiveur voit les mêmes messages que le `Translator` sans partager son
   * état : ce qu'il en retient — quel outil est parti, lequel est revenu — est
   * une poignée de champs, moins coûteuse à relire qu'à faire circuler.
   */
  consume(message: Rec): Change {
    switch (str(message.type)) {
      case 'system':
        return this.onSystem(message);
      case 'stream_event':
        return this.onStreamEvent(rec(message.event));
      case 'assistant':
        return this.onAssistant(rec(message.message));
      case 'user':
        return this.onUser(rec(message.message));
      case 'tool_progress':
        return this.onToolProgress(message);
      case 'result':
        return this.reset();
      default:
        return null;
    }
  }

  private onSystem(message: Rec): Change {
    switch (str(message.subtype)) {
      case 'status':
        // `status` porte l'état du CLI, pas celui du tour : `requesting` pendant
        // qu'un outil tourne voudrait dire « je repasserai à l'API après », ce
        // qui n'est pas ce qu'on regarde. L'outil en vol prime.
        switch (str(message.status)) {
          case 'requesting':
            return this.tools.size ? null : this.setPhase('requesting');
          case 'compacting':
            return this.setPhase('compacting');
          default:
            // Un statut vide clôt ce qu'il avait ouvert, et rien d'autre : le
            // texte qui s'écrit, lui, n'est pas fini pour autant.
            return this.phase === 'requesting' || this.phase === 'compacting'
              ? this.setPhase(null)
              : null;
        }

      case 'thinking_tokens': {
        // Le seul signe de vie d'un raisonnement masqué : l'API n'y envoie que
        // des pings, et le SDK en tire cette estimation.
        this.thinkingTokens = num(message.estimated_tokens);
        return this.setPhase('thinking') ?? 'minor';
      }

      case 'api_retry':
        this.retry = {
          attempt: num(message.attempt),
          maxRetries: num(message.max_retries),
          delayMs: num(message.retry_delay_ms),
        };
        // La phase peut déjà valoir `retrying` d'une tentative précédente : on
        // force l'envoi, sinon le compteur de tentatives resterait au premier.
        this.setPhase('retrying');
        return 'major';

      default:
        return null;
    }
  }

  private onStreamEvent(event: Rec): Change {
    if (str(event.type) !== 'content_block_start') return null;
    const block = rec(event.content_block);
    switch (str(block.type)) {
      case 'thinking':
      case 'redacted_thinking':
        // Le compteur repart : l'estimation du SDK porte sur le bloc en cours.
        this.thinkingTokens = 0;
        return this.setPhase('thinking');
      case 'text':
        return this.setPhase('writing');
      case 'tool_use':
        // L'appel s'écrit encore, il ne s'exécute pas : la phase reste
        // `writing`. Mais sa carte est déjà à l'écran, et sans cette
        // inscription-là elle s'annoncerait « sans résultat » pendant la
        // seconde où l'appel se compose — soit exactement le mot qu'on
        // cherchait à faire disparaître.
        return this.track(str(block.id), str(block.name));
      default:
        return null;
    }
  }

  /** Inscrit un outil dans les partants, s'il n'y est pas déjà. */
  private track(id: string, name: string): Change {
    if (!id || this.tools.has(id)) return null;
    this.tools.set(id, { id, name, startedAt: Date.now() });
    return 'major';
  }

  private onAssistant(payload: Rec): Change {
    // Le `↓` du CLI : ce que le tour a fait écrire au modèle jusqu'ici. On
    // cumule, parce qu'un tour qui appelle six outils est six réponses.
    const output = num(rec(payload.usage).output_tokens);
    const counted = output > 0;
    if (counted) this.outputTokens += output;

    let calls = 0;
    for (const raw of arr(payload.content)) {
      const block = rec(raw);
      if (str(block.type) !== 'tool_use') continue;
      calls++;
      // Le plus souvent déjà inscrit par le flux ; ce passage-ci rattrape le
      // cas où les événements partiels n'ont pas précédé la réponse complète.
      this.track(str(block.id), str(block.name));
    }
    // La réponse est close : ce qui n'était qu'écrit part maintenant s'exécuter.
    if (calls) {
      this.setPhase('tool');
      return 'major';
    }
    return counted ? 'minor' : null;
  }

  private onUser(payload: Rec): Change {
    let ended = false;
    for (const raw of arr(payload.content)) {
      const block = rec(raw);
      if (str(block.type) !== 'tool_result') continue;
      if (this.tools.delete(str(block.tool_use_id))) ended = true;
    }
    if (!ended) return null;
    // Le dernier résultat rendu, le tour repart vers l'API. Le dire évite le
    // trou noir entre « l'outil a fini » et « le texte reprend ».
    if (!this.tools.size) this.setPhase('requesting');
    return 'major';
  }

  private onToolProgress(message: Rec): Change {
    // Les outils d'un sous-agent ne sont pas montrés ici : l'appel `Agent` qui
    // les a lancés figure déjà dans la liste, et l'empiler avec sa descendance
    // ferait défiler une ligne qui ne parle plus du tour qu'on regarde.
    if (str(message.parent_tool_use_id)) return null;
    const id = str(message.tool_use_id);
    const elapsed = num(message.elapsed_time_seconds);
    const known = this.tools.get(id);
    if (known) {
      known.elapsedSeconds = elapsed;
      return 'minor';
    }
    if (!id) return null;
    // Inconnu : un outil dont la réponse complète n'est pas encore passée. On
    // l'ajoute plutôt que d'attendre — c'est justement le long à s'exécuter.
    this.tools.set(id, {
      id,
      name: str(message.tool_name),
      startedAt: Date.now() - elapsed * 1000,
      elapsedSeconds: elapsed,
    });
    this.setPhase('tool');
    return 'major';
  }
}
