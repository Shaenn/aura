// Client for the MCP API (`/api/mcp`).
//   getMcp()      -> read-only inventory (connected + file servers)
//   proposeMcp()  -> preview a global-server add/update/delete (no write)
//   applyMcp()    -> commit it (backup + optimistic concurrency)
//
// Only the GLOBAL server list of ~/.claude.json is writable; project-scoped and
// claude.ai-connected servers stay read-only. Errors reuse ClaudeApiError so a
// 409 conflict renders the same message as the standard claude flow.

import { ClaudeApiError } from '@/services/claude'
import { apiHeaders, type HeaderMap } from '@/services/http'

/** A single MCP server entry as stored in ~/.claude.json. */
export interface McpServerConfig {
  type?: string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

export interface McpInventory {
  connected: { name: string; id: string; timestamp: number }[]
  fileServers: { name: string; scope: string; transport: string; detail: string }[]
  /** Raw global server configs (for lossless edit). Keyed by server name. */
  globalServers: Record<string, McpServerConfig>
}

export interface McpWriteProposal {
  /** Current global mcpServers block, pretty-printed. */
  before: string
  /** Proposed global mcpServers block, pretty-printed. */
  after: string
  /** Hash of the whole ~/.claude.json (echoed back on apply for concurrency). */
  expectedHash: string | null
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
  return (await res.json()) as T
}

export const getMcp = (): Promise<McpInventory> => req('/api/mcp')

/** `server === null` deletes the named global server; otherwise add/update it. */
export const proposeMcp = (name: string, server: McpServerConfig | null): Promise<McpWriteProposal> =>
  req('/api/mcp/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, server }),
  })

export const applyMcp = (
  name: string,
  server: McpServerConfig | null,
  expectedHash: string | null,
): Promise<{ ok: true; backupPath: string | null }> =>
  req('/api/mcp/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, server, expectedHash }),
  })
