// Observability & maintenance over the managed dir: storage sizes + purge of
// cache-like areas, active sessions, and plans.
//
// These touch areas the general browsing API deliberately hides (sessions,
// caches…), so they live here with their own narrow, read-mostly surface. Purge
// and plan-delete are restricted to an explicit allowlist — never the transcripts
// or anything outside a known-safe set.

import { existsSync } from 'node:fs'
import { readdir, stat, readFile, rm } from 'node:fs/promises'
import { join, sep, dirname } from 'node:path'
import { loadEnv } from './env'
import { t } from './i18n/index.ts'
import { BACKUPS_DIR } from './paths'

const CLAUDE_DIR = loadEnv().claudeDir
const HOME_JSON = join(dirname(CLAUDE_DIR), '.claude.json')

/**
 * Encode an absolute path the way Claude Code names its project dir: every
 * character that is not a letter or a digit becomes `-`. This covers the path
 * separators and the drive colon, but also `_` and spaces — a `devl\_archives`
 * folder lands in `…-devl--archives-…`, with the doubled dash that a
 * separators-only encoding would miss.
 */
export function encodeProjectPath(path: string): string {
  return path.replace(/[^A-Za-z0-9]/g, '-').toLowerCase()
}

/**
 * Map each project's encoded folder name → its real path. `~/.claude.json`'s
 * `projects` keys hold the original paths, so we recover the exact Windows path
 * by re-encoding each and matching (case-insensitively).
 */
export async function realProjectPaths(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const j = JSON.parse(await readFile(HOME_JSON, 'utf8')) as {
      projects?: Record<string, unknown>
    }
    for (const p of Object.keys(j.projects ?? {})) {
      map.set(encodeProjectPath(p), p)
    }
  } catch {
    /* ~/.claude.json unreadable → no real paths */
  }
  return map
}

/** Recursively sum file sizes under a directory (0 if absent). */
async function dirSize(abs: string): Promise<number> {
  if (!existsSync(abs)) return 0
  let total = 0
  const stack = [abs]
  while (stack.length) {
    const d = stack.pop() as string
    let entries
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) stack.push(p)
      else {
        try {
          total += (await stat(p)).size
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  return total
}

// Le nom affiché n'est pas dans la table : il dépend de la langue, et la table
// est évaluée une fois à l'import. Il se lit dans `i18n/*.ts` sous la clé de la
// zone, au moment de répondre.
const STORAGE_AREAS: { key: string; rel: string; purgeable: boolean }[] = [
  { key: 'projects', rel: 'projects', purgeable: true },
  { key: 'file-history', rel: 'file-history', purgeable: true },
  { key: 'telemetry', rel: 'telemetry', purgeable: true },
  { key: 'paste-cache', rel: 'paste-cache', purgeable: true },
  { key: 'shell-snapshots', rel: 'shell-snapshots', purgeable: true },
  { key: 'plans', rel: 'plans', purgeable: true },
]

const PURGEABLE = new Set(STORAGE_AREAS.filter((a) => a.purgeable).map((a) => a.key))

export interface StorageArea {
  key: string
  label: string
  size: number
  purgeable: boolean
}

export async function getStorage(): Promise<{
  areas: StorageArea[]
  backups: number
  total: number
}> {
  const areas: StorageArea[] = []
  for (const a of STORAGE_AREAS) {
    areas.push({
      key: a.key,
      label: t(`storage.${a.key}`),
      size: await dirSize(join(CLAUDE_DIR, a.rel)),
      purgeable: a.purgeable,
    })
  }
  const backups = await dirSize(BACKUPS_DIR)
  const total = areas.reduce((s, a) => s + a.size, 0) + backups
  return { areas, backups, total }
}

export async function purgeArea(key: string): Promise<void> {
  if (key === 'backups') {
    await rm(BACKUPS_DIR, { recursive: true, force: true })
    return
  }
  if (!PURGEABLE.has(key)) throw new Error(`Zone non purgeable : ${key}`)
  await rm(join(CLAUDE_DIR, key), { recursive: true, force: true })
}

// ── Sessions ─────────────────────────────────────────────────────────────────
export interface SessionInfo {
  pid?: number
  sessionId: string
  cwd: string
  name?: string
  status?: string
  /** When `status` is `waiting`, what it's blocked on (e.g. `permission prompt`). */
  waitingFor?: string
  kind?: string
  startedAt?: number
  updatedAt?: number
  version?: string
  /** Project dir holding this session's transcript (`<sessionId>.jsonl`); '' if not located. */
  slug: string
}

/** Names of every project transcript dir under the managed tree. */
async function projectDirNames(): Promise<string[]> {
  const dir = join(CLAUDE_DIR, 'projects')
  if (!existsSync(dir)) return []
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
}

/**
 * Locate the project dir holding a session's transcript: we re-encode the
 * session's cwd and match an existing dir case-insensitively, so the returned
 * slug is the real on-disk name whatever its case.
 */
function slugForCwd(cwd: string, dirs: string[]): string {
  if (!cwd) return ''
  const enc = encodeProjectPath(cwd)
  return dirs.find((d) => d.toLowerCase() === enc) ?? ''
}

/**
 * Le processus tient-il encore ?
 *
 * Ces fichiers sont écrits au démarrage et effacés par le CLI quand il sort de
 * lui-même — mais lui seul les efface. Un processus tué, ou coupé au milieu d'un
 * tour, laisse le sien derrière : la session continue alors d'apparaître en
 * activité alors qu'il n'y a plus rien derrière. On demande donc au système.
 *
 * Le signal `0` ne tue rien, il interroge. `EPERM` veut dire « il existe mais il
 * ne vous appartient pas » : c'est un vivant. Sans PID, on ne peut rien conclure
 * et on garde l'entrée — mieux vaut un doute qu'un effacement.
 *
 * Reste un angle mort assumé : Windows réattribue les PID, donc un fichier
 * ancien peut désigner un processus sans rapport. Le fichier porte un `procStart`
 * qui trancherait, mais Node ne donne pas la date de démarrage d'un PID tiers.
 */
export function alive(pid?: number): boolean {
  if (!pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export async function listSessions(): Promise<SessionInfo[]> {
  const dir = join(CLAUDE_DIR, 'sessions')
  if (!existsSync(dir)) return []
  const dirs = await projectDirNames()
  const out: SessionInfo[] = []
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue
    let j: Record<string, unknown>
    try {
      j = JSON.parse(await readFile(join(dir, f), 'utf8')) as Record<string, unknown>
    } catch {
      continue
    }
    const cwd = typeof j.cwd === 'string' ? j.cwd : ''
    const pid = typeof j.pid === 'number' ? j.pid : undefined
    if (!alive(pid)) continue
    out.push({
      pid,
      sessionId: typeof j.sessionId === 'string' ? j.sessionId : '',
      cwd,
      name: typeof j.name === 'string' ? j.name : undefined,
      status: typeof j.status === 'string' ? j.status : undefined,
      waitingFor: typeof j.waitingFor === 'string' ? j.waitingFor : undefined,
      kind: typeof j.kind === 'string' ? j.kind : undefined,
      startedAt: typeof j.startedAt === 'number' ? j.startedAt : undefined,
      updatedAt: typeof j.updatedAt === 'number' ? j.updatedAt : undefined,
      version: typeof j.version === 'string' ? j.version : undefined,
      slug: slugForCwd(cwd, dirs),
    })
  }
  // Busy sessions first, then most recently updated.
  return out.sort((a, b) => (a.status === 'busy' ? 0 : 1) - (b.status === 'busy' ? 0 : 1) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

// ── Plans ────────────────────────────────────────────────────────────────────
function safePlan(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  if (!/^[A-Za-z0-9._-]+\.md$/.test(base)) throw new Error('Nom de plan invalide.')
  return base
}

/**
 * Map each plan file name → its owning project slug by scanning transcripts for
 * the harness-emitted `planFilePath`. That field is written by the plan-mode
 * session that created the plan, so it gives a reliable plan→project link the
 * random file name can't. A plan belongs to exactly one project, so first hit
 * wins (a plan merely referenced elsewhere appears as a plain path, not this
 * field, so it never collides). Only top-level `.jsonl` are scanned, not the
 * `subagents/` transcripts, to keep the pass cheap.
 *
 * Scanning every project reads the whole transcript corpus (hundreds of MB), so
 * pass `slug` to restrict the pass to one project when only its plans matter.
 */
async function planProjectIndex(slug?: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const root = join(CLAUDE_DIR, 'projects')
  if (!existsSync(root)) return map
  const re = /"planFilePath":"[^"]*?([A-Za-z0-9._-]+\.md)"/g
  let dirs: string[]
  if (slug) {
    dirs = [slug]
  } else {
    dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  }
  for (const dir of dirs) {
    let files: string[]
    try {
      files = (await readdir(join(root, dir))).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      let raw: string
      try {
        raw = await readFile(join(root, dir, f), 'utf8')
      } catch {
        continue
      }
      for (const m of raw.matchAll(re)) {
        const planPath = m[1]
        if (planPath && !map.has(planPath)) map.set(planPath, dir)
      }
    }
  }
  return map
}

export interface PlanEntry {
  name: string
  title: string
  mtime: number
  size: number
  /** Owning project slug + real path, empty when the plan predates `planFilePath`. */
  projectSlug: string
  projectPath: string
}

/**
 * All plans, newest first. With `slug`, only that project's plans: the index is
 * built from its transcripts alone, so any plan it doesn't claim is dropped.
 */
export async function listPlans(slug?: string): Promise<PlanEntry[]> {
  const dir = join(CLAUDE_DIR, 'plans')
  if (!existsSync(dir)) return []
  const [index, realPaths] = await Promise.all([planProjectIndex(slug), realProjectPaths()])
  const out: PlanEntry[] = []
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.md')) continue
    const projectSlug = index.get(f) ?? ''
    if (slug && !projectSlug) continue
    const abs = join(dir, f)
    let title = f
    try {
      const head = (await readFile(abs, 'utf8')).split('\n').find((l) => l.trim())
      if (head) title = head.replace(/^#+\s*/, '').slice(0, 120)
    } catch {
      /* ignore */
    }
    const s = await stat(abs)
    out.push({
      name: f,
      title,
      mtime: s.mtimeMs,
      size: s.size,
      projectSlug,
      projectPath: projectSlug ? (realPaths.get(projectSlug.toLowerCase()) ?? '') : '',
    })
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

export async function readPlan(name: string): Promise<string> {
  return readFile(join(CLAUDE_DIR, 'plans', safePlan(name)), 'utf8')
}

export async function deletePlan(name: string): Promise<void> {
  const abs = join(CLAUDE_DIR, 'plans', safePlan(name))
  // Belt-and-braces: never escape the plans dir.
  const root = join(CLAUDE_DIR, 'plans')
  if (abs !== root && !abs.startsWith(root + sep)) throw new Error('Chemin invalide.')
  await rm(abs, { force: true })
}
