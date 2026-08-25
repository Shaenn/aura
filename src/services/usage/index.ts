import { apiHeaders } from '@/services/http'

// Client for the token-usage API (`/api/usage`).

export interface UsageTotals {
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
  turns: number
  cost: number
  sessions: number
}

export interface UsageReport {
  totals: UsageTotals
  byDay: (UsageTotals & { day: string })[]
  /** Per (day, model) — the daily cost stacked by model, on a single axis. */
  byDayModel: (UsageTotals & { day: string; model: string })[]
  byModel: (UsageTotals & { model: string })[]
  byProject: (UsageTotals & { project: string })[]
  byAgent: (UsageTotals & { agentType: string })[]
  /** Models with no known price — their tokens count, their cost doesn't. */
  unpricedModels: string[]
  from: string | null
  to: string | null
  filesScanned: number
}

async function req<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: apiHeaders() })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const b = (await res.json()) as { error?: string }
      if (b.error) msg = b.error
    } catch {
      /* non-JSON */
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

/** Inclusive `YYYY-MM-DD` bounds; omit both for all time. */
export function getUsage(from?: string, to?: string): Promise<UsageReport> {
  const q = new URLSearchParams()
  if (from) q.set('from', from)
  if (to) q.set('to', to)
  const qs = q.toString()
  return req(`/api/usage${qs ? `?${qs}` : ''}`)
}

/** The date ranges offered by the page's filter, resolved against "today". */
export type RangeKey = '7d' | '30d' | '90d' | 'all'

export function resolveRange(key: RangeKey, today = new Date()): { from?: string; to?: string } {
  if (key === 'all') return {}
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90
  const start = new Date(today)
  start.setDate(start.getDate() - (days - 1))
  return { from: isoDay(start), to: isoDay(today) }
}

function isoDay(d: Date): string {
  function p(n: number) {
    return String(n).padStart(2, '0')
  }
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
