// Le diagnostic d'*une* session, pour le lecteur de transcripts.
//
// La page Diagnostic répond « où part l'argent du parc ». Devant une session
// ouverte, la question n'est plus la même : « celle-ci, elle a coûté quoi, et
// est-ce inhabituel chez moi ? ». Les deux réponses viennent des mêmes relevés —
// c'est le cadrage qui change.
//
// Ce que ce module ajoute au lecteur, et lui seul :
//
//  - **La décomposition du coût.** Le rejeu affiche déjà un total (`stats.costUsd`,
//    qui coïncide au centime près avec le relevé — les deux plient les réponses
//    API de la même façon depuis `tokens.ts`). Ce qu'il ne dit pas, c'est en quoi
//    ce total se partage : construire la fenêtre, ou la relire. Sur une longue
//    session la relecture domine, et c'est le seul poste sur lequel on agit.
//  - **Le rang dans le parc.** Un montant nu ne dit rien à qui ne connaît pas son
//    propre parc ; « plus chère que 94 % de vos sessions » se lit.
//  - **Les constats qui la visent**, avec leur action — les mêmes règles que la
//    page Diagnostic, réduites à cette session.
//
// Rien n'est estimé ici qui ne le soit déjà ailleurs : les montants sont exacts,
// les tokens d'outils portent leur `~` comme partout.

import { detect, type Finding } from './rules.ts'
import { getSignals, type SessionSignal } from './signals.ts'
import {
  calibrate,
  percentileRank,
  // `valueOf` est aussi une méthode d'`Object` : l'alias évite une confusion qui
  // coûterait plus cher qu'une ligne.
  valueOf as valueFor,
  type MetricName,
  type Unit,
} from './thresholds.ts'

/** Un signal de cette session, situé dans le parc. */
export interface SessionRank {
  metric: MetricName
  label: string
  unit: Unit
  /** La valeur de cette session. */
  value: number
  /** Sa place dans le parc, entre 0 et 1 — voir `percentileRank`. */
  rank: number
  /** La médiane du parc, pour donner un repère au rang. */
  median: number
  /** Sessions du parc qui portent ce signal. */
  sampleSize: number
  /** `high` : plus haut est pire. Le rang se lit à l'endroit ou à l'envers. */
  direction: 'high' | 'low'
}

export interface CostBreakdown {
  total: number
  /** Entrée jamais mise en cache. */
  input: number
  /** Écriture du cache — construire la fenêtre. */
  cacheCreate: number
  /** Relecture du cache — la repasser au modèle, tour après tour. */
  cacheRead: number
  /** Le reste : la génération. Déduit, jamais négatif. */
  output: number
  /** Vrai si un modèle sans tarif a servi : le total est un plancher. */
  partial: boolean
  unpricedModels: string[]
}

export interface SessionDiagnostic {
  found: boolean
  sessionId: string
  project: string
  cost: CostBreakdown
  ranks: SessionRank[]
  findings: Finding[]
  /** Sessions du parc auxquelles celle-ci est comparée. */
  parcSessions: number
}

/**
 * Les signaux qu'on situe, dans l'ordre où on les lit.
 *
 * Le coût d'abord, puis ce que la session a *fait* : chercher plutôt que
 * construire, et relire ce qui était déjà là. Les deux derniers ne parlent plus
 * d'argent — c'est voulu, et c'est pourquoi le tiroir ne s'appelle plus « coût ».
 */
const RANKED: MetricName[] = ['sessionCost', 'cacheReadCost', 'toolTokens', 'toolErrorRate', 'cacheHitRatio', 'explorationRatio', 'rereadTokens']

function emptyDiagnostic(project: string, sessionId: string): SessionDiagnostic {
  return {
    found: false,
    sessionId,
    project,
    cost: {
      total: 0,
      input: 0,
      cacheCreate: 0,
      cacheRead: 0,
      output: 0,
      partial: false,
      unpricedModels: [],
    },
    ranks: [],
    findings: [],
    parcSessions: 0,
  }
}

/**
 * La génération, déduite du total.
 *
 * `signals` chiffre séparément l'entrée, l'écriture et la relecture du cache ;
 * ce qui reste est la sortie. La déduire évite un quatrième parcours des
 * cellules pour un chiffre qui, par construction, complète les trois autres.
 * Le plancher à zéro couvre le cas d'un modèle sans tarif, où les postes connus
 * peuvent dépasser un total lui-même incomplet.
 */
function breakdown(s: SessionSignal): CostBreakdown {
  const known = s.inputCost + s.cacheCreateCost + s.cacheReadCost
  return {
    total: s.cost,
    input: s.inputCost,
    cacheCreate: s.cacheCreateCost,
    cacheRead: s.cacheReadCost,
    output: Math.max(0, s.cost - known),
    partial: s.unpricedModels.length > 0,
    unpricedModels: s.unpricedModels,
  }
}

/**
 * Le diagnostic d'une session : son coût décomposé, sa place dans le parc, et
 * les constats qui la visent.
 *
 * Le parc entier est relu — `getSignals` le garde en cache, si bien que l'appel
 * coûte quelques dizaines de millisecondes une fois chaud. C'est le prix du
 * rang : situer une session demande de connaître les autres.
 *
 * `found: false` quand la session n'a produit aucune réponse : rien à dire, et
 * un diagnostic vide vaut mieux qu'un zéro qui se ferait passer pour une mesure.
 */
export async function diagnoseSession(project: string, sessionId: string): Promise<SessionDiagnostic> {
  const { signals } = await getSignals()
  const signal = signals.find((s) => s.sessionId === sessionId && s.project === project)
  if (!signal) return emptyDiagnostic(project, sessionId)

  const thresholds = calibrate(signals)

  // Les règles jugent session par session : ne lui passer qu'elle donne
  // exactement ses constats. Seule `socle-gaspille` raisonne sur l'ensemble, et
  // se tait ici — c'est juste, elle ne parle pas d'une session en particulier.
  const findings = detect([signal], thresholds)

  const ranks: SessionRank[] = []
  for (const metric of RANKED) {
    const calibration = thresholds.metrics[metric]
    const value = valueFor(metric, signal)
    if (value === null) continue
    // L'échantillon du parc pour ce signal, tel que la calibration l'a défini :
    // les sessions qui ne le portent pas ne sont pas des zéros, elles sont hors
    // sujet, et les compter fausserait le rang.
    const sample = signals.map((s) => valueFor(metric, s)).filter((v): v is number => v !== null)
    ranks.push({
      metric,
      label: calibration.label,
      unit: calibration.unit,
      value,
      rank: percentileRank(sample, value),
      median: calibration.quantiles.p50,
      sampleSize: calibration.sampleSize,
      direction: calibration.direction,
    })
  }

  return {
    found: true,
    sessionId,
    project,
    cost: breakdown(signal),
    ranks,
    findings,
    parcSessions: signals.length,
  }
}
