// La décomposition du coût d'une session. Les constats et les libellés de rang
// viennent du serveur déjà traduits ; ne vivent ici que les mots du panneau.

export default {
  error: 'Diagnostic indisponible.',
  none: 'Cette session n’a produit aucune réponse chiffrable : il n’y a rien à décomposer.',
  floor: 'au moins',
  rate: 'aux tarifs API — un forfait Pro ou Max se facture au mois',

  breakdownAria: 'Répartition : {parts}',
  parts: {
    read: 'Relire l’historique',
    write: 'Construire la fenêtre',
    input: 'Entrée non mise en cache',
    output: 'Générer',
  },

  hintHeavy:
    'Les {pct} de relecture sont le prix de la longueur : à chaque tour, toute la conversation repasse. C’est le seul poste qu’on réduit en coupant plus tôt.',
  hintGrowing: 'La relecture commence à peser. Elle grandit avec le nombre de tours, pas avec le travail fait.',
  hintLight: 'La relecture reste marginale : cette session paie surtout ce qu’elle a lu et produit une première fois.',

  unpriced: '{models} n’a pas de tarif connu : ses tokens sont comptés, son coût non.',

  parc: 'Dans votre parc — {n} sessions',
  median: 'médiane {v}',

  /** Le rang, dit dans le sens du signal — voir `rankSentence`. */
  rank: {
    bestLow: 'Le meilleur de vos {n} sessions.',
    lowestLow: 'Le plus bas de vos {n} sessions.',
    betterThan: 'Mieux que {pct} de vos sessions.',
    under: 'Sous {pct} de vos sessions.',
    highest: 'La plus élevée de vos {n} sessions.',
    lowest: 'La plus basse de vos {n} sessions.',
    moreThan: 'Plus que {pct} de vos sessions.',
    lessThan: 'Moins que {pct} de vos sessions.',
    aboveA: 'Au-dessus de {pct} de vos sessions.',
  },

  findings: '{n} constat | {n} constats',
  /** Le préfixe que la page du parc pose et que ce panneau retire. */
  findingPrefix: 'Session {id}… : ',
  more: 'Voir le diagnostic du parc',
  calm: 'Rien à signaler : aucune règle ne désigne cette session.',
}
