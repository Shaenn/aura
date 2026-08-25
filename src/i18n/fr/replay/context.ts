// La reconstruction de la fenêtre de contexte : le panneau, ses lignes, son
// tiroir. Les catégories y sont un vocabulaire fermé — l'ordre décide des
// couleurs, et il vit dans le composant, jamais ici.

export default {
  drawer: {
    open: 'Contexte',
    title: 'Fenêtre de contexte',
    close: 'Fermer le contexte',
  },

  empty:
    "Aucune donnée de contexte pour cette session. Les tours sans relevé d'usage (modèles synthétiques, sessions interrompues) n'en produisent pas.",
  emptyPhase:
    "Rien n'a encore été joué depuis la compaction. Ce qui entrera dans cette fenêtre apparaîtra au premier tour ; les phases précédentes restent consultables ci-dessus.",
  emptyInjections: "Rien n'a été injecté durant cette phase.",

  fillLimit: '/ {n}',
  captionLast: 'Contexte envoyé au modèle au dernier tour de la phase — chiffre exact.',
  captionAfterCompaction: "Fenêtre au sortir de la compaction — chiffre exact. Aucun tour n'a encore été joué dans cette phase.",
  captionPending: 'La compaction n’a pas encore dit la taille de la nouvelle fenêtre ; elle sera connue à la fin du tour.',

  costFloor: 'au moins —',
  costNote: "prix catalogue API, non ce qu'un abonnement facture",

  phaseLegend: 'Phase',
  phaseCurrent: 'Actuelle',
  viewLegend: 'Vue',
  views: {
    category: 'Par catégorie',
    ranked: 'Par taille',
    flat: 'À plat',
    byTurn: 'Par tour',
  },

  byTurnCaption: 'Croissance {exact} de la fenêtre à chaque tour ; le détail nomme, en estimé, ce qu’on sait y rattacher.',
  byTurnExact: 'exacte',
  byTurnLiveOrder: 'Le plus récent en premier.',

  turnLink: 'Tour {n}',
  goToTurn: 'Aller au tour {n}',
  rowError: 'erreur',
  copyPath: 'Copier {path}',
  split: 'entrée ~{in} · sortie ~{out}',

  baseline: 'Socle de démarrage',
  baselineNote:
    'Le prompt système et les schémas d’outils, déjà présents avant votre premier mot. Déduit de la fenêtre du premier tour : ce chiffre-là est {exact}.',
  baselineExact: 'exact',
  residual: 'Reste inexpliqué',
  residualNote:
    'Le formatage des messages, les injections que nous ne savons pas encore lire, et la marge de l’estimateur — quatre caractères par token sous-estime le code.',
  residualCompacted: 'Cette session ayant été compactée, le résumé de l’historique réinjecté s’y ajoute.',

  estimateNote:
    'Le total et le socle sont exacts. Les valeurs préfixées de « ~ » sont {estimated} à environ 4 caractères par token : elles indiquent un ordre de grandeur, pas un décompte.',
  estimateEmphasis: 'estimées',

  /** Le nom de chaque catégorie dans le panneau, et son jeton dans le fil. */
  categories: {
    memory: 'CLAUDE.md & règles',
    skills: 'Skills',
    files: 'Fichiers',
    tools: 'Outils — entrées et sorties',
    thinking: 'Raisonnement & réponses',
    userMessage: 'Vos messages',
    harness: 'Harnais',
  },
  pills: {
    memory: 'CLAUDE.md',
    skills: 'Skill',
    files: 'Fichier',
    tools: 'Outil',
    thinking: 'Réponse',
    userMessage: 'Vous',
    harness: 'Harnais',
    /** Une règle de projet est une mémoire, mais elle se nomme autrement. */
    rule: 'Règle',
  },
  /** Ce qu'un tour a produit lui-même, opposé à ce qu'on lui a injecté. */
  rows: {
    thinking: 'Raisonnement',
    answer: 'Réponse',
  },
}
