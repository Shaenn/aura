// Comment on travaille — mesuré sur son propre parc, pas récité.
//
// Les règles désignent des sessions qui sortent du lot. Il manquait le tableau
// dont elles sortent : quels gestes vont, *chez vous*, avec les sessions qui
// aboutissent. Ce module le calcule en coupant le parc en quarts selon un
// rendement observé, et en comparant le quart du haut à celui du bas.
//
// Trois précautions, sans lesquelles ce tableau serait un piège :
//
//  1. **« Éditions par heure » mesure une activité, pas une valeur.** Une session
//     qui passe deux heures à traquer un bug subtil et le corrige en une ligne
//     est « improductive » selon cette métrique, et excellente en réalité. Le
//     tableau sert donc à *situer* deux populations, jamais à noter une session.
//  2. **Les deux résultats qui comptent renversent l'intuition.** Là où on l'a
//     mesuré, les sessions les plus productives font *plus* de tours par prompt
//     et retouchent *plus* le même fichier. Une règle écrite à l'instinct
//     aurait conseillé l'inverse du bon geste ; c'est pour cela que ces chiffres
//     sont recalculés chez chacun plutôt qu'inscrits en dur.
//  3. **Un échantillon trop maigre ne dit rien.** Sous quelques dizaines de
//     sessions retenues, deux quarts ne sont que deux poignées : `comparable`
//     passe à faux et l'UI doit s'abstenir de conclure.

import type { SessionSignal } from './signals.ts'

// ── Ce qu'on publie ──────────────────────────────────────────────────────────

/** Un geste, vu chez les deux extrêmes du rendement. */
export interface BehaviourStat {
  /** Médiane sur toutes les sessions retenues. */
  median: number
  /** Médiane du quart qui produit le plus d'éditions par heure. */
  top: number
  /** Médiane du quart qui en produit le moins. */
  bottom: number
}

export interface Behaviour {
  /** Sessions retenues : assez longues et ayant produit une modification. */
  sessions: number
  /** Faux quand l'échantillon est trop maigre pour opposer deux quarts. */
  comparable: boolean
  /** Éditions par heure — le rendement qui définit les quarts, pas une valeur. */
  editsPerHour: BehaviourStat
  explorationRatio: BehaviourStat
  turnsPerPrompt: BehaviourStat
  /** Part des sessions du quart qui portent au moins une interruption. */
  interruptedShare: { top: number; bottom: number }
}

/**
 * Deux quarts de moins de huit sessions chacun ne s'opposent pas : une seule
 * session atypique y déplacerait la médiane de moitié.
 */
const MIN_SESSIONS = 32

/** Une session trop courte n'a pas de rendement : elle n'a pas eu le temps. */
const MIN_TURNS = 10

// ── Outillage ────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/** Les heures d'une session, d'après ses bornes. Zéro si elles sont illisibles. */
function hoursOf(s: SessionSignal): number {
  const start = Date.parse(s.firstTs)
  const end = Date.parse(s.lastTs)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return (end - start) / 3_600_000
}

const stat = (all: number[], top: number[], bottom: number[]): BehaviourStat => ({
  median: median(all),
  top: median(top),
  bottom: median(bottom),
})

// ── Le calcul ────────────────────────────────────────────────────────────────

/**
 * Le tableau des deux quarts, sur les sessions qui peuvent en faire partie.
 *
 * Sont retenues les sessions d'au moins dix tours ayant produit une modification
 * et dont la durée est lisible : sans l'un des trois, le rendement n'existe pas —
 * et un zéro inventé rangerait la session dans le quart du bas, où elle
 * fausserait tout ce qu'on lui fait dire.
 */
export function buildBehaviour(signals: SessionSignal[]): Behaviour {
  const kept = signals
    .filter((s) => s.turns >= MIN_TURNS && s.families.productionCalls > 0 && hoursOf(s) > 0)
    .map((s) => ({
      signal: s,
      editsPerHour: s.families.productionCalls / hoursOf(s),
      explorationRatio: s.families.explorationCalls / s.families.productionCalls,
      // Une session sans prompt identifiable (transcript ancien, reprise) n'a pas
      // de rapport tours/prompt : on la laisse hors de ce geste-là seulement.
      turnsPerPrompt: s.userTurns > 0 ? s.turns / s.userTurns : null,
    }))

  const comparable = kept.length >= MIN_SESSIONS
  const sorted = [...kept].sort((a, b) => a.editsPerHour - b.editsPerHour)
  const quarter = Math.floor(sorted.length / 4)
  const bottom = comparable ? sorted.slice(0, quarter) : []
  const top = comparable ? sorted.slice(sorted.length - quarter) : []

  const perPrompt = (list: typeof kept): number[] => list.map((k) => k.turnsPerPrompt).filter((v): v is number => v !== null)
  const interrupted = (list: typeof kept): number => (list.length ? list.filter((k) => k.signal.interruptions > 0).length / list.length : 0)

  return {
    sessions: kept.length,
    comparable,
    editsPerHour: stat(
      kept.map((k) => k.editsPerHour),
      top.map((k) => k.editsPerHour),
      bottom.map((k) => k.editsPerHour),
    ),
    explorationRatio: stat(
      kept.map((k) => k.explorationRatio),
      top.map((k) => k.explorationRatio),
      bottom.map((k) => k.explorationRatio),
    ),
    turnsPerPrompt: stat(perPrompt(kept), perPrompt(top), perPrompt(bottom)),
    interruptedShare: { top: interrupted(top), bottom: interrupted(bottom) },
  }
}
