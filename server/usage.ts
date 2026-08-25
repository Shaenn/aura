// Token-usage aggregation across every transcript in `~/.claude/projects`.
//
// The per-session parser in `transcript.ts` builds a full event stream, which is
// far too heavy to run over ~1200 files. This module does a narrow second pass:
// it reads only the `usage` payload of assistant responses and rolls them into
// buckets, keeping the raw lines out of memory.
//
// Two facts about the transcript format drive the design:
//
//  1. Claude Code writes one JSONL row per *content block*, so a single API
//     response repeats its `message.id` across several rows. Counting rows
//     inflates every total — fold them by `message.id`. The rows do *not* all
//     carry the same `usage`: `output_tokens` grows as the response streams, so
//     the last row holds the true count and the first holds a fraction of it.
//     Fold by taking the per-field maximum, never the first row.
//  2. Sub-agent turns live in `<session>/subagents/agent-*.jsonl`, beside a
//     `.meta.json` naming the agent type. Their tokens are invisible to anyone
//     who only walks `<slug>/*.jsonl`.

import { createReadStream } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { CLAUDE_DIR } from './claude/paths.ts'
import { str, num } from './json.ts'
import { costOf, isPriced, type TokenCounts } from './pricing.ts'
// Le pliage par `message.id` est partagé avec `diagnostics/signals.ts` : deux
// agrégateurs qui plieraient différemment donneraient deux vérités. Voir tokens.ts.
import { ZERO, addTokens, growth, localDay } from './tokens.ts'

/** One (day, model, project, branch, agent) cell of the usage cube. */
export interface Bucket extends TokenCounts {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string
  model: string
  /** Project slug (the `~/.claude/projects` directory name). */
  project: string
  branch: string
  /** Sub-agent type, or `null` for the main thread. */
  agentType: string | null
  /** API responses (deduped), not JSONL rows. */
  turns: number
  sessionId: string
}

// ── Scanning ─────────────────────────────────────────────────────────────────

interface FileRef {
  path: string
  project: string
  agentType: string | null
}

/** Every transcript under `projects/`: main threads plus sub-agent sidecars. */
async function listFiles(): Promise<FileRef[]> {
  const root = join(CLAUDE_DIR, 'projects')
  const out: FileRef[] = []
  let slugs: string[]
  try {
    slugs = await readdir(root)
  } catch {
    return out
  }

  for (const project of slugs) {
    const dir = join(root, project)
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.endsWith('.jsonl')) {
        out.push({ path: join(dir, entry), project, agentType: null })
        continue
      }
      // `<sessionId>/subagents/agent-<id>.jsonl` + `agent-<id>.meta.json`
      const subDir = join(dir, entry, 'subagents')
      let agents: string[]
      try {
        agents = await readdir(subDir)
      } catch {
        continue
      }
      for (const f of agents) {
        if (!f.endsWith('.jsonl')) continue
        const meta = join(subDir, f.replace(/\.jsonl$/, '.meta.json'))
        out.push({ path: join(subDir, f), project, agentType: await readAgentType(meta) })
      }
    }
  }
  return out
}

async function readAgentType(metaPath: string): Promise<string> {
  try {
    const raw = JSON.parse(await readFile(metaPath, 'utf8')) as Record<string, unknown>
    return str(raw.agentType, 'agent')
  } catch {
    return 'agent'
  }
}

/**
 * Roll one transcript into buckets.
 *
 * Streams the file: transcripts reach tens of megabytes and there are ~1200 of
 * them. The `"usage"` substring test skips the JSON.parse for the ~95% of rows
 * that are user turns, tool results, or harness bookkeeping.
 */
async function scanFile(ref: FileRef): Promise<Bucket[]> {
  const cells = new Map<string, Bucket>()
  /** Per `message.id`: the cell it landed in, and the tallies already added. */
  const seen = new Map<string, { cell: Bucket; counted: TokenCounts }>()

  const rl = createInterface({
    input: createReadStream(ref.path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  try {
    for await (const line of rl) {
      if (!line.includes('"usage"')) continue

      let row: Record<string, unknown>
      try {
        row = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }
      if (row.type !== 'assistant') continue

      const msg = (row.message ?? {}) as Record<string, unknown>
      const usage = msg.usage as Record<string, unknown> | undefined
      if (!usage) continue

      const tokens: TokenCounts = {
        input: num(usage.input_tokens),
        output: num(usage.output_tokens),
        cacheRead: num(usage.cache_read_input_tokens),
        cacheCreate: num(usage.cache_creation_input_tokens),
      }

      // A repeat of a response already counted: its `usage` is a later, larger
      // snapshot of the same API call, so top up the cell by the difference
      // rather than counting it again (or, as before, dropping it entirely).
      const id = str(msg.id)
      const prior = id ? seen.get(id) : undefined
      if (prior) {
        addTokens(prior.cell, growth(prior.counted, tokens))
        continue
      }

      const day = localDay(str(row.timestamp))
      if (!day) continue
      const model = str(msg.model, 'unknown')
      const branch = str(row.gitBranch, '(none)')
      const sessionId = str(row.sessionId)

      const key = `${day}\0${model}\0${branch}\0${ref.agentType ?? ''}`
      let cell = cells.get(key)
      if (!cell) {
        cell = {
          ...ZERO,
          day,
          model,
          project: ref.project,
          branch,
          agentType: ref.agentType,
          turns: 0,
          sessionId,
        }
        cells.set(key, cell)
      }
      cell.turns++
      addTokens(cell, tokens)
      if (id) seen.set(id, { cell, counted: { ...tokens } })
    }
  } finally {
    rl.close()
  }
  return [...cells.values()]
}

// ── Incremental cache ────────────────────────────────────────────────────────

interface CacheEntry {
  mtimeMs: number
  size: number
  buckets: Bucket[]
}

/**
 * Transcripts are append-only and immutable once a session ends, so a file
 * whose (mtime, size) is unchanged cannot have new tokens in it. Only the
 * handful of files touched since the last call are re-read.
 */
const cache = new Map<string, CacheEntry>()

async function collect(): Promise<{ buckets: Bucket[]; scanned: number }> {
  const files = await listFiles()
  const live = new Set<string>()
  const buckets: Bucket[] = []
  let scanned = 0

  for (const ref of files) {
    live.add(ref.path)
    let mtimeMs: number, size: number
    try {
      const s = await stat(ref.path)
      mtimeMs = s.mtimeMs
      size = s.size
    } catch {
      continue
    }

    const hit = cache.get(ref.path)
    if (hit && hit.mtimeMs === mtimeMs && hit.size === size) {
      buckets.push(...hit.buckets)
      continue
    }
    const fresh = await scanFile(ref)
    scanned++
    cache.set(ref.path, { mtimeMs, size, buckets: fresh })
    buckets.push(...fresh)
  }

  for (const path of cache.keys()) if (!live.has(path)) cache.delete(path)
  return { buckets, scanned }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface UsageTotals extends TokenCounts {
  turns: number
  cost: number
  sessions: number
}

export interface UsageReport {
  totals: UsageTotals
  byDay: (UsageTotals & { day: string })[]
  /** Per (day, model) — lets the UI stack a day's cost by model on one axis. */
  byDayModel: (UsageTotals & { day: string; model: string })[]
  byModel: (UsageTotals & { model: string })[]
  byProject: (UsageTotals & { project: string })[]
  byAgent: (UsageTotals & { agentType: string })[]
  /**
   * Models we have no price for. Their tokens are counted, their cost is not —
   * surfaced so the UI never presents a total that silently omits spend.
   */
  unpricedModels: string[]
  /** Inclusive bounds actually applied, or null when unbounded. */
  from: string | null
  to: string | null
  filesScanned: number
}

function emptyTotals(): UsageTotals {
  return { ...ZERO, turns: 0, cost: 0, sessions: 0 }
}

/** Fold buckets into one totals row, costing each bucket at its own rate. */
function fold(buckets: Bucket[]): UsageTotals {
  const t = emptyTotals()
  const sessions = new Set<string>()
  for (const b of buckets) {
    addTokens(t, b)
    t.turns += b.turns
    // Cost per (day, model) cell: a session mixes models, and a model can change
    // price over time, so a blended rate applied to summed tokens would be wrong.
    t.cost += costOf(b.model, b, b.day) ?? 0
    if (b.sessionId) sessions.add(b.sessionId)
  }
  t.sessions = sessions.size
  return t
}

function groupBy<K extends string>(buckets: Bucket[], key: (b: Bucket) => string, label: K): (UsageTotals & Record<K, string>)[] {
  const groups = new Map<string, Bucket[]>()
  for (const b of buckets) {
    const k = key(b)
    const list = groups.get(k)
    if (list) list.push(b)
    else groups.set(k, [b])
  }
  return [...groups.entries()]
    .map(([k, list]) => ({ ...fold(list), [label]: k }) as UsageTotals & Record<K, string>)
    .sort((a, b) => b.cost - a.cost || b.output - a.output)
}

/** Aggregate usage over an inclusive `YYYY-MM-DD` range (omit for all time). */
export async function getUsage(from?: string, to?: string): Promise<UsageReport> {
  const { buckets: all, scanned } = await collect()
  const buckets = all.filter((b) => (!from || b.day >= from) && (!to || b.day <= to))

  const unpriced = [...new Set(buckets.map((b) => b.model))].filter((m) => !isPriced(m)).sort()

  // Index once: a nested filter per (day, model) pair would be quadratic.
  const byPair = new Map<string, Bucket[]>()
  for (const b of buckets) {
    const k = `${b.day}${b.model}`
    const list = byPair.get(k)
    if (list) list.push(b)
    else byPair.set(k, [b])
  }
  const byDayModel = [...byPair.values()]
    .map((cells) => {
      const head = cells[0] as Bucket
      return { ...fold(cells), day: head.day, model: head.model }
    })
    .sort((a, b) => a.day.localeCompare(b.day) || a.model.localeCompare(b.model))

  return {
    totals: fold(buckets),
    byDay: groupBy(buckets, (b) => b.day, 'day').sort((a, b) => a.day.localeCompare(b.day)),
    byDayModel,
    byModel: groupBy(buckets, (b) => b.model, 'model'),
    byProject: groupBy(buckets, (b) => b.project, 'project'),
    byAgent: groupBy(
      buckets.filter((b) => b.agentType),
      (b) => b.agentType ?? '',
      'agentType',
    ),
    unpricedModels: unpriced,
    from: from ?? null,
    to: to ?? null,
    filesScanned: scanned,
  }
}
