// First-class "Projects" surface (`/api/projects/*`).
//
// A project has three data sources:
//   1. Its transcripts — under the managed dir at ~/.claude/projects/<slug>/*.jsonl
//      (handled via ./transcript).
//   2. Its *own* .claude folder — at the real source path (e.g.
//      C:/…/projets/mon-app/.claude), OUTSIDE the managed dir. This module
//      reads that folder READ-ONLY, sandboxed to <root>/.claude, never writing.
//   3. Its CLAUDE.md memory files, which live in the source tree itself (root and
//      sub-folders), outside .claude. Those get their own scan and their own
//      read endpoint, sandboxed to <root> *and* to the CLAUDE.md file name.
//
// The real source path per slug comes from the trusted ~/.claude.json map
// (realProjectPaths), never from client input — so a client can't point us at
// an arbitrary folder. Within .claude we still guard against `..` escapes and
// hide credential-like files.

import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, normalize, sep, basename, relative } from 'node:path'
import type {
  FolderCandidate,
  HookEntry,
  IncludedFolder,
  ProjectDetail,
  ProjectResources,
  ProjectSummary,
  ResourceCategory,
  ResourceNode,
} from '../shared/projects.ts'
import type { SessionMetrics, TranscriptSummary } from '../shared/transcript.ts'
import { parseFrontmatter } from './claude/frontmatter'
import { canonicalPath } from './claude/paths.ts'
import { getSignals, type SessionSignal } from './diagnostics/index.ts'
import { loadEnv } from './env'
import { t } from './i18n/index.ts'
import { str } from './json.ts'
import { realProjectPaths, listPlans, type PlanEntry } from './maintenance'
import { includedFoldersOf } from './preferences.ts'
import { folderCandidates, listIncludedFolders, resolveIncludedFile, sanitizeFolders } from './project-folders.ts'
import { eachImage } from './transcript'
import { listTranscripts, readTranscriptCached, type CachedTranscript } from './transcript-cache.ts'

export type { FolderCandidate, HookEntry, IncludedFolder, ProjectDetail, ProjectResources, ProjectSummary, ResourceCategory, ResourceNode }

const CLAUDE_DIR = loadEnv().claudeDir
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects')

// Files we never expose even in read-only mode. Exported because the Workshop's
// `@` completion applies the same rule: a path we would refuse to read is not a
// path we offer to type.
export const SECRET = /(^\.credentials|credential|\.env(\.|$)|secret|\.key$|\.pem$)/i

// Les fichiers qu'un projet porte hors de `.claude`, et les seuls que ce module
// accepte d'ouvrir dans l'arborescence des sources. Tout est matché sans tenir
// compte de la casse : Windows et macOS ne la distinguent pas, donc `claude.md`
// sur disque est le même fichier.
//
// Deux familles, deux portées :
//
//   - `memory` — les instructions d'agents. Elles s'empilent par niveau, comme
//     Claude Code les empile lui-même, donc on les cherche dans tout l'arbre.
//   - `repo` — les documents que tout dépôt porte. Un README de sous-dossier n'a
//     pas ce statut : dans un monorepo, la liste ne finirait pas. D'où la racine
//     seule, plus les gabarits de `.github/`, dont le chemin est fixe.
const AGENT_INSTRUCTION_FILE = /^(CLAUDE|AGENTS|GEMINI)\.md$|^\.(cursorrules|windsurfrules)$/i
const COPILOT_INSTRUCTIONS = /^\.github\/copilot-instructions\.md$/i
const REPO_DOC_FILE =
  /^(README|CONTRIBUTING|CHANGELOG|HISTORY|SECURITY|CODE_OF_CONDUCT|ARCHITECTURE|SUPPORT|GOVERNANCE|MAINTAINERS|AUTHORS|CONTRIBUTORS|INSTALL|UPGRADING|UPGRADE|MIGRATING|MIGRATION|ROADMAP|TODO|LICENSE|LICENCE|COPYING|NOTICE)(\.(md|markdown|rst|txt))?$/i
const GITHUB_TEMPLATE = /^\.github\/(PULL_REQUEST_TEMPLATE\.md|(PULL_REQUEST_TEMPLATE|ISSUE_TEMPLATE)\/[^/]+\.(md|ya?ml))$/i

/**
 * De quelle famille relève un chemin de l'arborescence des sources, ou `null`
 * s'il n'en relève d'aucune.
 *
 * C'est la seule liste blanche du module qui sorte de `.claude`, et elle sert
 * aux deux bouts : le parcours ne récolte que ce qu'elle nomme, la lecture
 * n'ouvre que ce qu'elle nomme. Élargir l'une sans l'autre serait soit un
 * fichier listé qu'on refuse d'ouvrir, soit un fichier ouvrable que rien
 * n'annonce — d'où la fonction unique.
 *
 * `rel` est un chemin POSIX relatif à la racine du projet. Une évasion (`../…`)
 * ne peut rien en tirer : les deux formes ancrées ne matchent pas, et une
 * famille reconnue au seul nom de fichier reste doublée par la vérification de
 * préfixe côté lecture.
 */
export function sourceFileKind(rel: string): 'memory' | 'repo' | null {
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  if (AGENT_INSTRUCTION_FILE.test(name)) return 'memory'
  if (COPILOT_INSTRUCTIONS.test(rel)) return 'memory'
  if (GITHUB_TEMPLATE.test(rel)) return 'repo'
  if (!rel.includes('/') && REPO_DOC_FILE.test(name)) return 'repo'
  return null
}

// Scanning a whole source tree is the one place this module touches something
// bigger than .claude, so the walk is bounded three ways: skip the usual heavy
// or generated folders, stop at MEMORY_MAX_DEPTH levels below the root, and give
// up after MEMORY_MAX_DIRS directories. A pathological monorepo degrades to a
// partial list, never to a hung request.
export const HEAVY_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  '.claude', // already inventoried by walkResources
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '.quasar',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.gradle',
  '.idea',
  '.vscode',
])
const MEMORY_MAX_DEPTH = 6
const MEMORY_MAX_DIRS = 4000

export class ProjectError extends Error {
  constructor(
    message: string,
    readonly code: 'not-found' | 'no-source' | 'escape' | 'denied' = 'not-found',
  ) {
    super(message)
  }
}

function isSlugSafe(slug: string): boolean {
  return Boolean(slug) && slug !== '.' && !slug.includes('..') && !/[\\/]/.test(slug)
}

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
      else
        try {
          total += (await stat(p)).size
        } catch {
          /* skip */
        }
    }
  }
  return total
}

// ── Summaries ────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<ProjectSummary[]> {
  if (!existsSync(PROJECTS_DIR)) return []
  const realPaths = await realProjectPaths()
  const out: ProjectSummary[] = []
  for (const d of await readdir(PROJECTS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const abs = join(PROJECTS_DIR, d.name)
    let sessions = 0
    let lastActivity = 0
    try {
      for (const f of await readdir(abs, { withFileTypes: true })) {
        if (f.isFile() && f.name.endsWith('.jsonl')) {
          sessions++
          try {
            const m = (await stat(join(abs, f.name))).mtimeMs
            if (m > lastActivity) lastActivity = m
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* ignore */
    }
    const realPath = realPaths.get(d.name.toLowerCase()) ?? ''
    out.push({
      slug: d.name,
      path: realPath,
      name: realPath ? basename(realPath.replace(/[\\/]+$/, '')) : d.name,
      size: await dirSize(abs),
      sessions,
      lastActivity,
      hasClaudeDir: realPath ? existsSync(join(realPath, '.claude')) : false,
    })
  }
  return out.sort((a, b) => b.lastActivity - a.lastActivity)
}

// ── Source .claude inventory ─────────────────────────────────────────────────

/** Resolve a slug to its real source path via the trusted map, or throw. */
async function sourceRootOf(slug: string): Promise<string> {
  if (!isSlugSafe(slug)) throw new ProjectError('Slug de projet invalide.', 'escape')
  const realPaths = await realProjectPaths()
  const root = realPaths.get(slug.toLowerCase())
  if (!root) throw new ProjectError('Chemin source du projet inconnu.', 'no-source')
  return root
}

/** Resolve a slug to its source .claude root, or throw. */
async function claudeRootOf(slug: string): Promise<string> {
  const claudeRoot = join(await sourceRootOf(slug), '.claude')
  if (!existsSync(claudeRoot)) throw new ProjectError('Ce projet n’a pas de dossier .claude.', 'no-source')
  return claudeRoot
}

/** Infer a resource category from a path relative to .claude. */
function categoryOf(rel: string): ResourceCategory {
  const top = rel.split('/')[0] ?? ''
  switch (top) {
    case 'agents':
      return 'agents'
    case 'skills':
      return 'skills'
    case 'commands':
      return 'commands'
    case 'rules':
      return 'rules'
    case 'hooks':
      return 'hooks'
    case 'docs':
      return 'docs'
    case 'tools':
      return 'tools'
    default:
      break
  }
  if (/^settings(\.local)?\.json$/.test(rel)) return 'settings'
  if (rel === 'CLAUDE.md' || rel.endsWith('/CLAUDE.md')) return 'memory'
  return 'other'
}

/** Recursively collect readable files under the source .claude folder. */
async function walkResources(claudeRoot: string): Promise<ResourceNode[]> {
  const out: ResourceNode[] = []
  const stack = [claudeRoot]
  while (stack.length) {
    const dir = stack.pop() as string
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (SECRET.test(e.name)) continue
      const abs = join(dir, e.name)
      const rel = relative(claudeRoot, abs).split(sep).join('/')
      if (e.isDirectory()) {
        stack.push(abs)
        continue
      }
      let size = 0
      let mtime = 0
      try {
        const s = await stat(abs)
        size = s.size
        mtime = s.mtimeMs
      } catch {
        /* skip stat */
      }
      let title = e.name
      let description = ''
      // Surface frontmatter name/description for markdown resources (cheap, only .md).
      if (e.name.endsWith('.md') && size < 64 * 1024) {
        try {
          const fm = parseFrontmatter(await readFile(abs, 'utf8'))
          if (fm.data.name) title = fm.data.name
          if (fm.data.description) description = fm.data.description
        } catch {
          /* ignore */
        }
      }
      out.push({ category: categoryOf(rel), rel, name: e.name, title, description, size, mtime })
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

/**
 * Collect the source-tree files a project carries outside .claude: the agent
 * instructions Claude Code layers as memory, and the documents a repository
 * carries at its root. Unlike walkResources this leaves .claude, so it stays
 * bounded (see HEAVY_DIRS / MEMORY_MAX_DEPTH / MEMORY_MAX_DIRS) and only ever
 * records what `sourceFileKind` names.
 *
 * Directory symlinks report isDirectory() === false and are therefore never
 * followed, which also means the walk cannot cycle.
 */
const EMPTY_SOURCE_TREE: { memories: ResourceNode[]; repoDocs: ResourceNode[] } = {
  memories: [],
  repoDocs: [],
}

async function walkSourceTree(root: string): Promise<{ memories: ResourceNode[]; repoDocs: ResourceNode[] }> {
  const memories: ResourceNode[] = []
  const repoDocs: ResourceNode[] = []
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }]
  let visited = 0
  while (stack.length && visited < MEMORY_MAX_DIRS) {
    const { dir, depth } = stack.pop() as { dir: string; depth: number }
    visited++
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const abs = join(dir, e.name)
      if (e.isDirectory()) {
        if (depth + 1 > MEMORY_MAX_DEPTH) continue
        if (HEAVY_DIRS.has(e.name.toLowerCase())) continue
        stack.push({ dir: abs, depth: depth + 1 })
        continue
      }
      const rel = relative(root, abs).split(sep).join('/')
      const kind = sourceFileKind(rel)
      if (!kind) continue
      let size = 0
      let mtime = 0
      try {
        const s = await stat(abs)
        size = s.size
        mtime = s.mtimeMs
      } catch {
        /* skip stat */
      }
      const node: ResourceNode = {
        category: kind,
        rel,
        name: e.name,
        title: e.name,
        description: '',
        size,
        mtime,
      }
      ;(kind === 'memory' ? memories : repoDocs).push(node)
    }
  }
  // Root CLAUDE.md first, then nested ones alphabetically — the order Claude Code
  // itself layers them in.
  memories.sort((a, b) => {
    const da = a.rel.split('/').length
    const db = b.rel.split('/').length
    return da === db ? a.rel.localeCompare(b.rel) : da - db
  })
  // Le README d'abord : c'est la porte d'entrée du dépôt, et l'ordre alphabétique
  // la reléguerait derrière un CHANGELOG que personne ne lit en premier. Les
  // gabarits de `.github/` ferment la liste, étant les seuls à porter un dossier.
  const rank = (r: ResourceNode): number => (r.rel.includes('/') ? 2 : /^README\b/i.test(r.name) ? 0 : 1)
  repoDocs.sort((a, b) => rank(a) - rank(b) || a.rel.localeCompare(b.rel))
  return { memories, repoDocs }
}

/** Extract flattened hook entries from settings.json / settings.local.json. */
async function readHooks(claudeRoot: string): Promise<HookEntry[]> {
  const out: HookEntry[] = []
  for (const f of ['settings.json', 'settings.local.json']) {
    const abs = join(claudeRoot, f)
    if (!existsSync(abs)) continue
    try {
      const j = JSON.parse(await readFile(abs, 'utf8')) as {
        hooks?: Record<string, unknown>
      }
      const hooks = j.hooks ?? {}
      for (const [event, matchers] of Object.entries(hooks)) {
        if (!Array.isArray(matchers)) continue
        for (const m of matchers as Record<string, unknown>[]) {
          const matcher = str(m.matcher)
          const list = Array.isArray(m.hooks) ? (m.hooks as Record<string, unknown>[]) : []
          for (const h of list) {
            out.push({ event, matcher, command: str(h.command, str(h.type)) })
          }
        }
      }
    } catch {
      /* ignore malformed settings */
    }
  }
  return out
}

/**
 * Les transcripts d'un projet, du plus récent au plus ancien, avec leur relevé
 * de coût quand il en existe un. Rien d'autre — voir la route qui l'expose.
 */
export async function listProjectSessions(slug: string): Promise<TranscriptSummary[]> {
  if (!isSlugSafe(slug)) throw new ProjectError('Slug de projet invalide.', 'escape')
  const [transcripts, metrics] = await Promise.all([listTranscripts(join(PROJECTS_DIR, slug)), sessionMetrics()])
  for (const t of transcripts) {
    const m = metrics.get(t.id)
    if (m) t.metrics = m
  }
  return transcripts
}

export async function getProjectDetail(slug: string): Promise<ProjectDetail> {
  if (!isSlugSafe(slug)) throw new ProjectError('Slug de projet invalide.', 'escape')
  const realPaths = await realProjectPaths()
  const root = realPaths.get(slug.toLowerCase()) ?? ''
  const name = root ? basename(root.replace(/[\\/]+$/, '')) : slug
  const claudeRoot = root ? join(root, '.claude') : ''
  const hasClaudeDir = Boolean(claudeRoot) && existsSync(claudeRoot)

  const [resources, source, folders, hooks, transcripts, metrics] = await Promise.all([
    hasClaudeDir ? walkResources(claudeRoot) : Promise.resolve([] as ResourceNode[]),
    // A project can carry a CLAUDE.md without ever having a .claude folder.
    root && existsSync(root) ? walkSourceTree(root) : Promise.resolve(EMPTY_SOURCE_TREE),
    includedFoldersFor(slug, root),
    hasClaudeDir ? readHooks(claudeRoot) : Promise.resolve([] as HookEntry[]),
    listTranscripts(join(PROJECTS_DIR, slug)),
    sessionMetrics(),
  ])

  for (const t of transcripts) {
    const m = metrics.get(t.id)
    if (m) t.metrics = m
  }

  return {
    slug,
    path: root,
    name,
    hasClaudeDir,
    resources,
    memories: source.memories,
    repoDocs: source.repoDocs,
    folders,
    hooks,
    transcripts,
  }
}

/** Ce qu'un `SessionSignal` dit d'une session, réduit à ce que la liste montre. */
function toMetrics(s: SessionSignal): SessionMetrics {
  const first = Date.parse(s.firstTs)
  const last = Date.parse(s.lastTs)
  return {
    userTurns: s.userTurns,
    turns: s.turns,
    tokens: s.tokens.input + s.tokens.output + s.tokens.cacheRead + s.tokens.cacheCreate,
    costUsd: s.cost,
    costPartial: s.unpricedModels.length > 0,
    durationMs: first && last && last > first ? last - first : 0,
  }
}

/**
 * Les relevés de coût du parc, indexés par identifiant de session.
 *
 * La jointure se fait sur le seul `sessionId` — un UUID, unique sur tout le
 * parc — et non sur le couple projet + session : le slug d'un relevé sort d'un
 * `readdir`, celui de la page est passé au crible de `toLowerCase()`, et les
 * deux pourraient ne pas s'écrire pareil.
 *
 * `getSignals` scanne tout le parc, mais son cache `(mtime, size)` est partagé
 * avec la page Diagnostic : seuls les fichiers touchés depuis le dernier appel
 * sont relus. Un échec ne doit pas emporter la page : sans relevé, la liste des
 * sessions s'affiche, sans les colonnes de coût.
 */
async function sessionMetrics(): Promise<Map<string, SessionMetrics>> {
  const out = new Map<string, SessionMetrics>()
  try {
    const { signals } = await getSignals()
    for (const s of signals) out.set(s.sessionId, toMetrics(s))
  } catch {
    /* pas de relevé → pas de métriques, la liste reste bonne */
  }
  return out
}

/**
 * L'inventaire seul : le dossier `.claude` du projet et ses CLAUDE.md.
 *
 * C'est `getProjectDetail` amputé de ses postes coûteux. `listTranscripts` lit et
 * parse *intégralement* chaque `.jsonl` du projet — des dizaines de fichiers de
 * plusieurs centaines de Ko, et son cache ne dispense que des passages suivants —,
 * `sessionMetrics` balaie le parc entier, et `readHooks` ouvre les settings. Un
 * écran qui ne veut qu'afficher l'arbre des ressources paierait tout cela pour
 * rien, et la page Sessions, qui vit en temps réel, le paierait à chaque
 * changement de projet.
 *
 * Les deux parcours restants sont bornés (`MEMORY_MAX_DEPTH`, `MEMORY_MAX_DIRS`)
 * et ne lisent que le frontmatter des `.md` de moins de 64 Ko.
 */
export async function getProjectResources(slug: string): Promise<ProjectResources> {
  if (!isSlugSafe(slug)) throw new ProjectError('Slug de projet invalide.', 'escape')
  const realPaths = await realProjectPaths()
  const root = realPaths.get(slug.toLowerCase()) ?? ''
  const name = root ? basename(root.replace(/[\\/]+$/, '')) : slug
  const claudeRoot = root ? join(root, '.claude') : ''
  const hasClaudeDir = Boolean(claudeRoot) && existsSync(claudeRoot)

  const [resources, source, folders] = await Promise.all([
    hasClaudeDir ? walkResources(claudeRoot) : Promise.resolve([] as ResourceNode[]),
    // Un projet peut porter un CLAUDE.md sans avoir jamais eu de dossier .claude.
    root && existsSync(root) ? walkSourceTree(root) : Promise.resolve(EMPTY_SOURCE_TREE),
    includedFoldersFor(slug, root),
  ])

  return {
    slug,
    path: root,
    name,
    hasClaudeDir,
    resources,
    memories: source.memories,
    repoDocs: source.repoDocs,
    folders,
  }
}

/**
 * Les dossiers inclus d'un projet, tels que le disque les déclare.
 *
 * Les préférences sont écrites par le front, donc relues ici à chaque fois
 * plutôt que gardées : ce que le serveur ouvre suit ce que le fichier dit, sans
 * décalage. `sanitizeFolders` fait barrage à ce qu'une édition à la main aurait
 * pu y glisser.
 */
async function includedFoldersFor(slug: string, root: string): Promise<IncludedFolder[]> {
  if (!root || !existsSync(root)) return []
  return listIncludedFolders(root, sanitizeFolders(await includedFoldersOf(slug)))
}

/** Les dossiers qu'AURA propose d'inclure — une mesure, pas un verdict. */
export async function listFolderCandidates(slug: string): Promise<FolderCandidate[]> {
  const root = await sourceRootOf(slug)
  const included = sanitizeFolders(await includedFoldersOf(slug))
  return folderCandidates(root, HEAVY_DIRS, included)
}

/**
 * Read one document from an included folder (READ-ONLY).
 *
 * The sandbox is the inclusion list itself, read from disk on every call: the
 * path the client sends must sit under a folder the preferences declare, must be
 * a document, and must resolve inside the project root. Include nothing, and this
 * route can open nothing.
 */
export async function readProjectIncludedFile(slug: string, rel: string): Promise<{ rel: string; content: string }> {
  const root = await sourceRootOf(slug)
  const folders = sanitizeFolders(await includedFoldersOf(slug))
  const abs = resolveIncludedFile(root, rel.replace(/\\/g, '/'), folders)
  if (!abs) throw new ProjectError(t('errors.accessDenied'), 'denied')
  return { rel: rel.replace(/\\/g, '/'), content: await readFile(abs, 'utf8') }
}

/** Read one resource file from the source .claude folder (READ-ONLY, sandboxed). */
export async function readProjectResource(slug: string, rel: string): Promise<{ rel: string; content: string }> {
  const claudeRoot = canonicalPath(await claudeRootOf(slug))
  const cleaned = normalize(rel).replace(/^([/\\])+/, '')
  if (SECRET.test(basename(cleaned))) throw new ProjectError(t('errors.accessDenied'), 'denied')
  // Forme canonique des deux côtés : un lien sous le `.claude` d'un projet
  // sortirait sinon du dossier sans que le préfixe s'en aperçoive.
  const abs = canonicalPath(join(claudeRoot, cleaned))
  if (abs !== claudeRoot && !abs.toLowerCase().startsWith((claudeRoot + sep).toLowerCase())) {
    throw new ProjectError('Chemin hors du dossier .claude.', 'escape')
  }
  const content = await readFile(abs, 'utf8')
  return { rel: cleaned.split(sep).join('/'), content }
}

/**
 * Read one source-tree file (READ-ONLY). This is the only path that reaches
 * outside .claude, so it is doubly sandboxed: the resolved file must stay under
 * the project root, *and* its relative path must be one `sourceFileKind`
 * recognizes. Even a traversal that somehow got past the prefix check could only
 * ever open a CLAUDE.md, a README, or one of their few named siblings.
 */
export async function readProjectMemory(slug: string, rel: string): Promise<{ rel: string; content: string }> {
  // ~/.claude.json stores paths with forward slashes, so normalize the root too —
  // otherwise the prefix check compares `C:\…\aura\CLAUDE.md` to `C:/…/aura/`
  // and rejects every legitimate read. Canonical form on both sides, so a
  // symlink cannot walk out of the project either.
  const root = canonicalPath(await sourceRootOf(slug)).replace(new RegExp(`\\${sep}+$`), '')
  const cleaned = normalize(rel).replace(/^([/\\])+/, '')
  if (!sourceFileKind(cleaned.split(sep).join('/'))) throw new ProjectError(t('errors.accessDenied'), 'denied')
  const abs = canonicalPath(join(root, cleaned))
  if (!abs.toLowerCase().startsWith((root + sep).toLowerCase())) throw new ProjectError('Chemin hors du projet.', 'escape')
  const content = await readFile(abs, 'utf8')
  return { rel: cleaned.split(sep).join('/'), content }
}

/**
 * Plans this project produced. They live outside the project, flat in
 * ~/.claude/plans, and are matched back to it through its own transcripts — so
 * this reads that project's transcripts only, never the whole corpus.
 */
export async function listProjectPlans(slug: string): Promise<PlanEntry[]> {
  if (!isSlugSafe(slug)) throw new ProjectError('Slug de projet invalide.', 'escape')
  return listPlans(slug)
}

/**
 * Parse one transcript of a project into the replay model.
 *
 * Returns the file's fingerprint alongside it, so the route can answer `304` to a
 * client that already holds this exact state.
 */
export async function readProjectTranscript(slug: string, id: string): Promise<CachedTranscript> {
  if (!isSlugSafe(slug)) throw new ProjectError('Slug de projet invalide.', 'escape')
  const safeId = sessionIdOf(id)
  const abs = join(PROJECTS_DIR, slug, `${safeId}.jsonl`)
  if (!existsSync(abs)) throw new ProjectError('Transcript introuvable.', 'not-found')
  return readTranscriptCached(abs, safeId)
}

/** Validate a session id, or throw. Shared by the transcript and tool-result reads. */
function sessionIdOf(id: string): string {
  const safe = basename(id).replace(/\.jsonl$/, '')
  if (!/^[A-Za-z0-9._-]+$/.test(safe)) {
    throw new ProjectError('Identifiant de session invalide.', 'escape')
  }
  return safe
}

/** Beyond this a "full output" stops being something a browser should render. */
const TOOL_RESULT_MAX = 512 * 1024

/**
 * Read back a tool result Claude Code spilled to disk.
 *
 * When an output exceeds ~2 KB the transcript keeps only a preview and writes the
 * rest to `projects/<slug>/<sessionId>/tool-results/<toolUseId>.txt`. The replay
 * view offers to load it on demand.
 *
 * Every segment of that path is validated before it is joined: the slug against
 * the trusted map, the session id and the tool-use id against a strict pattern.
 * Nothing the client sends can name a file — it can only name an id that we then
 * spell into a file name ourselves.
 */
export async function readProjectToolResult(
  slug: string,
  id: string,
  toolUseId: string,
): Promise<{ toolUseId: string; content: string; truncated: boolean }> {
  if (!isSlugSafe(slug)) throw new ProjectError('Slug de projet invalide.', 'escape')
  const safeId = sessionIdOf(id)
  if (!/^toolu_[A-Za-z0-9]+$/.test(toolUseId)) {
    throw new ProjectError('Identifiant d’appel d’outil invalide.', 'escape')
  }

  const abs = join(PROJECTS_DIR, slug, safeId, 'tool-results', `${toolUseId}.txt`)
  if (!existsSync(abs)) throw new ProjectError('Sortie d’outil introuvable.', 'not-found')

  const { size } = await stat(abs)
  const content = await readFile(abs, 'utf8')
  return size > TOOL_RESULT_MAX
    ? { toolUseId, content: content.slice(0, TOOL_RESULT_MAX), truncated: true }
    : { toolUseId, content, truncated: false }
}

/** Un identifiant que le transcript a écrit lui-même : uuid de ligne, id de run. */
const ID = /^[A-Za-z0-9-]{1,64}$/

/**
 * Les octets d'une image du transcript.
 *
 * Le transcript parsé ne porte que l'adresse (`uuid` de la ligne, rang de
 * l'image dedans) — voir `TranscriptImage`. On relit ici la ligne nommée et on
 * décode le base64 qu'elle contient. Le fichier peut peser plusieurs Mo, mais la
 * réponse est immuable : une image donnée n'est demandée qu'une fois par
 * navigateur, quel que soit le nombre de fois que la timeline la rend.
 *
 * Le client ne nomme jamais un fichier : il donne un uuid et, pour un
 * sous-agent, un `agentId` — deux identifiants validés, que nous épelons
 * nous-mêmes en chemin sous le dossier de la session.
 */
export async function readProjectTranscriptImage(
  slug: string,
  id: string,
  uuid: string,
  index: number,
  agentId: string,
): Promise<{ body: Buffer; mediaType: string }> {
  if (!isSlugSafe(slug)) throw new ProjectError('Slug de projet invalide.', 'escape')
  const safeId = sessionIdOf(id)
  if (!ID.test(uuid)) throw new ProjectError('Identifiant de ligne invalide.', 'escape')
  if (agentId && !ID.test(agentId)) throw new ProjectError('Identifiant d’agent invalide.', 'escape')
  if (!Number.isInteger(index) || index < 0) {
    throw new ProjectError('Rang d’image invalide.', 'escape')
  }

  const abs = agentId ? join(PROJECTS_DIR, slug, safeId, 'subagents', `agent-${agentId}.jsonl`) : join(PROJECTS_DIR, slug, `${safeId}.jsonl`)
  if (!existsSync(abs)) throw new ProjectError('Transcript introuvable.', 'not-found')

  // Une ligne par message : celle qui contient l'uuid est la seule à parser.
  const raw = await readFile(abs, 'utf8')
  const needle = `"uuid":"${uuid}"`
  let found: Record<string, unknown> | null = null
  for (const line of raw.split('\n')) {
    if (!line.includes(needle)) continue
    try {
      const row = JSON.parse(line) as Record<string, unknown>
      if (row.uuid === uuid) {
        found = row
        break
      }
    } catch {
      /* ligne illisible : ce n'est pas celle qu'on cherche */
    }
  }
  if (!found) throw new ProjectError('Image introuvable.', 'not-found')

  let hit: Record<string, unknown> | null = null
  eachImage((found.message as Record<string, unknown> | undefined)?.content, (source, _tool, at) => {
    if (at === index) hit = source
  })
  const source = hit as Record<string, unknown> | null
  const data = str(source?.data)
  if (!source || !data) throw new ProjectError('Image introuvable.', 'not-found')

  return { body: Buffer.from(data, 'base64'), mediaType: str(source.media_type, 'image/png') }
}
