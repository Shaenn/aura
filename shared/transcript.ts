// The replay model, shared verbatim between the BFF that builds it and the SPA
// that renders it.
//
// These are wire types: the shape of what `/api/projects/:slug/transcript`
// returns. They live outside `server/` and `src/` so that neither side can
// quietly drift from the other — a field renamed here breaks both typechecks at
// once, which is the whole point.

import type { Compaction, SessionContext } from './context.ts';

/**
 * Une image portée par une ligne du transcript — capture Playwright, `Read` d'un
 * PNG, pièce jointe de l'utilisateur.
 *
 * Les octets ne voyagent pas ici : une seule session peut porter quelques dizaines
 * d'images, dont le base64 pèse plusieurs fois le transcript entier. On ne transporte
 * donc que l'adresse — la ligne, et le rang de l'image dans cette ligne — et le
 * navigateur va chercher chaque image à part, une fois, en cache immuable.
 */
export interface TranscriptImage {
  /** `uuid` de la ligne JSONL qui la porte. */
  uuid: string;
  /** Rang de l'image dans cette ligne, dans l'ordre du fichier (0-based). */
  index: number;
  /** Run de sous-agent d'où vient la ligne ; absent pour le fil principal. */
  agentId?: string;
  /** `image/png`, `image/jpeg`, … tel que déclaré par la source. */
  mediaType: string;
  /** Taille des octets décodés, pour l'annoncer avant de les charger. */
  bytes: number;
  /** Dimensions lues dans l'en-tête du fichier ; absentes si illisibles. */
  width?: number;
  height?: number;
  /**
   * Ce que l'image a coûté au contexte, en tokens visuels.
   *
   * Absent quand les dimensions n'ont pas pu être lues : mieux vaut ne rien
   * annoncer qu'annoncer un chiffre inventé.
   */
  tokens?: number;
  /**
   * L'adresse d'où tirer les octets, quand ils ne sont pas dans un transcript.
   *
   * Le rejeu n'en a pas besoin : `uuid` et `index` désignent une ligne d'un
   * `.jsonl`, et le front sait en construire l'adresse. Une image que l'on vient
   * de coller dans l'Atelier n'est nulle part sur le disque — le CLI ne l'y
   * écrira qu'au premier tour, sous un `uuid` qui n'est pas encore le nôtre. Le
   * serveur donne donc l'adresse directement, et la reprend au rejeu.
   */
  url?: string;
}

export interface ToolResult {
  content: string;
  isError: boolean;
  /** Les images rendues par l'outil, quand il en a produit. */
  images?: TranscriptImage[];
  /**
   * Le résultat *structuré* que le harness écrit à côté du texte
   * (`toolUseResult` sur la ligne), quand l'outil en a un qui dit quelque chose
   * de plus que sa phrase — l'URL publiée d'un Artifact, par exemple.
   *
   * Absent pour la quasi-totalité des outils, et c'est voulu : voir la liste
   * blanche dans `server/transcript.ts`, qui explique pourquoi on ne le garde
   * pas systématiquement.
   */
  meta?: Record<string, unknown>;
}

/**
 * One execution of a configured hook, as recorded by the harness.
 *
 * The transcript spreads a single run over up to two lines — a `hook_success`
 * carrying the command and timing, then a `hook_additional_context` repeating
 * the text it injected — plus the `*_hook_summary` system rows for lifecycle
 * hooks. They are merged into one `HookRun`.
 */
export interface HookRun {
  /** Lifecycle event: `PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, … */
  event: string;
  /** Full name as logged, e.g. `PreToolUse:Bash`. */
  name: string;
  /** Shell command the harness ran, when it recorded one. */
  command?: string;
  /**
   * `context` — the hook fed text back into Claude's context; `error` — it
   * failed without stopping the turn; `blocked` — it stopped the turn.
   */
  status: 'ok' | 'context' | 'error' | 'blocked';
  exitCode?: number;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  /** Text the hook injected back into Claude's context. */
  context?: string[];
  /** Failure message, for `error` / `blocked`. */
  error?: string;
  /** The tool call this hook fired around, when it fired around one. */
  toolUseId?: string;
}

/** Silent runs of one command, folded together (they carry no information). */
export interface SilentHookGroup {
  command: string;
  count: number;
  durationMs: number;
}

/**
 * Hooks that ran, produced nothing, and failed at nothing. Overwhelmingly the
 * common case (a `Stop` hook firing every turn), so they are kept out of the
 * timeline and surfaced as a single foldable tally.
 */
export interface SilentHooks {
  count: number;
  durationMs: number;
  groups: SilentHookGroup[];
}

export interface Block {
  kind:
    | 'text'
    | 'thinking'
    | 'tool_use'
    | 'tool_result'
    | 'image'
    | 'task_notification'
    /**
     * Un message reçu d'un équipier. Le harnais le livre dans une ligne `user`
     * ordinaire, enveloppé d'un `<teammate-message>` : sans lecture, la balise
     * s'affiche telle quelle et l'Atelier attribue à l'humain des mots qu'il n'a
     * jamais écrits. `from` est l'expéditeur, `color` la teinte que le CLI lui a
     * donnée, `summary` l'objet, `text` le corps.
     */
    | 'teammate_message'
    /** A `/command` the user ran in the CLI. `name` is `/compact`, `text` its args. */
    | 'slash_command';
  /** text / thinking / task_notification result (markdown) */
  text?: string;
  /** thinking: the transcript kept only the signature, `text` is empty */
  redacted?: boolean;
  /** tool_use */
  id?: string;
  name?: string;
  input?: unknown;
  /** result paired to a tool_use (attached during parsing) */
  result?: ToolResult | null;
  /** hooks that fired around this tool call, in the order they ran */
  hooks?: HookRun[];
  /** tool_result (standalone, when it couldn't be paired) */
  toolUseId?: string;
  content?: string;
  isError?: boolean;
  /** image (bloc de premier niveau) et tool_result orphelin : leurs images */
  images?: TranscriptImage[];
  /** task_notification */
  summary?: string;
  status?: string;
  note?: string;
  outputFile?: string;
  /**
   * task_notification: the run being reported on. `taskId` is the `agentId` of
   * the sub-agent; `agentType` names it, resolved from its sidecar during
   * parsing, and absent when the run left nothing to name it by.
   */
  taskId?: string;
  agentType?: string;
  /** teammate_message : l'équipier qui écrit, et la teinte que le CLI lui donne. */
  from?: string;
  color?: string;
  /**
   * teammate_message : le corps n'est pas toujours un message. 39 des 97 blocs
   * du parc portent un signal de service — un équipier devenu disponible, une
   * demande d'arrêt, un agent qui se termine — sous forme de JSON. `notice` en
   * porte le type, et `text` reste vide.
   */
  notice?: string;
}

/**
 * Token tallies of one API response.
 *
 * Claude Code writes one JSONL row per content block, and `output_tokens` grows
 * across the rows of a single response as it streams. A `Usage` is therefore the
 * per-field maximum over those rows, never the value of any one row, and at most
 * one event of a response carries it.
 */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

// ── Runs de sous-agents ──────────────────────────────────────────────────────

/**
 * Où en est un run de sous-agent, pour autant que le transcript l'atteste.
 *
 * `unknown` n'est pas une erreur de lecture : c'est un run dont on a tous les
 * tours, mais dont rien ne dit s'il est fini — ni notification de tâche, ni
 * appel `Agent` retrouvé pour l'apparier. On refuse d'en déduire la fin de son
 * dernier horodatage : un agent bloqué depuis dix minutes et un agent terminé
 * depuis dix minutes écrivent exactement la même chose, c'est-à-dire rien.
 */
export type SubagentRunStatus = 'running' | 'completed' | 'failed' | 'unknown';

/**
 * Un run de sous-agent, vu de l'extérieur : de quoi en faire une piste — le
 * nommer, le colorer, dire où il en est, retrouver ses tours.
 *
 * Ce n'est pas le sidecar lui-même : les lignes du run sont déjà dans `events`,
 * marquées de son `agentId`. Ce résumé porte ce que la boucle d'événements ne
 * peut pas dire, parce que cela se lit sur le disque (`toolUseId`,
 * `description`, `spawnDepth`) ou ne se sait qu'après coup (le statut).
 *
 * Attention en comparant deux écrans : `turns` a ici la définition de
 * `TranscriptStats.assistantTurns` — des réponses API dédupées par `message.id`
 * — alors que le `turns` du diagnostic (`SubagentCost`) compte des cellules de
 * coût. Deux nombres proches, deux questions différentes.
 */
export interface SubagentRunSummary {
  /** Identifie le run. Une piste = un `agentId` ; c'est aussi la clé de couleur. */
  agentId: string;
  /** L'agent qui a tourné, quand quelque chose sur le disque le nomme. */
  agentType?: string;
  /** La description d'une ligne passée à l'appel `Agent`, s'il y en avait une. */
  description?: string;
  /** L'appel `Agent` auquel ce run répond. Absent = run non apparié. */
  toolUseId?: string;
  /** 1 pour un agent lancé par la session ; plus quand un agent en a lancé un autre. */
  spawnDepth: number;
  status: SubagentRunStatus;
  /** Première ligne écrite par le run. */
  startedAt: number;
  /**
   * Dernière ligne écrite par le run. Se lit « actif jusqu'à » tant que le run
   * tourne, et jamais « terminé à » : c'est `endedAt` qui l'affirme.
   */
  lastActivityAt: number;
  /**
   * Fin avérée, égale à `lastActivityAt`. Absent tant que `status` n'est pas
   * terminal — mieux vaut ne pas dater une fin que d'en inventer une.
   */
  endedAt?: number;
  /** Réponses API du run, dédupées par `message.id`. */
  turns: number;
  /** Événements du run dans `events` : exactement ce que sa piste affichera. */
  events: number;
  /** Ce que le run a consommé, sommé sur les relevés de ses réponses. */
  tokens: Usage;
}

/**
 * Une borne du mode plan : le moment où la session change de régime.
 *
 * Le mode plan n'est pas un outil, c'est un état — tant qu'il dure, le modèle
 * n'a pas le droit d'écrire. Le transcript le trace par des `attachment`, et
 * l'outil `EnterPlanMode` n'en couvre presque rien : **129 des 142 entrées du
 * parc se font au clavier**, sans appel. L'asymétrie avec `ExitPlanMode`
 * (196 appels) tient à ce que le modèle n'a pas de clavier — l'entrée est un
 * geste humain, la sortie une demande d'autorisation.
 */
export interface PlanModeMark {
  /**
   * `enter` ouvre le régime, `exit` le ferme. `reentry` est la reprise d'un
   * plan déjà commencé : le CLI la note à part (45 fois au parc), et elle ne
   * rouvre rien qui ne le soit déjà.
   */
  phase: 'enter' | 'reentry' | 'exit';
  /** Le fichier où le plan s'écrit. Présent sur les trois formes. */
  planFilePath: string;
  /**
   * Le fichier existait-il déjà ? À l'entrée, `false` 93 fois sur 142 — un plan
   * neuf — contre `true` 49 fois, un plan repris. Absent sur `reentry`, que le
   * CLI n'assortit d'aucun drapeau.
   */
  planExists?: boolean;
  /**
   * Réponses de l'assistant passées dans ce régime, comptées jusqu'à la borne
   * de sortie. Posé sur `enter` seulement. Médiane 11 au parc, maximum 118.
   * Absent quand le mode reste ouvert à la fin de la session — 13 cas, où rien
   * ne dit combien de tours il aurait encore couverts.
   */
  turns?: number;
}

export interface TranscriptEvent {
  uuid: string;
  parentUuid: string | null;
  /** Coarse kind used by the UI to pick a renderer. */
  kind:
    'user' | 'assistant' | 'system' | 'summary' | 'attachment' | 'hook' | 'compaction' | 'planmode';
  role?: string;
  timestamp: number;
  isSidechain: boolean;
  isMeta: boolean;
  /**
   * Sub-agent events only. `agentId` names the run (one per spawned agent);
   * `agentType` is the agent that produced it — `Explore`, `code-reviewer`, …
   * `agentType` is absent when nothing on disk could name the run; `agentId`
   * is always set on a sidechain event, so it can stand in as the color key.
   */
  agentId?: string;
  agentType?: string;
  /**
   * For `user` events, where the message actually came from. Genuine typed
   * prompts are `'human'`; anything else (`'task-notification'`, `'hook'`, …)
   * is injected by the harness and must not be rendered as "you".
   *
   * `'queued'` est humain aussi : c'est ce qui a été tapé pendant que l'agent
   * travaillait, mis en file par le CLI et dépilé au milieu du tour. Même
   * auteur, autre moment — et ce moment explique pourquoi la réponse en cours
   * change de cap.
   */
  origin?: string;
  model?: string;
  usage?: Usage;
  gitBranch?: string;
  /** System messages carry a subtype + level. */
  subtype?: string;
  level?: string;
  /** `hook` events: the run that could not be tied to a tool call. */
  hook?: HookRun;
  /** `compaction` events: the exact tallies of the window that was collapsed. */
  compaction?: Compaction;
  /** `planmode` events: the boundary itself. */
  planMode?: PlanModeMark;
  /**
   * Cet événement s'est-il joué en mode plan ? Posé sur tout ce qui tombe entre
   * une borne d'ouverture et sa fermeture — 2 102 réponses d'assistant au parc.
   * C'est la seule chose qui distingue à l'écran une exploration contrainte
   * d'un travail ordinaire : sans elle, cent dix-huit tours sans écriture ne
   * disent pas que l'écriture était interdite.
   */
  inPlanMode?: boolean;
  /**
   * Le skill dont cette ligne est le manuel — un appel `Skill` la fait suivre
   * du mode d'emploi entier, injecté en ligne `user` méta. Le nom vient de
   * l'appel, retrouvé par `sourceToolUseID` ; le texte, lui, ne le porte pas
   * toujours. Absent partout ailleurs.
   */
  skill?: string;
  blocks: Block[];
}

export interface TranscriptStats {
  events: number;
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreate: number;
  durationMs: number;
  startedAt: number;
  endedAt: number;
  models: string[];
  tools: Record<string, number>;
  /**
   * Cost in US dollars at Anthropic's API *list price* — not what a Pro/Max
   * subscription billed, which is a flat monthly fee. Summed per response at each
   * one's own model and rate. `null` when nothing could be priced (a local model,
   * `<synthetic>`); a bare `0` is a genuinely free session.
   */
  costUsd: number | null;
  /** A response ran on a model we have no price for: `costUsd` is a floor. */
  costPartial: boolean;
}

/** '' = untitled; `custom` was typed by the user, `ai` was generated. */
export type TitleSource = '' | 'custom' | 'ai';

export interface ParsedTranscript {
  id: string;
  sessionId: string;
  cwd: string;
  gitBranch: string;
  version: string;
  firstPrompt: string;
  hasSidechain: boolean;
  /**
   * Les runs de sous-agents, du plus ancien au plus récent ; vide quand il n'y
   * en a pas.
   *
   * Invariant : les événements d'un run sont exactement ceux de `events` qui
   * portent son `agentId`, et tout `agentId` vu dans `events` a son run ici.
   * C'est ce qui permet de partitionner le flux en pistes sans rien perdre.
   */
  subagents: SubagentRunSummary[];
  /** Session title, '' when never named. Prefer it over `firstPrompt` in the UI. */
  title: string;
  titleSource: TitleSource;
  stats: TranscriptStats;
  silentHooks: SilentHooks;
  events: TranscriptEvent[];
  /** What filled the window, turn by turn. Totals exact, breakdown estimated. */
  context: SessionContext;
}

/**
 * Ce qu'une session a consommé, tel que le relevé de diagnostic le mesure.
 *
 * Ces chiffres ne sont pas recalculés pour la liste : ils viennent de
 * `SessionSignal`, la même source que la page Diagnostic et que la session
 * ouverte. Une session listée peut n'en avoir aucun — un fichier ouvert puis
 * abandonné ne porte aucun tour, et le relevé l'écarte.
 */
export interface SessionMetrics {
  /** Les tours réellement pris par l'humain, hors échos d'outil et injections. */
  userTurns: number;
  /** Réponses API du fil principal, dédupées. Jamais un nombre de lignes. */
  turns: number;
  /** Entrée + sortie + cache, sous-agents compris. */
  tokens: number;
  /** Dollars au prix catalogue API — pas ce qu'un abonnement a facturé. */
  costUsd: number;
  /** Un modèle de la session n'a pas de tarif connu : `costUsd` est un plancher. */
  costPartial: boolean;
  /** Du premier au dernier horodatage observé, sidecars compris. */
  durationMs: number;
}

/** Cheap per-file summary, for listing a project's sessions. */
export interface TranscriptSummary {
  id: string;
  mtime: number;
  size: number;
  firstPrompt: string;
  gitBranch: string;
  hasSidechain: boolean;
  /** Session title, or '' when the session was never named. */
  title: string;
  /** Where `title` came from — the UI marks a user-chosen name differently. */
  titleSource: TitleSource;
  /** Relevé de coût de la session. Absent tant qu'elle n'a rien consommé. */
  metrics?: SessionMetrics;
}
