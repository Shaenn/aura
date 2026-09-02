// Le protocole de l'Atelier, partagé mot pour mot entre le BFF qui l'émet et la
// SPA qui l'applique.
//
// Même raison d'être que `shared/transcript.ts` : ce sont des types de fil. Le
// front n'invente pas la forme des messages, il applique des upserts sur une
// liste de `TranscriptEvent` — exactement le modèle que la timeline de rejeu
// sait déjà rendre.

import type { TranscriptEvent } from './transcript.ts'

/** Où en est un runner, tel que l'UI doit le montrer. */
export type AgentStatus =
  /** Créé, rien envoyé encore. */
  | 'idle'
  /** Un tour est en cours côté modèle. */
  | 'working'
  /** Le tour est fini, on attend l'humain. */
  | 'waiting'
  /** Le runner est arrêté ; plus rien n'arrivera. */
  | 'ended'
  /** Le runner s'est arrêté sur une erreur ; `error` la porte. */
  | 'failed'

/**
 * Une demande de permission en attente d'un humain.
 *
 * Ce que le SDK nous donne est plus riche que le nom de l'outil : on transporte
 * de quoi écrire un bandeau sans reconstruire la phrase à la main. `title` est
 * documenté comme le libellé à privilégier mais arrive souvent `null` — d'où le
 * repli sur `displayName` puis sur `toolName`.
 */
export interface PermissionRequest {
  /** Identifiant de la demande côté AURA ; c'est lui qu'on renvoie pour répondre. */
  id: string
  toolName: string
  input: Record<string, unknown>
  toolUseId: string
  title?: string
  displayName?: string
  description?: string
  blockedPath?: string
  decisionReason?: string
  /** Horodatage d'émission, pour afficher l'attente. */
  askedAt: number
}

/** Ce qu'un humain peut répondre à une demande de permission. */
export type PermissionAnswer =
  | 'allow'
  /** Autoriser, et ne plus demander pour ce motif de la session. */
  | 'allow-always'
  | 'deny'

/**
 * Une question posée par l'agent, en attente d'un formulaire.
 *
 * Ce n'est pas une permission : rien n'est à autoriser, il y a une réponse à
 * donner. D'où un canal distinct — et, côté serveur, un outil qu'AURA exécute
 * lui-même plutôt qu'un outil qu'il laisse passer.
 */
export interface AskRequest {
  id: string
  questions: AskQuestion[]
  askedAt: number
}

export interface AskQuestion {
  question: string
  header: string
  multiSelect?: boolean
  /** `preview` : la maquette à comparer — souvent de l'ASCII sur plusieurs lignes. */
  options: { label: string; description: string; preview?: string }[]
}

/**
 * Une commande `/` proposée à la saisie.
 *
 * La liste vient du SDK et non d'une lecture de `~/.claude/commands` : elle
 * couvre d'un coup les commandes intégrées du CLI, celles du projet, celles de
 * l'utilisateur et les Skills — que le disque, lui, ne rassemble nulle part.
 * Elle peut changer en cours de session, d'où l'upsert `commands`.
 */
export interface SlashCommandInfo {
  /** Sans la barre oblique : `compact`, `context`, `code-review`… */
  name: string
  description: string
  /** Ce que la commande attend après son nom. Souvent vide. */
  argumentHint?: string
  /** Les autres noms qui mènent ici — `/cost` résout vers `/usage`. */
  aliases?: string[]
}

/**
 * Ce qui occupe l'agent à l'instant même.
 *
 * `AgentStatus` dit dans quel régime est la session — il ne bouge que deux fois
 * par tour. Entre les deux, une minute peut passer sans qu'un octet n'arrive :
 * une requête en vol, un raisonnement muet, un `Bash` qui compile. Le CLI montre
 * tout cela ; nous, faute de canal, nous montrions un écran figé. C'est ce que
 * cette phase comble — elle ne se déduit d'aucun événement de la timeline, le
 * SDK est le seul à la connaître.
 */
export type AgentPhase =
  /** Requête API en vol : rien n'est encore revenu du modèle. */
  | 'requesting'
  /** Un bloc de raisonnement s'écrit — visible ou masqué. */
  | 'thinking'
  /** Une réponse s'écrit, token par token. */
  | 'writing'
  /** Un ou plusieurs outils s'exécutent. */
  | 'tool'
  /** Le contexte se compacte. */
  | 'compacting'
  /** L'API a refusé et le SDK repasse après un délai. */
  | 'retrying'

/** Un outil parti et pas encore revenu. */
export interface ActiveTool {
  /** Le `tool_use_id`, qui relie la ligne d'activité à sa carte dans le fil. */
  id: string
  name: string
  startedAt: number
  /** La durée que le SDK mesure lui-même, quand il la signale. */
  elapsedSeconds?: number
}

export interface AgentActivity {
  /** `null` quand rien n'est en cours — entre deux tours, ou session finie. */
  phase: AgentPhase | null
  /** Le début de la phase, pour un chrono que le client fait avancer seul. */
  since: number
  /**
   * Le début du tour, et non de la phase. `0` au repos.
   *
   * C'est la durée que le CLI affiche, et la seule qu'on se demande vraiment :
   * une phase dure trois secondes et se remplace, un tour dure dix minutes. Un
   * chrono qui repart sans cesse ne répond pas à « depuis combien de temps ça
   * mouline ? » — il ne fait que prouver que ça bouge encore.
   */
  turnStartedAt: number
  /**
   * L'estimation de tokens de raisonnement du SDK. Approximative et assumée
   * comme telle : elle sert à montrer que ça avance, pas à facturer.
   */
  thinkingTokens?: number
  /**
   * Les tokens de sortie accumulés sur le tour — le `↓` du CLI.
   *
   * Relevé sur les messages `assistant` complets : il avance donc par paliers, à
   * chaque réponse close, là où `thinkingTokens` court pendant un raisonnement.
   * Les deux se complètent plus qu'ils ne se doublent.
   */
  outputTokens?: number
  /** Les outils en vol, du plus ancien au plus récent. */
  tools: ActiveTool[]
  /** La tentative en cours, quand `phase` vaut `retrying`. */
  retry?: { attempt: number; maxRetries: number; delayMs: number }
}

/** Rien en cours : l'état de repos, et la valeur initiale du front. */
export const IDLE_ACTIVITY: AgentActivity = { phase: null, since: 0, turnStartedAt: 0, tools: [] }

/**
 * Une commande que la session a lancée en arrière-plan, et qui lui survit.
 *
 * `ActiveTool` dit ce qui occupe l'agent maintenant ; celle-ci dit ce qu'il a
 * laissé derrière lui. La distinction est tout l'objet de cette forme : un
 * `pnpm dev:all` quitte la liste des outils en vol au bout de deux secondes —
 * l'appel a rendu la main — et continue pourtant de tenir un port pendant une
 * heure. Rien à l'écran ne le disait.
 */
export interface BackgroundShell {
  /** L'identifiant que le CLI attribue — `btt4xdjh2`. Le même des deux bouts. */
  id: string
  /** Le `tool_use_id`, qui relie la ligne à sa carte dans le fil. */
  toolUseId: string
  command: string
  description?: string
  startedAt: number
  /**
   * `done` vient de la notification du harnais, `killed` de l'appel d'arrêt —
   * jamais d'une déduction.
   *
   * Les deux sources sont disjointes, et c'est mesuré : un shell coupé n'a
   * produit aucune `<task-notification>`, contre deux par shell arrivé à son
   * terme. Sa seule trace est le `tool_use` `TaskStop` du flux assistant.
   *
   * Reste le shell tué hors de la session — depuis Maintenance, ou du dehors :
   * celui-là, personne ne nous en préviendra, et il reste `running`. C'est
   * assumé : `lastWriteAt` montre le silence, et un silence qui dure se lit.
   */
  state: 'running' | 'killed' | 'done'
  /** Le code de sortie, tel que la notification le donne. */
  exitCode?: number
  endedAt?: number
  /**
   * La dernière fois que le fichier de sortie a grossi.
   *
   * La seule chose qui distingue une sentinelle qui attend sagement d'une
   * sentinelle dont la condition n'arrivera jamais — `until netstat … :5001`
   * boucle en silence, sans rien écrire, et rien d'autre ne le trahit.
   */
  lastWriteAt?: number
  /** Taille du fichier de sortie, qui sert de curseur à la lecture. */
  size?: number
}

/** Un morceau de la sortie d'un shell, rendu à partir d'un curseur. */
export interface ShellOutput {
  text: string
  /** L'octet où ce morceau commence — le curseur à repasser pour la suite. */
  from: number
  /** La taille du fichier à cet instant, qui sert de curseur au prochain appel. */
  size: number
  /**
   * Les octets sautés entre le curseur demandé et celui servi.
   *
   * Le panneau le dit plutôt que de faire croire à une sortie continue : un
   * serveur bavard laissé de côté dix minutes en écrit plus que la borne.
   */
  skipped?: number
}

/**
 * Ce que le serveur pousse au navigateur. Trois formes suffisent à tenir une
 * timeline à jour : on ajoute un événement, on le remplace en entier, ou on
 * allonge un texte qui streame.
 *
 * Remplacer plutôt que rustiner : un événement pèse quelques kilo-octets, et un
 * patch partiel se désynchronise dès qu'un message arrive dans le désordre.
 */
export type AgentUpsert =
  /** Premier message d'un flux : tout l'état, pour qu'un onglet ouvert tard rattrape. */
  | {
      kind: 'snapshot'
      session: AgentSession
      events: TranscriptEvent[]
      activity: AgentActivity
      shells: BackgroundShell[]
      /**
       * Ce qui attend un humain, et qui n'était pas rejoué.
       *
       * Une demande émise pendant une coupure du flux ne revenait jamais : le
       * bandeau n'apparaissait pas, et l'agent restait suspendu jusqu'au refus
       * du garde-fou, un quart d'heure plus tard. Dans l'autre sens, une demande
       * réglée pendant la coupure laissait un bandeau fantôme, dont le clic ne
       * pouvait plus rien dénouer.
       *
       * Elles appartiennent donc à l'état au même titre que l'activité : c'est
       * la liste entière qui remplace celle du client, vide comprise.
       */
      permissions: PermissionRequest[]
      asks: AskRequest[]
    }
  | { kind: 'session'; session: AgentSession }
  | { kind: 'append-event'; event: TranscriptEvent }
  | { kind: 'replace-event'; event: TranscriptEvent }
  /** Allonge le texte d'un bloc en cours de frappe. */
  | { kind: 'text-delta'; uuid: string; blockIndex: number; text: string }
  /** L'entrée d'un outil telle qu'elle se compose, réparée pour être lisible. */
  | { kind: 'tool-input'; uuid: string; blockIndex: number; input: Record<string, unknown> }
  /** Ce que l'agent fait maintenant. Émis souvent, sans rien changer au fil. */
  | { kind: 'activity'; activity: AgentActivity }
  /**
   * Ce que la session a lancé en arrière-plan. La liste part entière et
   * remplace la précédente : elle compte quelques entrées, et un delta se
   * désynchroniserait pour rien.
   */
  | { kind: 'shells'; shells: BackgroundShell[] }
  | { kind: 'status'; status: AgentStatus; error?: string }
  | { kind: 'permission-request'; request: PermissionRequest }
  | { kind: 'permission-settled'; id: string; answer: PermissionAnswer }
  | { kind: 'ask-request'; request: AskRequest }
  | { kind: 'ask-settled'; id: string }
  /**
   * La liste des commandes, poussée quand le CLI la change en cours de route —
   * un Skill découvert dans un sous-dossier, par exemple. Elle remplace la
   * précédente en entier ; il n'y a pas de delta à appliquer.
   */
  | { kind: 'commands'; commands: SlashCommandInfo[] }

/** L'identité d'une session pilotée, telle que le front l'affiche et la route. */
export interface AgentSession {
  /**
   * L'identifiant d'AURA, connu dès la création.
   *
   * Distinct du `sessionId` du SDK, qui n'arrive qu'avec le message `init` —
   * c'est-à-dire, en entrée streamée, seulement après lecture du premier
   * prompt. Router sur le `sessionId` obligerait le front à attendre ; il route
   * donc sur celui-ci, toujours disponible.
   */
  runId: string
  /** L'identifiant du SDK, vide tant que `init` n'est pas passé. */
  sessionId: string
  /** Dossier de travail, résolu en chemin long. */
  cwd: string
  /** Slug du projet où le transcript s'écrit ; permet le lien vers le rejeu. */
  slug: string
  /**
   * Le modèle **choisi** : `''` veut dire « celui des réglages ».
   *
   * Distinct de `resolvedModel` à dessein. Écraser le choix par l'identifiant
   * que le SDK finit par employer ferait afficher `claude-opus-5[1m]` là où
   * l'utilisateur avait demandé « celui des réglages » — une valeur qui ne
   * figure dans aucune option, et qui donne à croire qu'il a choisi ce modèle-là.
   */
  model: string
  /** Ce que le SDK emploie réellement, connu après `init`. Pour l'afficher. */
  resolvedModel?: string
  permissionMode: string
  status: AgentStatus
  error?: string
  startedAt: number
  /** La session prolonge un transcript existant plutôt que d'en ouvrir un. */
  resumed?: boolean
}

export interface CreateSessionBody {
  cwd: string
  model?: string
  permissionMode?: string
  /** Premier tour, envoyé sans attendre `init`. Facultatif. */
  prompt?: string
  /** Les images du premier tour. Sans `prompt`, elles ne partent pas. */
  attachments?: PromptAttachment[]
  /**
   * Identifiant SDK d'une session à reprendre.
   *
   * La reprise se fait **en place** : même `sessionId`, l'historique est
   * rechargé et les nouveaux tours s'ajoutent au même `.jsonl`. C'est ce qui
   * rend un lien d'Atelier durable — le registre, lui, meurt avec le serveur.
   */
  resume?: string
}

export interface SetPermissionModeBody {
  permissionMode: string
}

/**
 * Les modes de permission qu'AURA ouvre — la liste fait foi des deux côtés.
 *
 * Tous laissent un humain dans la boucle, à des degrés différents. Ce qui est
 * écarté l'en retire : `bypassPermissions` laisse tout passer sans rien
 * demander, `dontAsk` refuse tout ce qui n'est pas pré-autorisé sans demander
 * non plus. Dans les deux cas le bandeau de permission ne s'affiche jamais.
 *
 * Le front n'offrait déjà que ces quatre modes ; le BFF, lui, acceptait la
 * chaîne qu'on lui passait et la repassait au SDK. Un `POST` avec
 * `bypassPermissions` ouvrait donc une session qui exécute sans jamais
 * demander — l'écran d'à côté ne le proposait pas, ce qui ne l'empêchait pas
 * d'exister. La liste vit ici pour que les deux ne puissent plus diverger.
 */
export const PERMISSION_MODES = ['default', 'auto', 'acceptEdits', 'plan'] as const

export type PermissionMode = (typeof PERMISSION_MODES)[number]

/** Ce mode est-il l'un de ceux qu'AURA ouvre ? */
export function isPermissionMode(value: string): value is PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(value)
}

/**
 * Une image jointe à un tour, telle qu'elle monte du navigateur.
 *
 * C'est le seul endroit du protocole où des octets voyagent en clair : partout
 * ailleurs on ne transporte que des adresses. Ici il n'y a pas le choix — le
 * presse-papier ne donne pas de fichier sur le disque, seulement des octets, et
 * personne d'autre que le navigateur ne les a.
 */
export interface PromptAttachment {
  /** `image/png`, `image/jpeg`, `image/gif` — ce que le presse-papier déclare. */
  mediaType: string
  /** Le base64 nu : sans le préfixe `data:…;base64,`. */
  data: string
}

export interface SendBody {
  prompt: string
  /** Les images collées, dans l'ordre où elles ont été ajoutées. */
  attachments?: PromptAttachment[]
}

export interface RespondPermissionBody {
  answer: PermissionAnswer
  /** Motif du refus, montré au modèle. Ignoré pour une autorisation. */
  reason?: string
}

export interface RespondAskBody {
  /**
   * La réponse retenue, par question. Une question à choix multiple porte ses
   * libellés joints par `, ` — c'est la forme que le harness produit, et donc
   * celle que le visualiseur sait relire.
   */
  answers: Record<string, string>
  /** Texte libre ajouté par l'utilisateur, quand il en a écrit un. */
  notes?: string
}
