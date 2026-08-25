// Des constats à une décision.
//
// `rules.ts` désigne des sessions, une par une. Personne ne lit une centaine de
// constats. Ce
// module les regroupe par règle, les chiffre ensemble, les ordonne, et n'en
// retient que ce qui tient dans un écran : trois à cinq actions, chacune avec ce
// qu'elle coûte de ne rien faire.
//
// Ce qui est délibéré ici :
//
//  - **Le regroupement est par règle, pas par session.** Une session qui coûte
//    cher n'est pas une action ; « les sessions longues relisent leur historique »
//    en est une, et elle vaut pour les cinquante-deux d'un coup.
//  - **L'ordre vient de l'impact, pas de la gravité.** Une règle en `critical` sur
//    deux sessions passe derrière une règle en `warn` sur cinquante : c'est la
//    somme qui décide de ce qu'on fait lundi. La gravité reste dans les constats.
//  - **Ce qu'on ne sait pas est écrit noir sur blanc.** Un seuil non calibré, un
//    modèle sans tarif, une attribution qui ne couvre qu'un quart de la fenêtre :
//    tout cela figure dans `caveats`, et l'UI doit le rendre. Un rapport qui tait
//    ses angles morts se lit comme un devis.

import { createHash } from 'node:crypto'
import { t } from '../i18n/index.ts'
import type { Behaviour } from './behaviour.ts'
import { pct, ratio, tok, usd } from './format.ts'
import type { Pace } from './pace.ts'
import type { Finding, Impact, RuleName, Severity } from './rules.ts'
import type { SessionSignal } from './signals.ts'
import type { Thresholds } from './thresholds.ts'

// ── Ce qu'on publie ──────────────────────────────────────────────────────────

/** Une session (ou un projet) désignée par une recommandation, prête au clic. */
export interface Target {
  /** `sessionId` pour une session, slug pour un projet, `''` pour le parc. */
  id: string
  project: string
  /** Ce qu'on affiche : identifiant court et chiffre du constat. */
  label: string
  usd?: number
  tokens?: number
  severity: Severity
}

export interface Recommendation {
  /** Stable : dérivé de la seule règle. */
  id: string
  rule: RuleName
  /** La plus haute gravité parmi les constats regroupés. */
  severity: Severity
  title: string
  /** Ce qui a été observé, en deux ou trois phrases. */
  body: string
  /** Ce qu'il y a à faire, dit par AURA. Une à deux phrases. */
  action: string
  affected: number
  impact: Impact
  /** Les cas les plus lourds, pour aller voir. */
  targets: Target[]
  findingIds: string[]
  /**
   * Faux quand le seuil qui a déclenché ces constats venait du garde-fou faute
   * d'échantillon. L'UI doit le dire : ces cas sont plausibles, pas calibrés.
   */
  calibrated: boolean
}

export interface TopAction {
  recommendationId: string
  title: string
  /** Le problème, chiffré, en une phrase. */
  problem: string
  action: string
  impact: Impact
}

export interface ExecutiveSummary {
  period: { from: string; to: string }
  sessions: number
  /** Coût total du parc sur la période, aux tarifs API. */
  cost: number
  findings: number
  top: TopAction[]
  /** Ce que ce rapport ne sait pas. Toujours rendu à l'utilisateur. */
  caveats: string[]
}

export interface DiagnosticReport {
  summary: ExecutiveSummary
  recommendations: Recommendation[]
  /** Tous les constats, pour le détail et le drill-down. */
  findings: Finding[]
  thresholds: Thresholds
  /** Le rythme de la période : fenêtre de 5 h et sessions de front. */
  pace: Pace
  /** Ce que les sessions qui aboutissent font différemment, mesuré sur ce parc. */
  behaviour: Behaviour
}

// ── Le texte, par règle ──────────────────────────────────────────────────────
//
// Un titre et une action par règle. Le corps, lui, est construit à partir des
// chiffres du parc : une phrase fixe dirait la même chose d'un parc sain et d'un
// parc à la dérive.

// Le seul endroit du rapport où AURA parle en son nom. Les corps de
// recommandation (`bodyFor`) restent en voix neutre : ce sont des mesures, et
// une mesure n'appartient à personne. Le conseil, lui, engage celle qui le donne
// — voir docs/voix.md.
const titleOf = (rule: RuleName): string => t(`diagnostics.recommendations.titles.${rule}`)
const actionOf = (rule: RuleName): string => t(`diagnostics.recommendations.actions.${rule}`)

// ── Outillage ────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warn: 1, critical: 2 }

function makeId(rule: RuleName): string {
  return createHash('sha1').update(`reco|${rule}`).digest('hex').slice(0, 12)
}

/** Le chiffre d'un impact, tel qu'on l'écrit dans une phrase. */
function amount(impact: Impact): string {
  const parts: string[] = []
  if (impact.usd !== undefined) parts.push(usd(impact.usd))
  if (impact.tokens !== undefined) parts.push(`~${tok(impact.tokens)} tokens`)
  return parts.join(', ') || '—'
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/**
 * L'impact cumulé d'un groupe.
 *
 * `kind` retombe sur `estimated` dès qu'un seul constat l'est : une somme n'est
 * jamais plus sûre que son terme le plus faible.
 */
function sumImpacts(findings: Finding[]): Impact {
  let usdTotal = 0
  let tokensTotal = 0
  let hasUsd = false
  let hasTokens = false
  let kind: Impact['kind'] = 'measured'

  for (const f of findings) {
    if (f.impact.usd !== undefined) {
      usdTotal += f.impact.usd
      hasUsd = true
    }
    if (f.impact.tokens !== undefined) {
      tokensTotal += f.impact.tokens
      hasTokens = true
    }
    if (f.impact.kind === 'estimated') kind = 'estimated'
  }

  return {
    ...(hasUsd ? { usd: usdTotal } : {}),
    ...(hasTokens ? { tokens: tokensTotal } : {}),
    kind,
    basis: findings[0]?.impact.basis ?? '',
  }
}

/** Le poids d'une recommandation. Un dollar prime ; les tokens ordonnent le reste. */
function weight(impact: Impact): number {
  if (impact.usd !== undefined) return impact.usd
  return -1 / ((impact.tokens ?? 0) + 1)
}

// ── Le corps d'une recommandation ────────────────────────────────────────────

/**
 * Ce qui a été observé, dit avec les chiffres du parc.
 *
 * Chaque branche répond à la même question — « qu'est-ce qui se passe, au juste ? »
 * — avec la statistique qui éclaire cette règle-là, jamais un modèle de phrase
 * rempli au hasard.
 */
function bodyFor(rule: RuleName, findings: Finding[], signals: SessionSignal[]): string {
  const n = findings.length
  const sessions = n > 1 ? t('diagnostics.recommendations.manySessions', { n }) : t('diagnostics.recommendations.oneSession')
  const metric = (key: string): number[] => findings.map((f) => f.metrics[key] ?? 0)

  switch (rule) {
    case 'historique-relu': {
      const shares = metric('share')
      const turns = metric('turns')
      const peak = metric('peakContext')
      return t('diagnostics.recommendations.bodies.historique-relu', {
        sessions,
        share: pct(median(shares)),
        turns: Math.round(median(turns)),
        peak: tok(median(peak)),
      })
    }
    case 'cache-faible': {
      const ratios = metric('cacheHitRatio')
      const parc = findings[0]?.metrics.parcMedian ?? 0
      return t('diagnostics.recommendations.bodies.cache-faible', {
        sessions,
        ratio: pct(median(ratios)),
        median: pct(parc),
      })
    }
    case 'sous-agents-couteux': {
      const shares = metric('share')
      const agents = metric('agents').reduce((a, b) => a + b, 0)
      return t('diagnostics.recommendations.bodies.sous-agents-couteux', {
        sessions,
        agents,
        share: pct(median(shares)),
      })
    }
    case 'outils-gourmands': {
      const tools = new Map<string, number>()
      for (const s of signals) for (const t of s.tools) tools.set(t.name, (tools.get(t.name) ?? 0) + t.tokens)
      const top = [...tools].sort((a, b) => b[1] - a[1]).slice(0, 3)
      const all = [...tools.values()].reduce((a, b) => a + b, 0)
      return t('diagnostics.recommendations.bodies.outils-gourmands', {
        sessions,
        top: top.map(([name, v]) => `${name} ${pct(v / (all || 1))}`).join(', '),
      })
    }
    case 'outils-en-echec': {
      const rates = metric('errorRate')
      const errors = metric('errors').reduce((a, b) => a + b, 0)
      return t('diagnostics.recommendations.bodies.outils-en-echec', {
        sessions,
        errors,
        rate: pct(median(rates)),
      })
    }
    case 'compaction-lourde': {
      const discarded = metric('discardedTokens')
      const auto = metric('autoCompactions').reduce((a, b) => a + b, 0)
      return t('diagnostics.recommendations.bodies.compaction-lourde', {
        sessions,
        tokens: tok(median(discarded)),
        auto: auto ? t('diagnostics.recommendations.bodies.compactionAuto', { n: auto }) : t('diagnostics.recommendations.bodies.compactionManual'),
      })
    }
    case 'contexte-injecte': {
      const labels = new Map<string, number>()
      for (const s of signals) for (const i of s.topInjections) labels.set(i.label, (labels.get(i.label) ?? 0) + i.tokens)
      const top = [...labels].sort((a, b) => b[1] - a[1]).slice(0, 3)
      return t('diagnostics.recommendations.bodies.contexte-injecte', {
        sessions,
        top: top.length
          ? t('diagnostics.recommendations.bodies.injectedTop', {
              list: top.map(([l, v]) => `${l} (~${tok(v)})`).join(', '),
            })
          : '',
      })
    }
    case 'socle-gaspille': {
      const f = findings[0]
      return t('diagnostics.recommendations.bodies.socle-gaspille', {
        sessions: f?.metrics.sessions ?? 0,
        turns: f?.metrics.turns ?? 0,
      })
    }
    case 'exploration-sans-fin': {
      const ratios = metric('explorationRatio')
      const parc = findings[0]?.metrics.parcMedian ?? 0
      return t('diagnostics.recommendations.bodies.exploration-sans-fin', {
        sessions,
        ratio: ratio(median(ratios)),
        median: ratio(parc),
      })
    }
    case 'brief-morcele': {
      const perPrompt = metric('turnsPerPrompt')
      const parc = findings[0]?.metrics.parcMedian ?? 0
      return t('diagnostics.recommendations.bodies.brief-morcele', {
        sessions,
        ratio: ratio(median(perPrompt)),
        median: ratio(parc),
      })
    }
    case 'reorientations': {
      const total = metric('interruptions').reduce((a, b) => a + b, 0)
      return t('diagnostics.recommendations.bodies.reorientations', { sessions, total })
    }
    case 'relectures': {
      const tokens = metric('rereadTokens').reduce((a, b) => a + b, 0)
      const calls = metric('rereadCalls').reduce((a, b) => a + b, 0)
      return t('diagnostics.recommendations.bodies.relectures', {
        sessions,
        calls,
        tokens: tok(tokens),
      })
    }
    case 'fenetre-proche-limite': {
      const fills = metric('contextFill')
      const auto = metric('autoCompactions').reduce((a, b) => a + b, 0)
      return t('diagnostics.recommendations.bodies.fenetre-proche-limite', {
        sessions,
        fill: pct(median(fills)),
        auto: auto ? t('diagnostics.recommendations.bodies.windowAuto', { n: auto }) : t('diagnostics.recommendations.bodies.windowNoAuto'),
      })
    }
    case 'rythme-5h':
    case 'sessions-paralleles': {
      // Ces deux-là décrivent un état du parc, pas un lot de sessions : leur
      // constat unique porte déjà toute la phrase, et la reformuler ici la
      // dédoublerait.
      return findings[0]?.message ?? ''
    }
  }
}

// ── Croisements ──────────────────────────────────────────────────────────────

/**
 * Ce que deux règles disent ensemble et qu'aucune ne dit seule.
 *
 * Un croisement n'ajoute jamais de constat ni de chiffre : il ajoute une phrase
 * au corps d'une recommandation existante, quand les mêmes sessions se retrouvent
 * des deux côtés. C'est ce qui distingue une cause d'un symptôme.
 */
function applyCrossings(recommendations: Recommendation[], findings: Finding[]): void {
  const targetsOf = (rule: RuleName): Set<string> => new Set(findings.filter((f) => f.rule === rule && f.scope === 'session').map((f) => f.target))
  const find = (rule: RuleName): Recommendation | undefined => recommendations.find((r) => r.rule === rule)

  const overlap = (a: Set<string>, b: Set<string>): number => {
    let n = 0
    for (const x of a) if (b.has(x)) n++
    return n
  }

  const relu = targetsOf('historique-relu')
  const outils = targetsOf('outils-gourmands')
  const compact = targetsOf('compaction-lourde')
  const agents = targetsOf('sous-agents-couteux')

  const cross = (reco: Recommendation | undefined, n: number, key: string): void => {
    if (reco && n >= 1) reco.body += ` ${t(`diagnostics.recommendations.crossings.${key}`, { n })}`
  }

  cross(find('historique-relu'), overlap(relu, outils), 'reluOutils')
  cross(find('compaction-lourde'), overlap(compact, relu), 'compactRelu')
  cross(find('sous-agents-couteux'), overlap(agents, relu), 'agentsRelu')
}

// ── Les avertissements du rapport ────────────────────────────────────────────

function buildCaveats(signals: SessionSignal[], thresholds: Thresholds, recommendations: Recommendation[], behaviour: Behaviour): string[] {
  // Le seul endroit du rapport où AURA dit « je ne sais pas ». C'est exactement
  // ce que la charte réserve à la première personne : une limite appartient à
  // celle qui la constate.
  const caveats: string[] = []

  if (behaviour.comparable) {
    caveats.push(t('diagnostics.recommendations.caveats.throughput'))
  }

  caveats.push(t('diagnostics.recommendations.caveats.listPrices'))

  // `<synthetic>` n'est pas un modèle : c'est la marque d'un message fabriqué par
  // le harness (annulation, erreur). Le compter parmi les tarifs manquants ferait
  // douter d'un total qui, lui, ne lui doit rien.
  const unpriced = [...new Set(signals.flatMap((s) => s.unpricedModels))].filter((m) => m !== '<synthetic>').sort()
  if (unpriced.length) {
    caveats.push(
      t('diagnostics.recommendations.caveats.unpriced', {
        count: unpriced.length,
        models: unpriced.join(', '),
      }),
    )
  }

  const uncalibrated = recommendations.filter((r) => !r.calibrated).map((r) => r.title)
  if (uncalibrated.length) {
    caveats.push(t('diagnostics.recommendations.caveats.uncalibrated', { rules: uncalibrated.join(', ') }))
  }

  if (recommendations.some((r) => r.impact.kind === 'estimated')) {
    caveats.push(t('diagnostics.recommendations.caveats.estimates'))
  }

  void thresholds
  return caveats
}

// ── Construction ─────────────────────────────────────────────────────────────

/** La phrase-problème d'une action, tirée de son impact et de son ampleur. */
function problemOf(reco: Recommendation): string {
  const where = reco.affected > 1 ? t('diagnostics.recommendations.manySessions', { n: reco.affected }) : t('diagnostics.recommendations.oneSession')
  return t('diagnostics.recommendations.problem', {
    where,
    amount: amount(reco.impact),
    estimated: reco.impact.kind === 'estimated' ? t('diagnostics.recommendations.estimated') : '',
  })
}

function toTarget(f: Finding): Target {
  return {
    id: f.target,
    project: f.project,
    label: f.scope === 'session' ? `${f.target.slice(0, 8)}…` : f.target || t('diagnostics.recommendations.wholeFleet'),
    ...(f.impact.usd !== undefined ? { usd: f.impact.usd } : {}),
    ...(f.impact.tokens !== undefined ? { tokens: f.impact.tokens } : {}),
    severity: f.severity,
  }
}

/**
 * Le rapport complet : constats regroupés, ordonnés, et résumés.
 *
 * `findings` est rendu tel quel à côté des recommandations — l'UI en a besoin pour
 * le détail, et les taire ici obligerait à les recalculer.
 */
export function buildReport(
  signals: SessionSignal[],
  thresholds: Thresholds,
  findings: Finding[],
  pace: Pace,
  behaviour: Behaviour,
): DiagnosticReport {
  const groups = new Map<RuleName, Finding[]>()
  for (const f of findings) {
    const list = groups.get(f.rule)
    if (list) list.push(f)
    else groups.set(f.rule, [f])
  }

  const recommendations: Recommendation[] = []
  for (const [rule, group] of groups) {
    const impact = sumImpacts(group)
    recommendations.push({
      id: makeId(rule),
      rule,
      severity: group.reduce<Severity>((worst, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst] ? f.severity : worst), 'info'),
      title: titleOf(rule),
      body: bodyFor(rule, group, signals),
      action: actionOf(rule),
      affected: group.length,
      impact,
      targets: [...group]
        .sort((a, b) => weight(b.impact) - weight(a.impact))
        .slice(0, 5)
        .map(toTarget),
      findingIds: group.map((f) => f.id),
      // Un seul constat sur un seuil de repli suffit à marquer le groupe.
      calibrated: group.every((f) => f.trigger?.calibrated !== false),
    })
  }

  recommendations.sort((a, b) => weight(b.impact) - weight(a.impact) || a.rule.localeCompare(b.rule))
  applyCrossings(recommendations, findings)

  // ── Résumé ────────────────────────────────────────────────────────────────
  let from = ''
  let to = ''
  let cost = 0
  for (const s of signals) {
    cost += s.cost
    if (s.firstDay && (!from || s.firstDay < from)) from = s.firstDay
    if (s.firstDay && s.firstDay > to) to = s.firstDay
  }

  const summary: ExecutiveSummary = {
    period: { from, to },
    sessions: signals.length,
    cost,
    findings: findings.length,
    // Cinq actions au plus : au-delà, ce n'est plus une décision, c'est une liste.
    top: recommendations.slice(0, 5).map((r) => ({
      recommendationId: r.id,
      title: r.title,
      problem: problemOf(r),
      action: r.action,
      impact: r.impact,
    })),
    caveats: buildCaveats(signals, thresholds, recommendations, behaviour),
  }

  return { summary, recommendations, findings, thresholds, pace, behaviour }
}
