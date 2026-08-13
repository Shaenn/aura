export default {
  sub: 'Mémoire globale (CLAUDE.md), index et mémoires structurées par projet.',
  global: 'Globale',
  globalHint: 'instructions permanentes',
  indexHint: 'index',
  projectScope: 'Projet',
  newIn: 'Nouvelle mémoire dans {project}',
  newBadge: 'nouveau',
  pick: 'Choisissez une mémoire pour la lire.',
  fields: {
    name: 'Nom',
    description: 'Description',
    type: 'Type',
    content: 'Contenu',
    file: 'Fichier',
  },
  viewAria: 'Affichage du contenu',
  viewEdit: 'Éditer',
  viewPreview: 'Aperçu',
  emptyBody: 'Contenu vide.',
  deleteTitle: 'Supprimer cette mémoire ?',
  deleteNote: 'Une sauvegarde horodatée est prise avant la suppression.',
  // Les quatre types du format de mémoire. Ce sont des explications, pas des
  // libellés : la clé `user` reste `user` dans le fichier.
  types: {
    user: "Qui est l'utilisateur : rôle, expertise, préférences durables.",
    feedback:
      'Consignes sur la façon de travailler — corrections comme approches validées. Explique le pourquoi.',
    project:
      "Travail en cours, objectifs ou contraintes non déductibles du code ni de l'historique git. Dates en absolu.",
    reference: 'Pointeurs vers des ressources externes : URLs, dashboards, tickets.',
  },
  discard: 'Abandonner les modifications non appliquées ?',
  discardNote: 'Je ne les ai pas écrites sur le disque : quitter cet écran les perd.',
  discardConfirm: 'Abandonner',
  namePlaceholder: 'seuils-calibres',
  nameRequired: 'Nommez la mémoire : son nom devient celui du fichier.',
  nameTaken: 'Une mémoire porte déjà ce nom.',
  /** Le fil d'Ariane d'une mémoire neuve, tant que le nom n'est pas saisi. */
  unnamed: 'sans nom',
  targetNotFound: 'Je ne trouve pas la cible {target}.',
  indexUpdated: 'Index MEMORY.md mis à jour.',
  deleted: 'Mémoire supprimée.',
  deletedNote: "J'en ai gardé une sauvegarde.",
  readError: "Je n'ai pas pu lire vos mémoires",
  openError: "Je n'ai pas pu ouvrir ce fichier",
  deleteError: "Je n'ai pas pu supprimer cette mémoire",
  /** Consigne affichée dans le corps d'une mémoire neuve, jamais écrite au fichier. */
  bodyPlaceholder:
    'Le fait, en clair. Liez les mémoires voisines avec [[leur-nom]]. Les dates en absolu.',
};
