export default {
  title: 'Maintenance & système',
  subtitle: 'stockage · plans orphelins · processus',
  reload: 'Recharger',
  storage: 'Stockage',
  purge: 'Purger',
  protected: 'protégé',
  // Le nom de la zone de sauvegardes d'AURA. Les autres zones sont nommées par
  // le serveur, qui les découvre sur le disque.
  backupsArea: 'Sauvegardes AURA',
  orphanPlans: 'Plans sans projet',
  purged: 'Zone purgée.',
  confirm: {
    transcriptsTitle: 'Supprimer tous les transcripts',
    transcriptsMessage:
      'Je vais supprimer tout le dossier « projects » — les transcripts de toutes vos conversations. Plus aucune session ne sera rejouable, et je ne pourrai pas revenir en arrière.',
    areaMessage: 'Je vais supprimer « {area} ». Je ne pourrai pas revenir en arrière.',
    deleteAll: 'Tout supprimer',
  },
  errors: {
    storage: "Je n'ai pas pu mesurer le stockage",
    purge: "Je n'ai pas pu purger cette zone",
    processes: "Je n'ai pas pu lire les processus",
    kill: "Je n'ai pas pu terminer ce processus",
  },

  /**
   * Les processus Claude vivants.
   *
   * Les noms de rôles sont des étiquettes de données : nominaux. Seuls la
   * confirmation et le compte rendu parlent à la première personne — ce sont les
   * deux moments où AURA annonce ce qu'elle va faire, puis ce qu'elle a fait.
   */
  processes: {
    head: 'Processus Claude',
    intro:
      "Le disque ne déclare pas tout : un daemon, un hôte de pseudo-terminal ou le pont de l'extension Chrome n'écrivent aucun fichier de session. Ils apparaissent ici, et nulle part ailleurs.",
    unsupported: 'Je ne sais pas énumérer les processus sur ce système. La liste reste vide, ce qui ne veut pas dire que rien ne tourne.',
    empty: 'Je ne vois aucun processus Claude, pas même le mien — ce qui est étonnant.',
    orphan: 'orphelin',
    self: 'moi',
    kind: {
      aura: 'AURA',
      atelier: 'Atelier',
      interactive: 'Terminal',
      'bg-job': 'Job',
      'pty-host': 'Hôte de terminal',
      daemon: 'Daemon',
      'native-host': 'Pont Chrome',
      other: 'Autre',
    },
    stop: 'Terminer le processus {pid}',
    confirm: {
      title: 'Terminer ce processus ?',
      /** Le cas courant : couper un nœud entraîne toute sa descendance. */
      tree: "Je vais terminer {pid} et les {n} processus qu'il a sous lui. Couper un job sans son hôte le ferait renaître aussitôt, c'est pourquoi je prends l'arbre entier.",
      single: 'Je vais terminer le processus {pid}. Il ne redémarrera pas de lui-même.',
      ok: 'Terminer',
    },
    killed: 'Terminé : {n} processus.',
  },
  orphans: {
    intro:
      "Ces plans n'ont pas pu être rattachés au projet qui les a produits : leur session ne porte pas de {field}. C'est le seul endroit d'où on peut les lire et les supprimer — les autres plans se consultent depuis leur projet.",
    retry: 'Réessayer',
    empty: 'Aucun plan orphelin : tous les plans sont rattachés à un projet.',
    preview: 'Aperçu du plan',
    placeholder: "Sélectionnez un plan pour l'afficher ici.",
    deleteTitle: 'Supprimer ce plan ?',
    deleted: 'Plan supprimé.',
    deleteError: "Je n'ai pas pu supprimer ce plan",
  },
}
