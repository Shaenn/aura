// Les processus Claude vivants, tels que Maintenance les montre.
//
// C'est la seule forme du protocole qui ne vienne pas de `~/.claude` : elle
// décrit ce que le système exécute, pas ce que le disque déclare. La distinction
// est tout l'intérêt de la surface — un daemon et un hôte de pseudo-terminal
// n'écrivent aucun fichier de session, et restaient donc invisibles.

/**
 * D'où vient un processus.
 *
 * L'ordre de cette union est celui de la reconnaissance : `aura` et `atelier` se
 * décident sur la parenté, qui ne trompe pas ; les autres sur la ligne de
 * commande. `other` reste pour ce qui mentionne Claude sans qu'on sache dire quoi
 * — mieux vaut le montrer sans le nommer que le taire.
 */
export type ClaudeProcessKind =
  /** Le BFF lui-même. Il ne se tue pas, il s'éteint. */
  | 'aura'
  /** Une session lancée par AURA, via le SDK. */
  | 'atelier'
  /** Une session ouverte dans un terminal. */
  | 'interactive'
  /** Un job lancé en arrière-plan depuis une session. */
  | 'bg-job'
  /** L'hôte de pseudo-terminal d'un job : c'est lui qui le relance si on le coupe seul. */
  | 'pty-host'
  /** Le daemon qui héberge les jobs, et qui survit à la session qui l'a lancé. */
  | 'daemon'
  /** Le pont de messagerie native de l'extension Chrome. */
  | 'native-host'
  | 'other';

export interface ClaudeProcess {
  pid: number;
  /** `0` quand le parent n'est pas connu. */
  ppid: number;
  kind: ClaudeProcessKind;
  /** La ligne de commande, écourtée : elle sert à reconnaître, pas à rejouer. */
  command: string;
  /** Début du processus, quand le système le donne. */
  startedAt?: number;
  /**
   * Le parent n'existe plus.
   *
   * Le cas qui a motivé cet écran : un daemon dont la session d'origine est morte
   * continue d'accepter des jobs, sans que rien ne le rattache plus à personne.
   */
  orphan: boolean;
  /** Le processus d'AURA : jamais tuable depuis ici. */
  self: boolean;

  // ── Ce que le fichier de session ajoute, quand il y en a un ───────────────
  /** Vide pour un daemon, un pty-host ou le native host : ils n'en écrivent pas. */
  sessionId?: string;
  name?: string;
  cwd?: string;
  /** `busy`, `idle`, `waiting` — tel que le CLI l'écrit. */
  status?: string;
}

export interface ProcessList {
  processes: ClaudeProcess[];
  /**
   * La plateforme ne sait pas énumérer ses processus.
   *
   * L'écran le dit franchement plutôt que d'afficher une liste vide, qui se
   * lirait comme « rien ne tourne » — le contraire de ce qu'on sait.
   */
  unsupported?: boolean;
}

export interface KillProcessBody {
  pid: number;
  /**
   * Couper aussi toute la descendance.
   *
   * Presque toujours ce qu'on veut : un job coupé sans son hôte de
   * pseudo-terminal renaît aussitôt sous un nouveau PID.
   */
  descendants?: boolean;
}

export interface KillProcessResult {
  /** Les PID effectivement terminés, dans l'ordre où ils l'ont été. */
  killed: number[];
}
