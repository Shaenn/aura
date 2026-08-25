// À partir de quand un chiffre mérite qu'on en parle.
//
// Le CLI dont ce module descend écrivait ses seuils en dur — `ratioThreshold:
// 0.5`, `turnsWarn: 50` — puis offrait un mode « distributions » pour que
// l'humain regarde les percentiles de son parc et corrige les constantes à la
// main. La bonne intuition, laissée à mi-chemin : ce que l'humain faisait avec
// ses yeux, on le calcule.
//
// Le seuil d'un signal est donc `max(P90 du parc, un plancher absolu)`, et les
// deux moitiés répondent à deux échecs différents :
//
//   Le **percentile** dit « inhabituel *ici* ». Une constante ne le saura jamais :
//   un taux de cache de 78 % est excellent sur un parc à 60 % et médiocre sur un
//   parc à 99 % — et un parc actif se tient couramment tout en haut de cette plage.
//
//   Le **plancher** dit « et assez gros pour valoir une action ». Sans lui, un
//   percentile désigne toujours 10 % du parc, y compris quand tout va bien : on
//   accuserait la session la moins vertueuse d'un parc irréprochable.
//
// Propriété qui rend l'ensemble sûr : **un plancher ne peut que faire taire.** Il
// est pris en `max`, donc le relever supprime des alertes et n'en crée jamais.
// Les seules valeurs écrites à la main dans ce module sont des planchers, et
// c'est pour cela qu'elles sont tolérables : au pire elles cachent un vrai
// problème mineur, jamais elles n'en inventent un.
//
// Ce module ne lit aucun transcript et ne juge aucune session. Il ne fait que
// répondre, signal par signal : « à partir de combien ? ».

import { t } from '../i18n/index.ts'
import type { SessionSignal } from './signals.ts'

// ── Ce qu'on publie ──────────────────────────────────────────────────────────

/** Sens du signal : « plus haut est pire », ou l'inverse (le taux de cache). */
export type Direction = 'high' | 'low'

/**
 * `ratio` est une part, qui s'écrit en pour-cent ; `rate` un rapport entre deux
 * grandeurs de même nature — 1,5 exploration par modification, 23 tours par
 * prompt — qu'aucun pour-cent ne rendrait lisible. La distinction n'existe que
 * pour l'affichage, et c'est déjà une raison suffisante.
 */
export type Unit = 'usd' | 'tokens' | 'ratio' | 'count' | 'rate'

export interface Calibration {
  metric: string
  /** Libellé destiné à l'UI. */
  label: string
  /**
   * Ce que le signal mesure, en une phrase ou deux, destiné à l'UI.
   *
   * Il vit ici et non dans la page parce qu'un signal se définit là où il se
   * calcule : un libellé et une explication qui s'éloignent de leur `of()`
   * finissent par décrire autre chose que ce qui est mesuré.
   */
  help: string
  unit: Unit
  direction: Direction
  /** Le seuil retenu. Une valeur au-delà (ou en deçà, si `low`) est un signal. */
  value: number
  /** Le percentile calculé sur le parc, ou `null` si l'échantillon est trop maigre. */
  percentile: number | null
  /** Le rang visé — 0.9 pour le décile supérieur. */
  rank: number
  /**
   * La borne absolue, qui ne peut que faire taire (`max` si `high`, `min` si
   * `low`). Elle porte l'unique jugement écrit à la main de ce module.
   */
  guard: number
  /**
   * D'où sort ce garde-fou — l'ordre de grandeur qui le justifie, en une phrase.
   *
   * Un percentile se relit dans les données ; un plancher, non. Sans cette
   * phrase, la seule réponse à « pourquoi 200 000 ? » serait « parce que ». Elle
   * est aussi ce qu'on relit pour décider s'il faut le réviser.
   */
  guardBasis: string
  /**
   * Qui a décidé le seuil. `guard` signifie que **le parc est sain sur ce
   * signal** : le décile le moins bon reste sous ce qui vaut une action.
   */
  bound: 'percentile' | 'guard'
  /** Sessions où le signal a un sens — les autres ne sont pas des zéros, elles sont hors sujet. */
  sampleSize: number
  /** Faux sous `MIN_SAMPLE` : le percentile n'est pas fiable, seul le garde-fou parle. */
  calibrated: boolean
  /** Combien de sessions de l'échantillon franchissent le seuil. */
  hits: number
  /** Ce que pèsent ces sessions, en dollars. `null` quand les coûts n'ont pas été fournis. */
  hitsCost: number | null
  /**
   * Ce que le garde-fou fait taire : les sessions au-delà du percentile mais en
   * deçà du seuil retenu.
   *
   * C'est le seul chiffre qui rende un plancher discutable. « 200 000 » ne se
   * juge pas dans l'absolu ; « 200 000, qui tait N sessions pesant tant » se
   * juge — et se compare à ce que les cas retenus, eux, valent. `null` quand le
   * percentile décide : il n'y a alors rien à taire.
   */
  silenced: {
    sessions: number
    cost: number | null
    /**
     * La part de cette bande qu'aucun *autre* signal ne désigne — la seule perte
     * d'information réelle, et donc le vrai prix du plancher.
     *
     * La bande brute surestime toujours ce prix : là où on l'a mesuré, presque
     * toutes les sessions que `toolTokens` tait sont déjà signalées ailleurs. Un garde-fou
     * qui ne tait que des doublons ne coûte rien ; celui qui tait des orphelines
     * les fait disparaître du rapport entier. Deux chiffres très différents, que
     * seul le parc complet permet de séparer — d'où `null` quand on calibre un
     * signal isolé.
     */
    orphans: { sessions: number; cost: number } | null
  } | null
  /** Des repères, pour l'UI et pour le doute. */
  quantiles: { p50: number; p75: number; p90: number; min: number; max: number }
}

/**
 * Sous ce nombre de sessions portant le signal, un percentile ne dit rien : trois
 * sessions donnent un « P90 » qui n'est que la pire des trois. Seuil repris du CLI
 * d'origine, qui avait raison sur ce point.
 */
export const MIN_SAMPLE = 30

/**
 * En dessous de ce coût, une session n'a rien à gagner à être optimisée.
 *
 * Utilisé par les signaux dont la valeur est un *ratio* : un ratio ignore
 * l'ampleur, et désignera donc volontiers une session à deux cents dont la forme
 * est mauvaise et l'enjeu nul. Les signaux qui mesurent déjà des dollars ou des
 * tokens n'en ont pas besoin — leur grandeur porte sa propre matérialité.
 */
export const MIN_MATERIAL_COST = 1

// ── Les signaux calibrés ─────────────────────────────────────────────────────

/**
 * Ce qu'il faut savoir d'un signal pour le calibrer — sans savoir le mesurer.
 *
 * `label`, `help` et `guardBasis` sont dans la sortie mais pas dans la table qui
 * la produit : ils dépendent de la langue de la requête, et se lisent au
 * catalogue sous `diagnostics.metrics.<signal>`.
 */
export interface MetricMeta {
  label: string
  help: string
  unit: Unit
  direction: Direction
  rank: number
  guard: number
  guardBasis: string
}

/**
 * La part d'un signal qui ne dépend pas de la langue — ce qu'on calibre.
 *
 * Les mots se lisent au catalogue sous le nom du signal, celui-là même qu'on
 * passe à `calibrateFrom`. Un signal n'a donc plus à porter ses phrases : il
 * suffit qu'il ait un nom.
 */
export type MetricNumbers = Omit<MetricMeta, 'label' | 'help' | 'guardBasis'>

interface MetricSpec extends MetricNumbers {
  /**
   * La valeur du signal pour une session, ou `null` quand la session ne le porte
   * pas. La distinction décide de tout : mesurer « les tokens jetés par les
   * compactions » sur les sessions qui n'en ont aucune — l'écrasante majorité —
   * donnerait un P90 à zéro, et le signal ne se déclencherait plus jamais.
   */
  of: (s: SessionSignal) => number | null
}

/**
 * Quand ces planchers ont été revus à la main pour la dernière fois.
 *
 * Un garde-fou vieillit : il a été posé face à une distribution, et la
 * distribution bouge. Cette date est donc publiée avec les seuils — sans elle,
 * personne ne sait si « 200 000 » a été pesé hier ou hérité d'un autre temps. La
 * procédure de révision est dans le manuel, page Diagnostic.
 *
 * Seule la date est publiée : la taille et le coût du parc de calibrage en
 * disaient long sur l'installation qui a servi de référence, et n'apprenaient
 * rien à qui lit le rapport chez lui.
 */
export const GUARDS_REVIEWED = { on: '2026-08-05' } as const

/**
 * Les planchers ci-dessous sont des ordres de grandeur écrits à la main, chacun
 * accompagné de ce qui le justifie (`guardBasis`). Rappel de l'en-tête : ils ne
 * peuvent que faire taire.
 *
 * Une doctrine les tient ensemble, et elle n'est pas « le même chiffre partout » :
 * **le plancher épouse la légitimité de la dépense.** Un outil *doit* consommer
 * du contexte, c'est son métier — son plancher est donc haut, à une fenêtre
 * entière. Relire deux fois le même fichier, ou charger un socle avant la
 * première question, ne produit rien en soi — ces planchers-là sont bas. Deux
 * signaux ayant la même unité peuvent donc légitimement porter des planchers
 * qui diffèrent d'un ordre de grandeur.
 */
const SPECS = {
  /** Le coût brut. Garde-fou universel : rien ne vaut une action sous quelques dollars. */
  sessionCost: {
    unit: 'usd',
    direction: 'high',
    rank: 0.9,
    guard: 5,
    of: (s) => (s.cost > 0 ? s.cost : null),
  },
  /** Ce que coûte la seule relecture de l'historique. Premier poste du parc. */
  cacheReadCost: {
    unit: 'usd',
    direction: 'high',
    rank: 0.9,
    guard: 3,
    of: (s) => (s.cost > 0 ? s.cacheReadCost : null),
  },
  /** Le poids des outils dans la fenêtre. Estimation — voir `signals.ts`. */
  toolTokens: {
    unit: 'tokens',
    direction: 'high',
    rank: 0.9,
    guard: 200_000,
    of: (s) => (s.tools.length ? s.byCategory.tools : null),
  },
  /** Part des appels d'outil revenus en erreur : des tokens dépensés sans résultat. */
  toolErrorRate: {
    unit: 'ratio',
    direction: 'high',
    rank: 0.9,
    guard: 0.15,
    of: (s) => {
      const calls = s.tools.reduce((n, t) => n + t.calls, 0)
      // Sous une vingtaine d'appels, un taux n'est qu'un accident d'arrondi.
      return calls >= 20 ? s.toolErrors / calls : null
    },
  },
  /**
   * Ce qu'une compaction a jeté. Ne concerne que les sessions qui en ont eu.
   *
   * Le garde-fou est haut, et délibérément : jeter du contexte *est* le but d'une
   * compaction : une compaction ordinaire en jette déjà de quoi remplir plusieurs
   * fenêtres — un plancher bas désignerait donc la plupart des sessions concernées, c'est-
   * à-dire le fonctionnement normal. Seule une ampleur inhabituelle interroge.
   */
  compactionWaste: {
    unit: 'tokens',
    direction: 'high',
    rank: 0.9,
    guard: 500_000,
    of: (s) => (s.compactions.length ? s.compactions.reduce((n, c) => n + Math.max(0, c.preTokens - c.postTokens), 0) : null),
  },
  /**
   * Ce que les délégations ont coûté, en dollars. Ne concerne que les sessions
   * qui délèguent.
   *
   * En *part* du coût de la session — la formulation d'abord retenue — ce signal
   * ne dit rien : son P90 atteint 100 %, parce qu'une
   * session dont le fil principal ne fait que lancer des agents leur doit tout
   * son coût. Un ratio borné sature, et un percentile qui atteint son maximum ne
   * désigne plus personne. La part reste un bon *commentaire* d'une session
   * coûteuse ; elle ne peut pas en être le déclencheur.
   */
  subagentCost: {
    unit: 'usd',
    direction: 'high',
    rank: 0.9,
    guard: 3,
    of: (s) => (s.subagents.length ? s.subagents.reduce((n, a) => n + a.cost, 0) : null),
  },
  /** Mémoires, catalogues de skills et machinerie du harness. Estimation. */
  injectedContext: {
    unit: 'tokens',
    direction: 'high',
    rank: 0.9,
    // Revu le 2026-08-05 : 20 000 était plus du double du P90 (8 903) et taisait
    // deux fois plus de sessions qu'il n'en gardait. Le socle ne produit rien
    // par lui-même et se paie à chaque tour : son plancher n'a pas à être celui
    // d'un outil qui, lui, travaille.
    guard: 10_000,
    of: (s) => {
      const injected = s.byCategory.memory + s.byCategory.skills + s.byCategory.harness
      return injected > 0 ? injected : null
    },
  },
  /**
   * Le socle payé par une session qui n'a presque rien fait.
   *
   * Le signal n'a de sens que sur les sessions courtes : sur une session de cent
   * tours, le socle est amorti et ne dit plus rien.
   */
  shortSessionBaseline: {
    unit: 'tokens',
    direction: 'high',
    rank: 0.9,
    guard: 20_000,
    of: (s) => (s.turns > 0 && s.turns <= 3 && s.firstTurnContext > 0 ? s.firstTurnContext : null),
  },
  /**
   * Chercher plus qu'on ne construit.
   *
   * Le signal qui discrimine le mieux deux manières de travailler : sur ce
   * corpus, le quart des sessions qui produit le plus fait 0,6 exploration par
   * édition, le quart qui produit le moins en fait 1,5. Il *décrit* — une session
   * peut passer deux heures à traquer un bug et le corriger en une ligne, et ce
   * serait excellent.
   *
   * Ne concerne que les sessions qui ont modifié quelque chose : une session
   * d'analyse pure n'a pas de ratio, et lui en donner un infini reviendrait à la
   * juger sur un travail qu'elle ne prétendait pas faire.
   */
  explorationRatio: {
    unit: 'rate',
    direction: 'high',
    rank: 0.9,
    guard: 2,
    of: (s) => {
      const { explorationCalls, productionCalls } = s.families
      // Sous une vingtaine d'appels, un rapport n'est qu'un accident d'arrondi.
      if (productionCalls === 0 || explorationCalls + productionCalls < 20) return null
      return explorationCalls / productionCalls
    },
  },
  /**
   * Combien de réponses un prompt déclenche — **plus bas est pire**.
   *
   * Le sens de ce signal est celui qu'on n'attend pas, et c'est pour cela qu'il
   * est ici : les sessions les plus productives font 23 tours par prompt, les
   * moins productives 11,7. Un brief complet qu'on laisse courir bat dix relances
   * courtes. Une règle « trop de tours » aurait conseillé l'inverse du bon geste.
   *
   * Restreint aux sessions assez longues pour que le rapport ait un sens : deux
   * tours sur un prompt, c'est une question, pas une manière de travailler.
   */
  turnsPerPrompt: {
    unit: 'rate',
    direction: 'low',
    rank: 0.1,
    // Revu le 2026-08-05 : valait 8, ce qui n'était pas un garde-fou mais un
    // no-op. Sur un signal inversé le seuil est un `min` — un plancher posé
    // *au-dessus* du P10 (3,5 ici) ne peut jamais s'appliquer, quel que soit le
    // parc. Pour faire taire, il doit être sous le percentile ; c'est le sens
    // qu'on voulait, pas la valeur qu'on avait écrite.
    guard: 3,
    of: (s) => (s.userTurns >= 3 && s.turns >= 10 ? s.turns / s.userTurns : null),
  },
  /**
   * Les fois où l'on a coupé la parole.
   *
   * Leur coût direct est négligeable. Ce qu'elles signalent ne l'est pas : à
   * chaque interruption, le travail partait ailleurs qu'attendu — et les sessions
   * les moins productives en portent sensiblement plus que les plus productives.
   */
  interruptions: {
    unit: 'count',
    direction: 'high',
    rank: 0.9,
    // Revu le 2026-08-05 : valait 3. Le test étant strict, il fallait *quatre*
    // interruptions pour un constat, là où l'intention écrite était « trois, c'est
    // un motif ». Deux sessions passaient ; six passent désormais.
    guard: 2,
    of: (s) => (s.interruptions > 0 ? s.interruptions : null),
  },
  /** Ce que les fichiers déjà lus ont remis dans la fenêtre. Estimation. */
  rereadTokens: {
    unit: 'tokens',
    direction: 'high',
    rank: 0.9,
    // Revu le 2026-08-05, et c'est la correction la plus lourde de cette passe :
    // 100 000 valait plusieurs fois le P90 mesuré. Le signal ne désignait plus
    // qu'*une* session, quand des dizaines portaient le problème. Un garde-fou
    // ne peut que faire taire — celui-ci taisait le gisement entier.
    guard: 20_000,
    of: (s) => (s.rereadTokens > 0 ? s.rereadTokens : null),
  },
  /**
   * Ce que la fenêtre a atteint, rapporté à la limite du modèle.
   *
   * Un ratio borné à 1 : le percentile n'y sature pas tant que le parc reste loin
   * de la limite, ce qui est le cas ici — mais si un jour toutes les sessions
   * compactaient, ce seuil désignerait tout le monde et ne dirait plus rien. Le
   * garde-fou tient alors la barre.
   */
  contextFill: {
    unit: 'ratio',
    direction: 'high',
    rank: 0.9,
    guard: 0.8,
    of: (s) => (s.peakContext > 0 && s.contextLimit > 0 ? s.peakContext / s.contextLimit : null),
  },
  /**
   * Un signal à l'envers : ici, plus bas est pire. Son garde-fou est donc un
   * plafond, et il fait taire de la même façon — un parc à 99 % de cache n'a rien
   * à se reprocher, même dans son décile le moins bon.
   *
   * Le filtre de coût a été ajouté le 2026-08-05, et il vaut d'être expliqué :
   * sans lui, les sessions désignées ne pesaient presque rien. Un cache qui ne
   * prend pas ne fait perdre que ce que la fenêtre valait, et une session à deux
   * cents n'a pas de fenêtre à perdre — le signal ne trouvait donc que des
   * sessions minuscules, mécaniquement mal cachées et sans le moindre enjeu.
   * C'est une correction de *matérialité*, pas de seuil : le garde-fou ne pouvait
   * rien contre elle, puisqu'il ne juge que l'ampleur du ratio, jamais celle de
   * la session.
   */
  cacheHitRatio: {
    unit: 'ratio',
    direction: 'low',
    rank: 0.1,
    guard: 0.7,
    of: (s) => (s.turns >= 5 && s.cost >= MIN_MATERIAL_COST ? s.cacheHitRatio : null),
  },
} satisfies Record<string, MetricSpec>

export type MetricName = keyof typeof SPECS

export const METRIC_NAMES = Object.keys(SPECS) as MetricName[]

export interface Thresholds {
  /** Sessions fournies en entrée, tous signaux confondus. */
  sessions: number
  /** Vrai si *tous* les signaux ont pu être calibrés sur un échantillon suffisant. */
  reliable: boolean
  /** Quand les garde-fous ont été revus, et sur quel corpus. */
  reviewed: { on: string }
  metrics: Record<MetricName, Calibration>
}

// ── Percentiles ──────────────────────────────────────────────────────────────

/**
 * Le percentile de rang `rank` (0 → minimum, 1 → maximum), par interpolation
 * linéaire entre les deux statistiques d'ordre qui l'encadrent.
 *
 * `values` doit être trié en ordre croissant. L'interpolation évite la marche
 * d'escalier d'un percentile « au plus proche » : sur trente sessions, choisir la
 * 27e plutôt que la 28e déplacerait le seuil de plusieurs dizaines de pour cent
 * sans qu'aucune donnée ne l'ait demandé.
 */
export function percentile(values: number[], rank: number): number {
  if (!values.length) return 0
  if (values.length === 1) return values[0] as number
  const clamped = Math.min(1, Math.max(0, rank))
  const position = clamped * (values.length - 1)
  const low = Math.floor(position)
  const high = Math.ceil(position)
  const lower = values[low] as number
  if (low === high) return lower
  return lower + (position - low) * ((values[high] as number) - lower)
}

/**
 * Où une valeur se place dans un échantillon, entre 0 et 1.
 *
 * L'inverse du percentile : celui-ci répond « quelle valeur au rang 0,9 ? »,
 * celui-là « à quel rang cette valeur ? ». C'est ce qu'il faut pour situer *une*
 * session dans le parc — « plus chère que 94 % de vos sessions » se lit, là où
 * un montant nu ne dit rien à qui ne connaît pas son propre parc.
 *
 * Les ex æquo comptent pour moitié (définition dite « milieu »), sans quoi un
 * parc où la moitié des sessions valent zéro placerait chacune d'elles au rang
 * 50 % — ou au rang 0 %, selon le sens de la comparaison, et aucun des deux
 * n'est vrai.
 */
export function percentileRank(values: number[], value: number): number {
  if (!values.length) return 0
  let below = 0
  let equal = 0
  for (const v of values) {
    if (v < value) below++
    else if (v === value) equal++
  }
  return (below + equal / 2) / values.length
}

// ── Calibration ──────────────────────────────────────────────────────────────

/**
 * Le cœur, isolé de `SessionSignal` pour être éprouvable sur des tableaux nus.
 *
 * `override` court-circuite tout : quand l'utilisateur a fixé un seuil, ni le
 * percentile ni le garde-fou ne le contredisent. Le percentile reste calculé et
 * publié — on montre ce qu'on aurait proposé.
 */
export function calibrateFrom(
  metric: string,
  spec: MetricNumbers,
  values: number[],
  override?: number,
  /**
   * Ce que coûte la session portant chaque valeur, dans le même ordre. Facultatif :
   * `pace` calibre des fenêtres, qui ne sont les sessions de personne. Sans lui,
   * `hitsCost` et le coût de la bande tue restent `null` — un chiffre absent vaut
   * mieux qu'un zéro qu'on lirait comme « ne coûte rien ».
   */
  costs?: number[],
): Calibration {
  // Trier les paires et non les seules valeurs : c'est ce qui garde chaque coût
  // avec la valeur qu'il accompagne.
  const pairs = values.map((v, i) => ({ v, cost: costs?.[i] ?? null })).sort((a, b) => a.v - b.v)
  const sorted = pairs.map((p) => p.v)
  const size = sorted.length
  const calibrated = size >= MIN_SAMPLE
  const computed = calibrated ? percentile(sorted, spec.rank) : null

  // Sans échantillon fiable, le garde-fou parle seul : c'est la position prudente,
  // puisqu'il ne sait que faire taire.
  const fromParc = computed ?? spec.guard
  const value = override ?? (spec.direction === 'high' ? Math.max(fromParc, spec.guard) : Math.min(fromParc, spec.guard))

  const beyond = (v: number): boolean => (spec.direction === 'high' ? v > value : v < value)
  const hits = pairs.filter((p) => beyond(p.v))

  /** La somme des coûts connus, ou `null` si aucun ne l'est. */
  const costOf = (list: typeof pairs): number | null => (costs ? list.reduce((n, p) => n + (p.cost ?? 0), 0) : null)

  // La bande que le garde-fou étouffe : au-delà du percentile, en deçà du seuil.
  // Vide par construction quand le percentile décide — les deux bornes coïncident.
  const band =
    computed === null || value === computed
      ? null
      : pairs.filter((p) => (spec.direction === 'high' ? p.v > computed && p.v <= value : p.v < computed && p.v >= value))

  return {
    metric,
    // Les mots du signal viennent du catalogue, pas de la table : ils dépendent
    // de la langue, la table ne dépend que du parc.
    label: t(`diagnostics.metrics.${metric}.label`),
    help: t(`diagnostics.metrics.${metric}.help`),
    unit: spec.unit,
    direction: spec.direction,
    value,
    percentile: computed,
    rank: spec.rank,
    guard: spec.guard,
    guardBasis: t(`diagnostics.metrics.${metric}.guardBasis`),
    bound: override !== undefined || computed === null || value !== computed ? 'guard' : 'percentile',
    sampleSize: size,
    calibrated,
    hits: hits.length,
    hitsCost: costOf(hits),
    // `orphans` ne peut pas se calculer ici : il faut les autres signaux, que ce
    // niveau ne connaît pas. `calibrate` le remplit ensuite.
    silenced: band ? { sessions: band.length, cost: costOf(band), orphans: null } : null,
    quantiles: {
      min: size ? (sorted[0] as number) : 0,
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
      max: size ? (sorted[size - 1] as number) : 0,
    },
  }
}

/**
 * Calibrer tous les signaux sur un parc.
 *
 * `overrides` porte les seuils que l'utilisateur a fixés lui-même (destinés à
 * venir des préférences AURA) ; un signal absent de la table est calibré.
 */
export function calibrate(signals: SessionSignal[], overrides: Partial<Record<MetricName, number>> = {}): Thresholds {
  const metrics = {} as Record<MetricName, Calibration>
  let reliable = true

  for (const name of METRIC_NAMES) {
    const spec = SPECS[name] as MetricSpec
    const values: number[] = []
    const costs: number[] = []
    for (const s of signals) {
      const v = spec.of(s)
      if (v !== null && Number.isFinite(v)) {
        values.push(v)
        costs.push(s.cost)
      }
    }
    const calibration = calibrateFrom(name, spec, values, overrides[name], costs)
    if (!calibration.calibrated) reliable = false
    metrics[name] = calibration
  }

  // Seconde passe : ce que chaque garde-fou tait *et que personne d'autre ne
  // voit*. Elle exige tous les seuils arrêtés, d'où le second tour.
  for (const name of METRIC_NAMES) {
    const c = metrics[name]
    if (!c.silenced || c.percentile === null) continue
    const p = c.percentile

    let sessions = 0
    let cost = 0
    for (const s of signals) {
      const v = valueOf(name, s)
      if (v === null) continue
      const inBand = c.direction === 'high' ? v > p && v <= c.value : v < p && v >= c.value
      if (!inBand) continue
      // Orpheline : la taire la fait disparaître du rapport, elle n'y figure
      // sous aucun autre titre.
      const seenElsewhere = METRIC_NAMES.some((other) => other !== name && exceeds(metrics[other], valueOf(other, s)))
      if (!seenElsewhere) {
        sessions++
        cost += s.cost
      }
    }
    c.silenced.orphans = { sessions, cost }
  }

  return { sessions: signals.length, reliable, reviewed: GUARDS_REVIEWED, metrics }
}

/** La valeur d'un signal pour une session — ce que les règles interrogeront. */
export function valueOf(metric: MetricName, signal: SessionSignal): number | null {
  return (SPECS[metric] as MetricSpec).of(signal)
}

/** La session franchit-elle ce seuil ? Faux quand elle ne porte pas le signal. */
export function exceeds(calibration: Calibration, value: number | null): boolean {
  if (value === null) return false
  return calibration.direction === 'high' ? value > calibration.value : value < calibration.value
}
