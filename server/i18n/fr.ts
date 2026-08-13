// Tout ce que le BFF donne à lire à l'utilisateur, en français.
//
// La charte de voix (`docs/voix.md`) vaut ici comme à l'écran : une erreur dit
// ce qu'AURA voulait faire, ce qui a échoué, et ce qui reste possible.

import diagnostics from './fr-diagnostics.ts';

export default {
  diagnostics,
  /** Refus de requête : le client a mal formé sa demande, ou vise l'absent. */
  errors: {
    notFound: 'Introuvable.',
    fileNotFound: 'Fichier introuvable.',
    entryNotFound: 'Élément introuvable.',
    backupNotFound: 'Backup introuvable.',
    planNotFound: 'Plan introuvable.',
    unknownSession: 'Session inconnue.',
    /** Le processus visé n'est plus là, ou n'a jamais été un processus Claude. */
    processNotFound:
      "Je ne trouve pas ce processus parmi ceux de Claude. Il vient peut-être de s'arrêter — rechargez la liste.",
    cannotKillSelf:
      "Je ne me termine pas moi-même. Utilisez l'extinction : elle coupe d'abord les sessions de l'Atelier.",
    paramRequired: 'Paramètre "{name}" requis.',
    paramsRequired: 'Paramètres "{first}" et "{second}" requis.',
    bodyExpected: 'Corps attendu : {shape}.',
    dateFormat: 'Dates attendues au format AAAA-MM-JJ.',
    dateOrder: '"from" doit précéder "to".',
    projectAndIdRequired: '`project` et `id` sont requis.',
    unknownRules: 'Règle inconnue : {names}.',
    invalidPreferences: 'Préférences invalides.',
    serverNameRequired: 'Nom de serveur requis.',
    workdirRequired: 'Dossier de travail requis.',
    /** Le plafond du parc : un refus qu'un geste de l'utilisateur lève aussitôt. */
    tooManySessions:
      "Je n'ouvre pas de session de plus : {max} tournent déjà, et chacune tient un processus. Fermez-en une et j'ouvre celle-ci.",
    emptyMessage: 'Message vide.',
    /** Les images jointes à un tour : refusées avant l'envoi, jamais après. */
    attachmentsShape: "Je n'ai pas reconnu les images jointes. Le tour n'a pas été envoyé.",
    attachmentType:
      "Je ne sais pas joindre une image de type {type}. Le tour n'a pas été envoyé — PNG, JPEG, GIF et WebP passent.",
    attachmentTooBig:
      "Cette image dépasse 5 Mo, ce que l'API refuse. Le tour n'a pas été envoyé ; une capture réduite passera.",
    unknownAttachment: "Cette image n'est plus en mémoire. Elle reste dans le transcript.",
    /** La sortie d'un shell de fond : le fichier est temporaire, il s'efface. */
    unknownShell: "Je ne retrouve pas la sortie de ce shell. Le fichier temporaire n'est plus là.",
    permissionModeRequired: 'Mode de permission requis.',
    purgeTargetRequired: "Je n'efface pas de sauvegarde sans savoir laquelle.",
    /** Le détail reste au journal du serveur : il porte des chemins du poste. */
    unexpected: "Je n'ai pas pu mener cette opération à son terme. Le détail est dans mon journal.",
    permissionModeUnknown: "Je n'ouvre pas de session en mode {mode}.",
    decisionExpected: 'Réponse attendue : allow, allow-always ou deny.',
    answersExpected: 'Réponses attendues, par question.',
    alreadyDecided: 'Demande déjà tranchée.',
    questionAlreadyDecided: 'Question déjà tranchée.',
    accessDenied: 'Accès refusé.',
  },

  /** Garde de chemins et écriture : les refus qui protègent `~/.claude`. */
  guard: {
    outsideRoot: 'Chemin hors du dossier géré : {path}',
    notWritable: "Je n'écris pas hors des ressources éditables : {path}",
    fileChanged: 'Le fichier a changé sur le disque depuis la prévisualisation.',
    claudeJsonChanged: '~/.claude.json a changé sur le disque depuis la prévisualisation.',
    badHost: "Je ne réponds qu'à une requête adressée à cette machine.",
    crossSite: "Je ne réponds pas à une requête venue d'un autre site.",
  },

  mcp: {
    argsMustBeStrings: 'args doit être une liste de chaînes.',
    unknownTransport: 'Transport inconnu : préciser une commande (stdio) ou une URL (http).',
  },

  /** L'Atelier : ce qu'AURA écrit dans le fil d'une session qu'elle possède. */
  agent: {
    permissionTimeout:
      "Personne n'a répondu à cette demande d'autorisation dans le quart d'heure ; je la refuse par défaut.",
    sessionStopped: 'Session arrêtée.',
    deniedFromAtelier: "Refusé depuis l'Atelier.",
    sessionEnded: "La session s'est arrêtée : {message}",
    /** Le fil vient d'être vidé : ces deux lignes sont tout ce qui reste à l'écran. */
    cleared:
      "J'ouvre une nouvelle session. Le contexte est vide ; l'échange précédent reste sur disque.",
    clearedByCommand:
      "J'ouvre une nouvelle session : /clear a vidé le contexte. L'échange précédent reste sur disque.",
    pickerUnavailable: 'Sélecteur de dossier indisponible sur {platform}.',
    noPowerShell: 'Aucun hôte PowerShell trouvé.',
  },

  hooks: {
    failed: 'Le hook a échoué (code {code}).',
    blocked: 'Le hook a empêché la poursuite du tour.',
  },

  /** Ce qui a rempli la fenêtre de contexte, tel que le rejeu le nomme. */
  context: {
    preamble: '(préambule)',
    skillNamed: 'Skill {names}',
    skillInvoked: 'Skill invoqué',
    deferredTools: 'Outils différés ({count})',
    hookBlocked: 'Hook {name} — bloqué',
    todoReminder: 'Rappel de tâches ({count})',
    turnReasoning: 'Tour {turn} — raisonnement et réponse',
  },

  /** Les zones de `~/.claude` que la page Maintenance mesure et purge. */
  storage: {
    projects: 'Transcripts de conversations',
    'file-history': 'Historique des fichiers édités',
    telemetry: 'Télémétrie en attente',
    'paste-cache': 'Cache des collages',
    'shell-snapshots': 'Snapshots de shell',
    plans: 'Plans générés',
  },
};
