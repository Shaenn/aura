// MCP inventory + narrow write access for the global server list.
//
// Read sources:
//  - claude.ai-connected servers (OAuth) tracked in .claude/mcp-needs-auth-cache.json
//  - file-configured servers in ~/.claude.json (global + per-project mcpServers)
//
// Write: least-privilege CRUD on the GLOBAL `mcpServers` block of ~/.claude.json.
// This file lives OUTSIDE the sandboxed CLAUDE_DIR, so it cannot go through the
// generic claude propose/apply flow. We therefore touch only `mcpServers`,
// preserve every other key verbatim, back up the whole file, and guard against
// out-of-band edits with a content hash (optimistic concurrency). Per-project
// servers stay read-only here.

import { createHash } from 'node:crypto'
import { readFile, writeFile, copyFile, mkdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { loadEnv } from './env'
import { t } from './i18n/index.ts'
import { BACKUPS_DIR } from './paths'

const CLAUDE_DIR = loadEnv().claudeDir
const HOME_JSON = join(dirname(CLAUDE_DIR), '.claude.json')
const AUTH_CACHE = join(CLAUDE_DIR, 'mcp-needs-auth-cache.json')

export interface McpInventory {
  connected: { name: string; id: string; timestamp: number }[]
  fileServers: { name: string; scope: string; transport: string; detail: string }[]
  /** Raw global server configs (for lossless edit). Keyed by server name. */
  globalServers: Record<string, ServerCfg>
}

interface ServerCfg {
  type?: string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  /** Les noms des variables d'environnement, quand les valeurs sont retenues. */
  envKeys?: string[]
}

/**
 * L'inventaire sans les valeurs d'`env` — seulement leurs noms.
 *
 * C'est là que vivent les `GITHUB_TOKEN`, les clés d'API, les URL de base de
 * données d'un serveur MCP. L'inventaire les recopiait telles quelles vers le
 * navigateur, qui n'en fait rien : l'écran de MCP montre le transport et la
 * commande, jamais l'environnement.
 *
 * Les noms restent, eux : ils disent qu'un serveur attend une clé, ce qui est
 * précisément ce qu'on veut lire sans lire la clé. Et `applyMcpWrite` reconduit
 * les valeurs que le client ne lui a pas renvoyées — sans quoi la première
 * modification d'un serveur effacerait son environnement.
 */
function redactEnv(servers: Record<string, ServerCfg>): Record<string, ServerCfg> {
  const out: Record<string, ServerCfg> = {}
  for (const [name, cfg] of Object.entries(servers)) {
    const { env, ...rest } = cfg
    out[name] = env && Object.keys(env).length ? { ...rest, envKeys: Object.keys(env) } : rest
  }
  return out
}

export async function getMcpInventory(): Promise<McpInventory> {
  const connected: McpInventory['connected'] = []
  try {
    const cache = JSON.parse(await readFile(AUTH_CACHE, 'utf8')) as Record<string, { id?: string; timestamp?: number }>
    for (const [name, v] of Object.entries(cache)) {
      connected.push({ name, id: v.id ?? '', timestamp: v.timestamp ?? 0 })
    }
  } catch {
    /* no cache → no connected servers */
  }

  const fileServers: McpInventory['fileServers'] = []
  let globalServers: Record<string, ServerCfg> = {}
  function collect(obj: Record<string, ServerCfg> | undefined, scope: string): void {
    for (const [name, cfg] of Object.entries(obj ?? {})) {
      const transport = cfg.type ?? (cfg.command ? 'stdio' : cfg.url ? 'http' : '?')
      const detail = cfg.command ? [cfg.command, ...(cfg.args ?? [])].join(' ') : (cfg.url ?? '')
      fileServers.push({ name, scope, transport, detail })
    }
  }
  try {
    const j = JSON.parse(await readFile(HOME_JSON, 'utf8')) as {
      mcpServers?: Record<string, ServerCfg>
      projects?: Record<string, { mcpServers?: Record<string, ServerCfg> }>
    }
    globalServers = redactEnv(j.mcpServers ?? {})
    collect(j.mcpServers, 'global')
    for (const [proj, cfg] of Object.entries(j.projects ?? {})) {
      if (cfg?.mcpServers && Object.keys(cfg.mcpServers).length) {
        collect(cfg.mcpServers, `projet · ${proj.split(/[\\/]/).pop() ?? proj}`)
      }
    }
  } catch {
    /* ~/.claude.json unreadable/absent → no file servers */
  }

  return { connected, fileServers, globalServers }
}

// ── Global mcpServers write (add / update / delete) ──────────────────────────

/** A single MCP server entry as stored in ~/.claude.json. */
export interface McpServerConfig {
  type?: string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  /** Vue seule : les noms des variables, quand les valeurs sont retenues. */
  envKeys?: string[]
}

/** Validate a server config; returns an error message or null when valid. */
export function validateServer(s: McpServerConfig): string | null {
  const transport = s.type ?? (s.command ? 'stdio' : s.url ? 'http' : '')
  if (transport === 'stdio') {
    if (!s.command || typeof s.command !== 'string') return 'Un serveur stdio requiert une commande.'
    if (s.args !== undefined && !Array.isArray(s.args)) return t('mcp.argsMustBeStrings')
    return null
  }
  if (transport === 'http' || transport === 'sse') {
    if (!s.url || typeof s.url !== 'string') return 'Un serveur http/sse requiert une URL.'
    return null
  }
  return t('mcp.unknownTransport')
}

/** Mismatch between the file the client previewed and the file on disk now. */
export class McpConflictError extends Error {
  constructor() {
    super(t('guard.claudeJsonChanged'))
  }
}

async function readHomeText(): Promise<string | null> {
  try {
    return await readFile(HOME_JSON, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

/** SHA-256 of the whole file (null when absent) — the concurrency token. */
function hashText(text: string | null): string | null {
  return text === null ? null : createHash('sha256').update(text).digest('hex')
}

/**
 * Apply the add/update (server) or delete (null) to a copy of the map.
 *
 * L'environnement du serveur existant est reconduit quand l'entrant n'en porte
 * pas : le client ne l'a jamais reçu (voir `redactEnv`), il ne peut donc pas le
 * renvoyer, et sans cela la moindre modification de la commande effacerait les
 * clés du serveur. `envKeys` ne s'écrit jamais sur le disque — c'est une vue,
 * pas une donnée.
 */
function mutateServers(current: Record<string, McpServerConfig>, name: string, server: McpServerConfig | null): Record<string, McpServerConfig> {
  const next = { ...current }
  if (server === null) {
    delete next[name]
    return next
  }
  const clean = { ...server }
  delete clean.envKeys
  const kept = current[name]?.env
  next[name] = !clean.env && kept ? { ...clean, env: kept } : clean
  return next
}

export interface McpWriteProposal {
  /** Current global mcpServers block, pretty-printed. */
  before: string
  /** Proposed global mcpServers block, pretty-printed. */
  after: string
  /** Hash of the whole ~/.claude.json (echoed back on apply for concurrency). */
  expectedHash: string | null
}

/** Preview a global-server mutation: returns the scoped before/after diff. */
export async function proposeMcpWrite(name: string, server: McpServerConfig | null): Promise<McpWriteProposal> {
  const text = await readHomeText()
  const obj = text ? (JSON.parse(text) as { mcpServers?: Record<string, McpServerConfig> }) : {}
  const current = obj.mcpServers ?? {}
  const next = mutateServers(current, name, server)
  return {
    before: JSON.stringify(current, null, 2),
    after: JSON.stringify(next, null, 2),
    expectedHash: hashText(text),
  }
}

/** Copy ~/.claude.json into the timestamped backup tree before overwriting. */
async function backupHomeJson(): Promise<string> {
  const s = await stat(HOME_JSON)
  const stamp = new Date(s.mtimeMs).toISOString().replace(/[:.]/g, '-')
  const dest = join(BACKUPS_DIR, stamp, '.claude.json')
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(HOME_JSON, dest)
  return dest
}

/**
 * Commit a global-server mutation. Refuses (McpConflictError) if the file
 * changed since `proposeMcpWrite`; backs up the file; rewrites only the
 * `mcpServers` key, leaving every other key in place.
 */
export async function applyMcpWrite(
  name: string,
  server: McpServerConfig | null,
  expectedHash: string | null,
): Promise<{ ok: true; backupPath: string | null }> {
  const text = await readHomeText()
  if (hashText(text) !== expectedHash) throw new McpConflictError()

  const obj = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  const current = (obj.mcpServers as Record<string, McpServerConfig> | undefined) ?? {}
  obj.mcpServers = mutateServers(current, name, server)

  let backupPath: string | null = null
  if (text !== null) backupPath = await backupHomeJson()

  await writeFile(HOME_JSON, JSON.stringify(obj, null, 2) + '\n', 'utf8')
  return { ok: true, backupPath }
}
