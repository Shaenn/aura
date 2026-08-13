// Les Sessions actives : la liste à gauche, le flux en direct au milieu, le
// suivi à droite. Le fil lui-même parle dans `replay/`.

export default {
  title: 'Sessions actives',
  empty: 'Je ne vois aucune session Claude Code en cours sur cette machine.',
  reloadAria: 'Recharger la liste des sessions',
  filter: 'Filtrer projet ou session…',
  filterAria: 'Filtrer les sessions par projet ou par nom',
  noMatch: 'Aucune session ne correspond à votre filtre.',
  /** Ce que le lecteur d'écran entend derrière le compte d'un projet. */
  groupCount: '{n} session | {n} sessions',
  groupLive: ', {n} en activité',
  unknownStatus: '—',
  noProject: 'sans projet',
  fallbackName: 'session',

  stream: 'Flux de la session',
  pick: 'Sélectionnez une session pour suivre son flux en direct.',
  noTranscript: 'Je ne trouve pas le transcript de cette session.',
  copyPath: 'Cliquer pour copier le chemin',
  copyPathAria: 'Copier le chemin du projet : {path}',
  pathCopied: 'Chemin copié.',
  copyFailed: "Je n'ai pas pu copier : le navigateur me refuse le presse-papiers.",
  autoScroll: 'Auto-défilement',
  followLive: 'Suivre le direct',
  /** L'état du flux, en majuscules dans le badge. */
  badge: {
    live: 'LIVE',
    wait: 'AUTORISATION',
    idle: 'idle',
  },

  emptyMain:
    'Le fil principal ne porte aucun message — tout le travail est dans les pistes ci-dessus.',
  emptyTrack: "Je n'ai encore rien reçu de cette session.",
  error: 'Transcript illisible.',

  /** La session est bloquée sur une demande d'autorisation, dans son terminal. */
  permission: {
    title: 'En attente de votre autorisation',
    generic:
      "La demande (par ex. un accès à un dossier) est gérée dans le terminal de la session et n'apparaît pas côté fichiers — je n'en connais pas le détail.",
    hint: 'Répondez dans le terminal de la session : je ne clique pas « oui » à votre place, mais je peux pré-autoriser pour éviter ces interruptions ensuite.',
    allow: 'Toujours autoriser…',
    manage: 'Gérer les permissions',
  },

  aside: 'Suivi et contexte de la session',
  tasks: 'Tâches',
  panelAria: 'Contexte et ressources du projet',
  tabContext: 'Fenêtre de contexte',
  tabResources: 'Ressources',

  allow: {
    title: 'Pré-autoriser une action',
    desc: 'Ajoute une règle à {allow} de {file}. Les prochaines actions correspondant à ce motif ne demanderont plus d’autorisation. N’affecte pas la demande en cours.',
    label: 'Règle de permission',
    hint: 'ex. Bash(npm test:*) · Read · WebFetch(domain:*)',
    preview: "Prévisualiser l'écriture",
    duplicate: 'Cette règle est déjà présente dans permissions.allow.',
    added: 'Règle ajoutée à settings.json.',
    addedNote: 'Elle vaut pour les prochaines demandes, pas pour celle-ci.',
  },
};
