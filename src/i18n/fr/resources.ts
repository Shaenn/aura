// Les textes du visualiseur de ressources, partagés par les écrans Agents et
// Skills. Ce que chaque écran dit en propre vit dans `pages/<écran>.ts`.

export default {
  panelTitle: 'Ressources du projet',
  reloadAria: 'Recharger les ressources du projet',
  copyContent: 'Copier le contenu',
  noDescription: 'Aucune description dans le frontmatter.',
  deleted: 'Fichier supprimé.',
  deletedNote: "J'en ai gardé une sauvegarde.",
  // Les catégories rangent l'inventaire d'un projet. `CATEGORY_META` garde leur
  // ordre et leur icône ; le mot vient d'ici.
  categories: {
    agents: 'Agents',
    skills: 'Skills',
    commands: 'Commandes',
    rules: 'Règles',
    memory: 'Mémoire (CLAUDE.md)',
    settings: 'Réglages',
    docs: 'Docs',
    tools: 'Outils',
    other: 'Autres',
  },
  projectMemory: 'Mémoire projet',
  repoDocs: 'Documents du dépôt',
  outsideClaude: 'hors .claude',
  plans: 'Plans',
  // L'inclusion d'un dossier : AURA mesure et propose, l'utilisateur tranche.
  // D'où le « je » de l'intro — c'est un constat, pas un affichage annoncé.
  include: {
    action: 'Inclure un dossier',
    title: 'Inclure un dossier',
    intro:
      'Je compte les documents de chaque dossier du projet. Le nombre ne dit pas lesquels vous servent — un dossier de gabarits ressemble à un dossier de documentation.',
    empty: 'Je ne trouve aucun dossier portant des documents dans ce projet.',
    docs: 'aucun document | 1 document | {count} documents',
    apply: 'Appliquer',
    selected: 'aucun dossier retenu | 1 dossier retenu | {count} dossiers retenus',
    toggleAria: 'Inclure le dossier {folder}',
    coveredAria: 'Déjà inclus par le dossier {folder}',
    removeAria: 'Retirer le dossier {folder} de l’arbre',
  },
  noClaudeDir: 'Aucun dossier {dir} à la source de ce projet (ou chemin source inconnu).',
  emptyClaudeDir: 'Dossier {dir} présent mais sans ressource indexée.',
  errors: {
    list: "Je n'ai pas pu lire cette liste",
    delete: "Je n'ai pas pu supprimer ce fichier",
    read: 'Lecture impossible.',
    unreadable: 'Inventaire illisible.',
  },
};
