// Le fil lui-même : les pistes, les cartes de tour, les bulles, les bornes.
// Ce que les cartes d'outil disent vit dans `tools.ts`, la reconstruction du
// contexte dans `context.ts`, la décomposition du coût dans `cost.ts`.

export default {
  /** La barre de pistes, en haut du flux. */
  tracks: {
    aria: 'Pistes de la session',
    main: 'Principal',
    /** Ce que le lecteur d'écran entend en plus du nom visible. */
    mainCount: '{n} message | {n} messages',
    subagent: 'Sous-agent',
    turns: '{n} tour | {n} tours',
    id: 'identifiant {id}',
    status: {
      running: 'en cours',
      completed: 'terminé',
      failed: 'en échec',
      unknown: 'état inconnu',
    },
  },

  /** Les segments que la compaction découpe, et le décompte des hooks muets. */
  timeline: {
    phase: 'Phase {n}',
    compacted: '{before} → {after} tokens',
    silent: '{n} exécution de hook sans effet · {total} au total | {n} exécutions de hook sans effet · {total} au total',
    silentNote: "Ces hooks se sont exécutés sans rien renvoyer à Claude ni signaler d'erreur.",
  },

  /** Ce qui n'est ni un tour ni un message : les événements sans carte à eux. */
  loose: {
    summary: 'Résumé',
    system: 'Système',
    systemSub: 'Système · {sub}',
  },

  /** La carte d'une réponse de Claude. */
  turn: {
    tools: '{n} outil | {n} outils',
    thinking: 'raisonnement',
    windowTip: '⧉ Fenêtre de contexte à la fin de la carte : {n}',
    deltaTip: '+ {n} ajoutés sur la carte',
    outputTip: '↑ {n} tokens générés sur ce tour',
    mark: 'Tour {n}',
    injected: '{n} injecté | {n} injectés',
    redacted: 'Raisonnement — non conservé dans le transcript',
    image: '🖼 [image]',
    /** Ce qu'un événement sans bulle propre annonce de lui-même. */
    sysMeta: 'Système (contexte)',
    sysReport: 'Rapport de sous-agent',
    sysToAgent: 'Message reçu par l’agent',
    sysOrigin: 'Système · {origin}',
  },

  /** Le repli d'un bloc de raisonnement. */
  thinking: {
    title: 'Raisonnement',
  },

  /** La courbe de remplissage, sous l'en-tête du panneau de contexte. */
  fillCurve: {
    caption: 'Remplissage sur {turns} tours — pic {peak} / {limit}{compactions}',
    compactions: '· {n} compaction | · {n} compactions',
  },

  /** La bulle d'un message humain. */
  user: {
    you: 'Vous',
    brief: 'Consigne envoyée à l’agent',
    copyMine: 'Copier votre message',
    copyBrief: 'Copier la consigne',
    queued: 'en cours de tour',
    queuedHint: 'Écrit pendant que l’agent travaillait : le CLI l’a mis en file, puis le lui a transmis au milieu de sa réponse.',
    imageLabel: 'Image jointe au message',
    imageMissing: '🖼 [image jointe]',
  },

  /** Ce qui se passe pendant que le fil ne bouge pas encore. */
  live: {
    label: 'Tour en cours',
    hint: "Claude Code n'écrit un tour qu'une fois résolu. Je n'en aurai donc la suite qu'à la fin, d'un seul bloc.",
  },

  images: {
    unloadable: '{n} image — non chargeable depuis cette vue | {n} images — non chargeables depuis cette vue',
    byTool: 'Image rendue par {tool}',
    alt: 'Image du transcript',
    open: 'Ouvrir',
    full: 'Image du transcript, en pleine taille',
  },

  hook: {
    status: {
      ok: 'exécuté',
      context: 'contexte injecté',
      error: 'échec',
      blocked: 'tour interrompu',
    },
    injected: 'Contexte injecté dans le fil de Claude',
    blocked: 'Tour interrompu',
    error: 'Erreur',
    command: 'Commande',
    stderr: "Sortie d'erreur",
    exit: 'code {n}',
  },

  /** Une question posée à l'utilisateur, relue au rejeu. */
  ask: {
    free: 'réponse libre :',
    note: 'note :',
    rejected: '— question écartée —',
    pending: '— en attente de réponse —',
    none: '— aucune question posée —',
    afk: 'Sans réponse après {n} s — la suite a été décidée sans elle.',
  },

  compaction: {
    title: 'Contexte compacté',
    auto: 'automatique — la fenêtre était pleine',
    manual: 'manuelle — /compact',
    pending: 'La taille d’après n’est pas encore connue',
    unit: 'tokens',
    /** `amount` porte le gras ; les deux autres parts sont vides ou non. */
    removed: '{amount} retirés du contexte{percent}{duration}',
    removedAmount: '{n} tokens',
    removedPercent: '({p})',
    removedIn: ', en {d}',
    note: 'Claude ne voit plus le détail de ce qui précède, seulement son résumé.',
    pendingNote:
      'Claude ne voit plus le détail de ce qui précède, seulement son résumé. La taille de la nouvelle fenêtre sera connue à la fin du tour.',
    summary: 'Résumé conservé après la compaction',
    summaryTokens: '~{n} tokens',
  },

  planMode: {
    enter: 'Mode plan',
    exit: 'Sortie du mode plan',
    reentry: 'Retour au plan',
    scope: '{n} tour | {n} tours',
    whatExit: 'Le modèle peut de nouveau écrire.',
    whatReentry: 'La session reprend le plan déjà commencé.',
    whatResume: "Lecture seule : le modèle reprend un plan existant, il n'écrit rien d'autre.",
    whatNew: "Lecture seule : le modèle explore et propose un plan, il n'écrit rien d'autre.",
  },

  command: {
    output: 'Sortie de la commande',
  },

  skillDoc: {
    loaded: 'chargé dans le contexte',
    lines: '{n} ligne | {n} lignes',
    origin: {
      bundled: 'fourni avec le CLI',
      plugin: 'extension',
      project: 'projet',
      personal: 'personnel',
    },
  },

  tasks: {
    pastOne: 'Plan précédent',
    pastMany: 'Plans précédents',
    planN: 'Plan {n}',
    planTasks: 'Tâches du plan {n}',
    currentPlan: 'Tâches du plan en cours',
    sessionTasks: 'Tâches de la session',
    planAria: 'Plan de travail posé',
    planLabel: 'plan de travail',
  },

  /**
   * Les commandes lancées en arrière-plan.
   *
   * Le panneau nomme des choses, il ne s'adresse à personne : pas de « je » ici.
   * `lastWrite` est la seule ligne qui porte un jugement, et elle le porte par
   * le chiffre — un silence de quatre minutes se lit sans qu'on le commente.
   */
  shells: {
    title: 'Arrière-plan',
    past: 'Une commande terminée | {count} commandes terminées',
    goto: "Voir l'appel dans le fil",
    done: 'terminé',
    failed: 'terminé, code {code}',
    stopped: 'arrêté',
    lastWrite: 'rien écrit depuis {ago}',
    noOutput: 'aucune sortie',
    loading: 'Lecture de la sortie…',
    empty: "Ce shell n'a encore rien écrit.",
    skipped: '[… {n} octets plus haut]',
  },

  report: {
    empty: "Aucun rapport renvoyé par l'agent.",
    details: 'Détails techniques',
    file: 'fichier',
  },

  teammate: {
    unknown: 'un équipier',
    empty: 'Message vide.',
    notice: {
      idle_notification: "N'a plus rien en cours.",
      shutdown_request: "Demande à s'arrêter.",
      shutdown_approved: 'Arrêt approuvé.',
      teammate_terminated: "S'est arrêté.",
    },
  },
}
