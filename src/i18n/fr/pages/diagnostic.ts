// L'écran qui explique ses propres chiffres. Presque toutes ses phrases se
// construisent à partir de mesures : elles arrivent ici découpées en clés
// paramétrées plutôt qu'en fragments à recoller, pour rester traduisibles.

export default {
  title: 'Diagnostic de coût',
  sub: 'ce que disent les chiffres · et quoi en faire',
  loadError: "Je n'ai pas pu établir le diagnostic",
  unknownError: 'Erreur inconnue',
  summaryAria: 'Résumé de la période',
  tiles: {
    cost: 'Coût de la période',
    costHint: 'tarifs API',
    sessions: 'Sessions',
    sessionsHint: 'analysées',
    findings: 'Constats',
    findingsHint: 'toutes règles',
    critical: 'Critiques',
    criticalHint: 'au moins 2× le seuil',
  },
  actions: 'À faire, dans cet ordre',
  noAction:
    "Rien à signaler sur cette période. Les seuils sont calibrés sur votre parc : aucun constat ne veut dire que rien ne sort du lot, pas que rien n'a été mesuré.",

  // ── Comment vous travaillez ────────────────────────────────────────────────
  work: 'Comment vous travaillez',
  workSessions: '{n} session | {n} sessions',
  /** « activité, pas une valeur » est en gras au milieu de la phrase. */
  workIntro:
    "Vos sessions d'au moins dix tours ayant produit une modification, coupées en quarts selon leurs éditions par heure. Ce rendement mesure une {activity} : une session qui traque deux heures un bug et le corrige en une ligne figure tout en bas, et elle a bien travaillé. Ce que le tableau montre, ce sont deux manières de faire — pas une bonne et une mauvaise.",
  workIntroActivity: 'activité, pas une valeur',
  workCaption: 'Gestes comparés entre le quart le moins productif et le quart le plus productif',
  workColumns: {
    gesture: 'Geste',
    bottom: 'Quart le moins productif',
    top: 'Quart le plus productif',
  },
  workEmpty:
    "Trop peu de sessions comparables sur cette période : deux quarts de quelques sessions ne s'opposent pas. Élargissez la période pour voir ce tableau.",
  rows: {
    editsPerHour: 'Éditions par heure',
    editsPerHourWhat:
      "Les appels d'écriture rapportés à la durée de la session, de sa première à sa dernière ligne. C'est le critère qui découpe les quarts, pas un résultat : les trois lignes suivantes sont ce qu'on observe *chez* ces deux quarts.",
    editsPerHourReading:
      "Une session laissée ouverte sans qu'on y touche compte ses heures creuses, et tombe donc dans le quart du bas — ce qui ne dit rien de sa valeur.",
    explorationRatio: 'Explorations par modification',
    explorationRatioWhat:
      "Combien de lectures et de recherches pour une écriture. Chercher est nécessaire ; la question est le rapport, et il n'a pas de bonne valeur dans l'absolu.",
    turnsPerPrompt: 'Tours par prompt',
    turnsPerPromptWhat:
      "Combien de réponses un de vos messages déclenche. Un chiffre élevé veut dire un brief qu'on laisse courir ; un chiffre bas, des relances courtes qui reprennent la main à chaque étape.",
    interrupted: 'Sessions avec une interruption',
    interruptedWhat:
      "La part des sessions du quart où vous avez coupé la parole au moins une fois. Le coût direct d'une interruption est négligeable ; ce qu'elle signale ne l'est pas — le travail partait ailleurs qu'attendu.",
  },
  readings: {
    same: 'Vos deux quarts font pareil ici : ce geste ne les sépare pas.',
    exploreMore: "Chez vous, le quart le plus productif explore davantage : il cherche plus qu'il ne construit, et produit quand même.",
    exploreLess: "Chez vous, le quart le plus productif cherche moins qu'il ne construit.",
    turnsMore:
      "Chez vous, le quart le plus productif fait plus de tours par prompt — c'est le résultat qu'on n'attend pas, et une règle « trop de tours » aurait conseillé l'inverse du bon geste.",
    turnsLess: 'Chez vous, le quart le plus productif fait moins de tours par prompt.',
  },
  workReading: {
    prefix: 'Sur votre parc : {parts}.',
    explore: "vos sessions les plus productives cherchent moins qu'elles ne construisent ({top} exploration par modification contre {bottom})",
    turns: "elles font {top} tours par prompt là où les autres en font {bottom} — un brief complet qu'on laisse courir, pas dix relances courtes",
    none: 'Vos deux quarts se ressemblent sur ces gestes : rien ne les sépare nettement ici.',
  },

  // ── Rythme ─────────────────────────────────────────────────────────────────
  pace: 'Rythme',
  paceWindow: 'fenêtre de {n} h',
  current: 'Les 5 dernières heures',
  currentWhat:
    "Ce qui a été dépensé dans les cinq dernières heures, tous projets et toutes sessions confondus — la grandeur que compte une limite d'usage.",
  currentHint: '{sessions} — {rank}',
  currentRank: {
    none: 'rien dépensé sur cette fenêtre',
    busier: 'plus chargée que {pct} % de vos fenêtres',
    calmer: 'plus calme que {pct} % de vos fenêtres',
    above: 'au-dessus de {pct} % de vos fenêtres',
  },
  currentReading: {
    none: "Rien n'a été dépensé sur cette fenêtre.",
    fallback: 'Trop peu de fenêtres pour se caler sur votre parc : le repère de {threshold} est une valeur de repli.',
    over: 'Au-delà de votre repère de {threshold} — max(P90 de vos fenêtres, garde-fou), comme partout ici.',
    under: 'Votre repère est à {threshold} : max(P90 de vos fenêtres, garde-fou), comme partout ici.',
  },
  windows: 'Vos fenêtres de 5 h',
  windowsWhat:
    'La distribution de toutes vos fenêtres de cinq heures : une fenêtre est mesurée à chaque réponse API, ce qui décrit les moments où vous travaillez et non les heures du calendrier — celles-ci sont surtout vides et tireraient tout à zéro.',
  windowsHint: 'médiane · P90 {p90} · pic {peak}{day}',
  windowsPeakDay: ' le {date}',
  windowsReading:
    "{n} fenêtres mesurées. Elles se recouvrent largement — une par réponse — donc le pic n'est pas une journée mais un moment : les cinq heures les plus chères que vous ayez enchaînées.",
  concurrency: 'Sessions de front',
  concurrencyWhat:
    "Le plus grand nombre de sessions ouvertes en même temps, d'après le recouvrement de leurs bornes — de la première à la dernière ligne de chacune.",
  concurrencyReading:
    "Une session laissée ouverte sans qu'on y touche compte comme ouverte : c'est ce qu'elle était. Mener deux sessions de front remplit la fenêtre de 5 h deux fois plus vite.",
  concurrencyHint: 'au plus — {hours} h à deux ou plus, soit {share} du temps où une session était ouverte',
  paceReading:
    'Une fenêtre glissante ne connaît pas les sessions : elle compte ce qui a été dépensé dans les cinq dernières heures, toutes sessions confondues. Deux sessions menées de front la remplissent deux fois plus vite.',

  // ── Le détail ──────────────────────────────────────────────────────────────
  detail: 'Le détail',
  rulesCount: '{n} règles',
  nothing: "Je n'ai rien à signaler.",
  affected: '{n} session | {n} sessions',
  uncalibratedTag: ' · seuil non calibré',
  measured: 'Mesuré',
  estimated: 'Estimé',
  uncalibratedWarn:
    "Trop peu de cas pour calibrer ce seuil sur votre parc : il vient d'une valeur de repli. Ces constats sont plausibles, pas étalonnés.",
  heaviest: 'Les cas les plus lourds',

  // ── Les seuils ─────────────────────────────────────────────────────────────
  thresholds: 'Les seuils',
  thresholdsCalibrated: 'calibrés',
  thresholdsPartial: 'partiels',
  /** La formule est en gras au milieu de la phrase. */
  thresholdsIntro:
    'Chaque seuil vaut {formula}. Le percentile dit « inhabituel ici », le garde-fou « assez gros pour agir ». Un seuil décidé par son garde-fou signifie que le parc est sain sur ce signal.',
  thresholdsFormula: 'max(P90 de votre parc, un garde-fou)',
  thresholdsCaption: "Seuil retenu par signal, et ce qui l'a décidé",
  thresholdColumns: {
    signal: 'Signal',
    sessions: 'Sessions',
    median: 'Médiane',
    threshold: 'Seuil',
    decidedBy: 'Décidé par',
    hits: 'Cas',
  },
  boundWeak: 'échantillon trop petit',
  boundGuard: 'garde-fou',
  boundPark: 'votre parc',
  /** « manuel » est un lien vers la page d'aide. */
  reviewed:
    "Garde-fous revus à la main le {date}. Votre parc en compte {sessions} aujourd'hui. La marche à suivre pour les recalibrer est dans le {link}.",
  reviewedLink: 'manuel',
  caveats: 'Ce que ce rapport ne sait pas',

  // ── Ce qui a décidé un seuil, ligne par ligne ──────────────────────────────
  bound: {
    uncal:
      '{n} sessions portent ce signal, moins que les 30 requises : le percentile est écarté et le garde-fou ({guard}) décide seul. Les constats restent plausibles, ils ne sont pas étalonnés.',
    whichHigh: 'le plus haut des deux',
    whichLow: 'le plus bas des deux',
    weightNone: 'Aucune session ne le franchit : sur ce signal, votre parc est sain.',
    weight: 'À comparer aux {n} cas retenus{cost}.',
    weightCost: ', qui pèsent {cost}',
    silenced: ', ce qui fait taire {n} session{cost} | , ce qui fait taire {n} sessions{cost}',
    silencedCost: ' pesant {cost}',
    orphansNone: ' Aucune ne disparaît pour autant : toutes sont signalées par un autre signal.',
    orphans:
      " {n} d'entre elles ({cost}) ne sont désignées par aucun autre signal — c'est ce que ce plancher coûte vraiment ; les autres sont des doublons.",
    guardLine: '{rank} de votre parc {p} · garde-fou {guard} → on retient {which}, donc le garde-fou{silenced}. {weight}{orphans}',
    parkLine: '{rank} de votre parc {p} · garde-fou {guard} → on retient {which}, donc votre parc : {verdict}. {weight}',
    verdictSame: "les deux tombent au même endroit, et il n'y a rien entre eux à taire",
    verdictPassed: "le plancher est franchi et n'a rien à taire",
  },

  // ── Comment se lit un seuil ────────────────────────────────────────────────
  read: {
    dist: ' Votre parc : médiane {p50}, P75 {p75}, P90 {p90}, max {max}, sur {n} sessions.',
    senseLow: ' Ici, plus bas est pire.',
    sideHigh: 'sous',
    sideLow: 'au-dessus de',
    uncal:
      "Seulement {n} session porte ce signal, moins que les 30 qu'il faut : un percentile n'y voudrait rien dire. Le seuil est le garde-fou seul ({value}), ce qui est la position prudente — il ne sait que faire taire. | Seulement {n} sessions portent ce signal, moins que les 30 qu'il faut : un percentile n'y voudrait rien dire. Le seuil est le garde-fou seul ({value}), ce qui est la position prudente — il ne sait que faire taire.",
    percentile:
      'Seuil = {rank} de votre parc, donc 90 % de vos {n} sessions restent {side} {value}. Les {hits} cas sont ce décile-là, pas des anomalies détectées.',
    guard: "Seuil = garde-fou : le {rank} de votre parc{p} n'atteint pas ce qui vaut une action, et le plancher ({value}) prend le relais.{silenced}",
    guardP: ' ({p})',
    guardSilenced: ' Les {n} sessions entre les deux sont tues{cost}.',
    guardSilencedCost: ' — {cost} au total',
  },
}
