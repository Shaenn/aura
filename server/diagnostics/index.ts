// Le diagnostic, d'un bout à l'autre.
//
// Quatre modules, une chaîne : mesurer (`signals`), calibrer (`thresholds`),
// désigner (`rules`), décider (`recommend`). Ce fichier n'est que la couture —
// il existe pour que la route, les tests et un script aient un seul appel à
// faire, et pour qu'on ne puisse pas les enchaîner dans le mauvais ordre.

import { buildBehaviour } from './behaviour.ts'
import { buildPace } from './pace.ts'
import { buildReport, type DiagnosticReport } from './recommend.ts'
import { detect, type RuleName } from './rules.ts'
import { getSignals } from './signals.ts'
import { calibrate, type MetricName } from './thresholds.ts'

export type { SessionSignal, InjectionCost, ModelCost, SubagentCost, ToolCost } from './signals.ts'
export type { Calibration, MetricName, Thresholds } from './thresholds.ts'
export type { Finding, Impact, RuleName, Scope, Severity, Trigger } from './rules.ts'
export type { DiagnosticReport, ExecutiveSummary, Recommendation, Target, TopAction } from './recommend.ts'
export type { CostBreakdown, SessionDiagnostic, SessionRank } from './session.ts'
export type { Pace, PaceConcurrency, PaceCurrent, PaceWindows } from './pace.ts'
export type { Behaviour, BehaviourStat } from './behaviour.ts'
export { getPace, resetPaceCache } from './pace.ts'
export { RULE_NAMES } from './rules.ts'
export { METRIC_NAMES, MIN_SAMPLE, percentileRank } from './thresholds.ts'
export { getSignals, resetSignalsCache } from './signals.ts'
export { diagnoseSession } from './session.ts'

export interface DiagnoseOptions {
  /** Bornes `AAAA-MM-JJ` inclusives sur le jour de démarrage d'une session. */
  from?: string
  to?: string
  /** Constats à taire, par `id` stable. */
  ignore?: string[]
  /** Règles désactivées. */
  disabled?: RuleName[]
  /** Seuils imposés par l'utilisateur, qui priment sur la calibration. */
  overrides?: Partial<Record<MetricName, number>>
}

/**
 * Le rapport de diagnostic sur une période.
 *
 * Le filtre de dates s'applique **avant** la calibration, et c'est voulu : les
 * seuils décrivent le parc qu'on regarde. Calibrer sur deux ans pour juger la
 * semaine écoulée comparerait des sessions à un passé qu'on a justement exclu.
 */
export async function diagnose(options: DiagnoseOptions = {}): Promise<DiagnosticReport> {
  const { signals: all, points: allPoints } = await getSignals()
  const signals = all.filter(
    (s) => (!options.from || (s.firstDay && s.firstDay >= options.from)) && (!options.to || (s.firstDay && s.firstDay <= options.to)),
  )

  // Le rythme suit le même filtre, par les sessions retenues : un point est daté
  // de sa réponse, alors qu'une session appartient à la période par son *premier*
  // jour. Filtrer les points sur leur propre date couperait en deux les sessions
  // à cheval sur la borne, et la fenêtre de 5 h qui l'enjambe avec.
  const kept = new Set(signals.map((s) => s.sessionId))
  const points = allPoints.filter((p) => kept.has(p.sessionId))
  const pace = buildPace(signals, points, Date.now())

  const thresholds = calibrate(signals, options.overrides ?? {})
  const findings = detect(signals, thresholds, {
    pace,
    ...(options.ignore ? { ignore: options.ignore } : {}),
    ...(options.disabled ? { disabled: options.disabled } : {}),
  })

  return buildReport(signals, thresholds, findings, pace, buildBehaviour(signals))
}
