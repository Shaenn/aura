import { apiHeaders, type HeaderMap } from '@/services/http'

// Client for the guarded .claude filesystem API (`/api/claude/*`).
//
// Writes are two-phase, mirroring the BFF contract:
//   propose(path, content) -> { before, after, exists }   (nothing written)
//   apply(path, content, expectedBefore) -> { backupPath } (writes + backs up)
// The UI diffs before/after between those calls and only applies on confirm.

export interface DirEntry {
  rel: string
  name: string
  kind: 'file' | 'dir'
  size: number
  mtime: number
}

export interface ResourceItem {
  rel: string
  name: string
  title: string
  description: string
  mtime: number
}

export interface Proposal {
  rel: string
  exists: boolean
  before: string | null
  after: string
}

export interface ApplyResult {
  ok: true
  backupPath: string | null
  rel: string
}

export interface Overview {
  settingsExists: boolean
  claudeMdExists: boolean
  agents: number
  skills: number
  plugins: number
}

export interface MemoryItem {
  rel: string
  name: string
  title: string
  description: string
  type: string
}

export interface MemoryProject {
  slug: string
  memRel: string
  indexRel: string | null
  items: MemoryItem[]
}

export interface MemoriesIndex {
  global: { rel: string; exists: boolean }
  projects: MemoryProject[]
}

export interface PluginsIndex {
  installed: { id: string; version: string; scope: string }[]
  marketplaces: { name: string; sourceType: string; location: string }[]
}

/** Raised on any non-2xx response, carrying the HTTP status for the UI. */
export class ClaudeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: apiHeaders(init?.headers as HeaderMap | undefined),
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) msg = body.error
    } catch {
      /* non-JSON body */
    }
    throw new ClaudeApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function q(path: string): string {
  return `/api/claude`.concat(path)
}

// ── Reads ──────────────────────────────────────────────────────────────────

export interface SystemInfo {
  claudeDir: string
  version: string
}

export function getSystem(): Promise<SystemInfo> {
  return req(q('/system'))
}
export function getOverview(): Promise<Overview> {
  return req(q('/overview'))
}

export function listDir(path = ''): Promise<{ entries: DirEntry[] }> {
  return req(q(`/list?path=${encodeURIComponent(path)}`))
}

export function readFile(path: string): Promise<{ rel: string; content: string }> {
  return req(q(`/file?path=${encodeURIComponent(path)}`))
}

export function listAgents(): Promise<{ items: ResourceItem[] }> {
  return req(q('/agents'))
}
export function listSkills(): Promise<{ items: ResourceItem[] }> {
  return req(q('/skills'))
}
export function getMemories(): Promise<MemoriesIndex> {
  return req(q('/memories'))
}
export function getPlugins(): Promise<PluginsIndex> {
  return req(q('/plugins'))
}

export interface PluginHooks {
  plugin: string
  hooks: Record<string, { matcher?: string; hooks?: { type?: string; command?: string }[] }[]>
}
export function getPluginHooks(): Promise<PluginHooks[]> {
  return req(q('/plugin-hooks'))
}

// ── Writes (two-phase) ─────────────────────────────────────────────────────

export function propose(path: string, content: string): Promise<Proposal> {
  return req(q('/propose'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  })
}

export function apply(path: string, content: string, expectedBefore: string | null): Promise<ApplyResult> {
  return req(q('/apply'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, expectedBefore }),
  })
}

export function deleteResource(path: string): Promise<{ backupPath: string; rel: string }> {
  return req(q('/delete'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
}

export function syncMemoryIndex(payload: {
  memRel: string
  action: 'add' | 'remove'
  file: string
  title?: string
  hook?: string
}): Promise<{ changed: boolean; rel: string }> {
  return req(q('/memory-index'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
