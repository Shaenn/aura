import { apiHeaders } from 'src/services/http';

// Client for the cost-diagnostics API (`/api/diagnostics`).
//
// The shapes mirror `server/diagnostics/*`. They are restated here rather than
// imported: the SPA builds against `src/`, and a type that crossed the boundary
// would drag the whole server module graph into the bundle. `shared/` exists for
// types both sides *construct*; these the SPA only reads.

export type Severity = 'info' | 'warn' | 'critical';
export type Scope = 'session' | 'project' | 'global';

export interface Impact {
  usd?: number;
  tokens?: number;
  /** `measured` : lu dans le transcript. `estimated` : dérivé d'un chars/4. */
  kind: 'measured' | 'estimated';
  /** D'où sort le chiffre, en une phrase. À rendre à l'utilisateur. */
  basis: string;
}

export interface Trigger {
  metric: string;
  value: number;
  threshold: number;
  calibrated: boolean;
  bound: 'percentile' | 'guard';
}

export interface Finding {
  id: string;
  rule: string;
  severity: Severity;
  scope: Scope;
  target: string;
  project: string;
  title: string;
  message: string;
  metrics: Record<string, number>;
  impact: Impact;
  trigger?: Trigger;
}

export interface Target {
  id: string;
  project: string;
  label: string;
  usd?: number;
  tokens?: number;
  severity: Severity;
}

export interface Recommendation {
  id: string;
  rule: string;
  severity: Severity;
  title: string;
  body: string;
  action: string;
  affected: number;
  impact: Impact;
  targets: Target[];
  findingIds: string[];
  calibrated: boolean;
}

export interface TopAction {
  recommendationId: string;
  title: string;
  problem: string;
  action: string;
  impact: Impact;
}

export interface ExecutiveSummary {
  period: { from: string; to: string };
  sessions: number;
  cost: number;
  findings: number;
  top: TopAction[];
  caveats: string[];
}

/** `ratio` est une part (en %), `rate` un rapport (1,5 par modification). */
export type Unit = 'usd' | 'tokens' | 'ratio' | 'count' | 'rate';

export interface Calibration {
  metric: string;
  label: string;
  /** Ce que le signal mesure — rédigé côté serveur, au plus près du calcul. */
  help: string;
  unit: Unit;
  direction: 'high' | 'low';
  value: number;
  percentile: number | null;
  rank: number;
  guard: number;
  /** L'ordre de grandeur qui justifie le garde-fou — un percentile se relit, un plancher non. */
  guardBasis: string;
  bound: 'percentile' | 'guard';
  sampleSize: number;
  calibrated: boolean;
  hits: number;
  /** Ce que pèsent les cas retenus. `null` si les coûts n'ont pas été fournis. */
  hitsCost: number | null;
  /** Ce que le garde-fou fait taire — `null` quand c'est le percentile qui décide. */
  silenced: {
    sessions: number;
    cost: number | null;
    /** La part que nul autre signal ne rattrape : le vrai prix du plancher. */
    orphans: { sessions: number; cost: number } | null;
  } | null;
  quantiles: { p50: number; p75: number; p90: number; min: number; max: number };
}

export interface Thresholds {
  sessions: number;
  reliable: boolean;
  /** Quand les garde-fous ont été revus à la main, et sur quel corpus. */
  reviewed: { on: string; sessions: number; cost: number };
  metrics: Record<string, Calibration>;
}

// ── Le rythme (`/api/diagnostics/pace`) ──────────────────────────────────────

export interface PaceWindows {
  samples: number;
  quantiles: { p50: number; p75: number; p90: number; max: number };
  peak: { cost: number; at: string };
  threshold: number;
  calibrated: boolean;
}

export interface PaceCurrent {
  cost: number;
  from: string;
  to: string;
  sessions: number;
  /** Place de cette fenêtre parmi les autres, entre 0 et 1. */
  rank: number;
}

export interface PaceConcurrency {
  max: number;
  hoursAtLeast2: number;
  hoursByLevel: number[];
  activeHours: number;
  threshold: number;
}

export interface Pace {
  windowHours: number;
  current: PaceCurrent;
  windows: PaceWindows;
  concurrency: PaceConcurrency;
}

// ── Comment on travaille ─────────────────────────────────────────────────────

/** Un geste, vu chez les deux extrêmes du rendement. Voir `behaviour.ts`. */
export interface BehaviourStat {
  median: number;
  top: number;
  bottom: number;
}

export interface Behaviour {
  sessions: number;
  /** Faux quand l'échantillon est trop maigre pour opposer deux quarts. */
  comparable: boolean;
  editsPerHour: BehaviourStat;
  explorationRatio: BehaviourStat;
  turnsPerPrompt: BehaviourStat;
  interruptedShare: { top: number; bottom: number };
}

export interface DiagnosticReport {
  summary: ExecutiveSummary;
  recommendations: Recommendation[];
  findings: Finding[];
  thresholds: Thresholds;
  pace: Pace;
  behaviour: Behaviour;
}

// ── Diagnostic d'une session (lecteur de transcripts) ────────────────────────

export interface CostBreakdown {
  total: number;
  input: number;
  cacheCreate: number;
  cacheRead: number;
  output: number;
  /** Un modèle sans tarif a servi : le total est un plancher. */
  partial: boolean;
  unpricedModels: string[];
}

export interface SessionRank {
  metric: string;
  label: string;
  unit: Unit;
  value: number;
  /** Place dans le parc, entre 0 et 1. */
  rank: number;
  median: number;
  sampleSize: number;
  direction: 'high' | 'low';
}

export interface SessionDiagnostic {
  found: boolean;
  sessionId: string;
  project: string;
  cost: CostBreakdown;
  ranks: SessionRank[];
  findings: Finding[];
  parcSessions: number;
}

async function req<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b.error) msg = b.error;
    } catch {
      /* non-JSON */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/** Le diagnostic d'une session : coût décomposé, rang dans le parc, constats. */
export function getSessionDiagnostic(project: string, id: string): Promise<SessionDiagnostic> {
  const q = new URLSearchParams({ project, id });
  return req(`/api/diagnostics/session?${q.toString()}`);
}

/** Inclusive `YYYY-MM-DD` bounds; omit both for all time. */
export function getDiagnostics(from?: string, to?: string): Promise<DiagnosticReport> {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  return req(`/api/diagnostics${qs ? `?${qs}` : ''}`);
}
