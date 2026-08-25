// HTTP surface for managing the .claude directory (`/api/claude/*`).
//
// Design: a small generic file API (list / read / propose / apply) plus a few
// resource "index" endpoints that know the folder conventions and parse enough
// frontmatter for list views. Every write is two-phase:
//   1. POST /propose { path, content } -> { before, after, exists }  (no write)
//   2. POST /apply   { path, content, expectedBefore } -> { backupPath }
// The client shows the diff between /propose steps and only calls /apply once
// the human confirms.

import type { FastifyInstance } from 'fastify'
import { parseFrontmatter } from '../claude/frontmatter'
import { readText, readTextOrNull, listDir, exists, writeWithBackup, deleteWithBackup, ConflictError } from '../claude/fs'
import { PathError, CLAUDE_DIR } from '../claude/paths'
import { t } from '../i18n/index.ts'
import { str } from '../json.ts'
import { getPluginHooks } from '../plugin-hooks'

interface ResourceItem {
  rel: string
  name: string
  title: string
  description: string
  mtime: number
}

/** Turn a thrown PathError/Conflict into the right HTTP status; rethrow others. */
function httpError(err: unknown): { code: number; body: { error: string } } | null {
  if (err instanceof PathError) {
    const code = err.code === 'escape' ? 400 : 403
    return { code, body: { error: err.message } }
  }
  if (err instanceof ConflictError) {
    return { code: 409, body: { error: err.message } }
  }
  return null
}

export function registerClaude(app: FastifyInstance): void {
  // ── Generic file API ────────────────────────────────────────────────────────

  /** List a directory (root when no path). */
  app.get('/api/claude/list', async (req, reply) => {
    const path = str((req.query as Record<string, unknown>).path)
    try {
      return { entries: await listDir(path) }
    } catch (err) {
      const h = httpError(err)
      if (h) return reply.code(h.code).send(h.body)
      throw err
    }
  })

  /** Read one text file: { rel, content }. */
  app.get('/api/claude/file', async (req, reply) => {
    const path = str((req.query as Record<string, unknown>).path)
    if (!path) return reply.code(400).send({ error: t('errors.paramRequired', { name: 'path' }) })
    try {
      return { rel: path, content: await readText(path) }
    } catch (err) {
      const h = httpError(err)
      if (h) return reply.code(h.code).send(h.body)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return reply.code(404).send({ error: t('errors.fileNotFound') })
      }
      throw err
    }
  })

  /** Preview a write: returns current on-disk content vs the proposed one. */
  app.post('/api/claude/propose', async (req, reply) => {
    const body = (req.body ?? {}) as { path?: string; content?: string }
    if (typeof body.path !== 'string' || typeof body.content !== 'string') {
      return reply.code(400).send({ error: t('errors.bodyExpected', { shape: '{ path, content }' }) })
    }
    try {
      const before = await readTextOrNull(body.path)
      return { rel: body.path, exists: before !== null, before, after: body.content }
    } catch (err) {
      const h = httpError(err)
      if (h) return reply.code(h.code).send(h.body)
      throw err
    }
  })

  /** Commit a previously-previewed write (backs up, guards against clobber). */
  app.post('/api/claude/apply', async (req, reply) => {
    const body = (req.body ?? {}) as {
      path?: string
      content?: string
      expectedBefore?: string | null
    }
    if (typeof body.path !== 'string' || typeof body.content !== 'string') {
      return reply.code(400).send({ error: t('errors.bodyExpected', { shape: '{ path, content, expectedBefore }' }) })
    }
    try {
      const res = await writeWithBackup(body.path, body.content, body.expectedBefore ?? null)
      return res
    } catch (err) {
      const h = httpError(err)
      if (h) return reply.code(h.code).send({ ...h.body })
      throw err
    }
  })

  /**
   * Incrementally maintain a project's MEMORY.md index: add or remove the single
   * pointer line for one memory file, leaving every other line untouched.
   */
  app.post('/api/claude/memory-index', async (req, reply) => {
    const b = (req.body ?? {}) as {
      memRel?: string
      action?: string
      file?: string
      title?: string
      hook?: string
    }
    if (typeof b.memRel !== 'string' || typeof b.file !== 'string' || (b.action !== 'add' && b.action !== 'remove')) {
      return reply.code(400).send({
        error: t('errors.bodyExpected', { shape: '{ memRel, action, file, title?, hook? }' }),
      })
    }
    const indexRel = `${b.memRel}/MEMORY.md`
    try {
      const current = await readTextOrNull(indexRel)
      const next = updateMemoryIndex(current, b.action, b.file, b.title ?? b.file, b.hook ?? '')
      if (next === null || next === current) return { changed: false, rel: indexRel }
      const res = await writeWithBackup(indexRel, next, current)
      return { changed: true, rel: indexRel, backupPath: res.backupPath }
    } catch (err) {
      const h = httpError(err)
      if (h) return reply.code(h.code).send(h.body)
      throw err
    }
  })

  /** Delete a writable file or directory (backed up first). */
  app.post('/api/claude/delete', async (req, reply) => {
    const body = (req.body ?? {}) as { path?: string }
    if (typeof body.path !== 'string') {
      return reply.code(400).send({ error: t('errors.bodyExpected', { shape: '{ path }' }) })
    }
    try {
      return await deleteWithBackup(body.path)
    } catch (err) {
      const h = httpError(err)
      if (h) return reply.code(h.code).send(h.body)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return reply.code(404).send({ error: t('errors.entryNotFound') })
      }
      throw err
    }
  })

  // ── Resource indexes ────────────────────────────────────────────────────────

  /** Agents: agents/<name>.md — name/description from frontmatter. */
  app.get('/api/claude/agents', () => indexMarkdownDir('agents', '.md'))

  /** Skills: skills/<name>/SKILL.md. */
  app.get('/api/claude/skills', async (): Promise<{ items: ResourceItem[] }> => {
    if (!(await exists('skills'))) return { items: [] }
    const dirs = (await listDir('skills')).filter((e) => e.kind === 'dir')
    const items: ResourceItem[] = []
    for (const d of dirs) {
      const rel = `${d.rel}/SKILL.md`
      const text = await readTextOrNull(rel)
      if (text === null) continue
      const fm = parseFrontmatter(text)
      items.push({
        rel,
        name: d.name,
        title: fm.data.name ?? d.name,
        description: fm.data.description ?? '',
        mtime: d.mtime,
      })
    }
    return { items }
  })

  /** Global memory (CLAUDE.md) plus structured per-project memories (with type). */
  app.get('/api/claude/memories', async () => {
    const global = { rel: 'CLAUDE.md', exists: await exists('CLAUDE.md') }
    const projects: {
      slug: string
      memRel: string
      indexRel: string | null
      items: { rel: string; name: string; title: string; description: string; type: string }[]
    }[] = []

    if (await exists('projects')) {
      for (const p of (await listDir('projects')).filter((e) => e.kind === 'dir')) {
        const memRel = `${p.rel}/memory`
        if (!(await exists(memRel))) continue
        const files = (await listDir(memRel)).filter((e) => e.kind === 'file' && e.name.endsWith('.md'))
        if (!files.length) continue

        let indexRel: string | null = null
        const items: {
          rel: string
          name: string
          title: string
          description: string
          type: string
        }[] = []
        for (const f of files) {
          if (f.name === 'MEMORY.md') {
            indexRel = f.rel
            continue // the index isn't a structured memory
          }
          const text = (await readTextOrNull(f.rel)) ?? ''
          const fm = parseFrontmatter(text)
          // metadata.type is nested under `metadata:`; a flat scan of the raw
          // frontmatter finds the `type:` line whatever its indentation.
          const typeMatch = /^\s*type:\s*(\S+)/m.exec(fm.raw)
          const name = f.name.replace(/\.md$/, '')
          items.push({
            rel: f.rel,
            name,
            title: fm.data.name ?? name,
            description: fm.data.description ?? '',
            type: typeMatch?.[1] ?? '',
          })
        }
        projects.push({ slug: p.name, memRel, indexRel, items })
      }
    }
    return { global, projects }
  })

  /** Installed plugins + known marketplaces (for the settings toggles). */
  app.get('/api/claude/plugins', async () => {
    const installed: { id: string; version: string; scope: string }[] = []
    const rawInstalled = await readTextOrNull('plugins/installed_plugins.json')
    if (rawInstalled) {
      try {
        const parsed = JSON.parse(rawInstalled) as {
          plugins?: Record<string, { version?: string; scope?: string }[]>
        }
        for (const [id, entries] of Object.entries(parsed.plugins ?? {})) {
          const first = entries[0]
          installed.push({ id, version: first?.version ?? '', scope: first?.scope ?? '' })
        }
      } catch {
        /* malformed file — report an empty list rather than 500 */
      }
    }

    const marketplaces: { name: string; sourceType: string; location: string }[] = []
    const rawMk = await readTextOrNull('plugins/known_marketplaces.json')
    if (rawMk) {
      try {
        const parsed = JSON.parse(rawMk) as Record<string, { source?: { source?: string; path?: string; repo?: string } }>
        for (const [name, def] of Object.entries(parsed)) {
          const s = def.source ?? {}
          marketplaces.push({
            name,
            sourceType: s.source ?? '',
            location: s.path ?? s.repo ?? '',
          })
        }
      } catch {
        /* malformed — empty */
      }
    }
    return { installed, marketplaces }
  })

  /** Hooks contributed by installed plugins (read-only; not in settings.json). */
  app.get('/api/claude/plugin-hooks', () => getPluginHooks())

  /** System info for the status bar (managed dir + Claude Code version). */
  app.get('/api/claude/system', async () => {
    let version = ''
    const raw = await readTextOrNull('.last-update-result.json')
    if (raw) {
      try {
        version = (JSON.parse(raw) as { version_to?: string }).version_to ?? ''
      } catch {
        /* malformed — no version */
      }
    }
    return { claudeDir: CLAUDE_DIR, version }
  })

  /** High-level inventory for the dashboard. */
  app.get('/api/claude/overview', async () => {
    async function countDir(rel: string, suffix: string): Promise<number> {
      if (!(await exists(rel))) return 0
      return (await listDir(rel)).filter((e) => e.name.endsWith(suffix)).length
    }
    return {
      settingsExists: await exists('settings.json'),
      claudeMdExists: await exists('CLAUDE.md'),
      agents: await countDir('agents', '.md'),
      skills: (await exists('skills')) ? (await listDir('skills')).filter((e) => e.kind === 'dir').length : 0,
      plugins: await countInstalledPlugins(),
    }
  })
}

/**
 * Add/remove one pointer line (`- [Title](file.md) — hook`) in a MEMORY.md
 * index, preserving all other lines. Returns the new text, or null for a no-op.
 */
function updateMemoryIndex(current: string | null, action: 'add' | 'remove', file: string, title: string, hook: string): string | null {
  const esc = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const linkRe = new RegExp(`\\]\\(${esc}\\)`) // matches "](file.md)"
  const entry = `- [${title}](${file})${hook ? ` — ${hook}` : ''}`
  const src = current ?? ''
  const lines = src.split('\n')
  const at = lines.findIndex((l) => linkRe.test(l))
  function norm(ls: string[]): string {
    return (
      ls
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\n+$/, '') + '\n'
    )
  }

  if (action === 'remove') {
    if (at < 0) return null // not indexed → no-op
    lines.splice(at, 1)
    return norm(lines)
  }

  // add / update — preserve position (and surrounding blank lines) if it exists.
  if (at >= 0) {
    if (lines[at] === entry) return current // already up to date
    lines[at] = entry
    return norm(lines)
  }
  if (!src.trim()) return `# Memory Index\n\n${entry}\n`
  return norm([...lines, entry])
}

/** Count installed plugins from the plugins registry (0 when absent/malformed). */
async function countInstalledPlugins(): Promise<number> {
  const raw = await readTextOrNull('plugins/installed_plugins.json')
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { plugins?: Record<string, unknown> }
    return Object.keys(parsed.plugins ?? {}).length
  } catch {
    return 0
  }
}

/** Shared indexer for a flat directory of `<name><suffix>` Markdown resources. */
async function indexMarkdownDir(dir: string, suffix: string): Promise<{ items: ResourceItem[] }> {
  if (!(await exists(dir))) return { items: [] }
  const files = (await listDir(dir)).filter((e) => e.kind === 'file' && e.name.endsWith(suffix))
  const items: ResourceItem[] = []
  for (const f of files) {
    const text = (await readTextOrNull(f.rel)) ?? ''
    const fm = parseFrontmatter(text)
    const name = f.name.slice(0, -suffix.length)
    items.push({
      rel: f.rel,
      name,
      title: fm.data.name ?? name,
      description: fm.data.description ?? '',
      mtime: f.mtime,
    })
  }
  return { items }
}
