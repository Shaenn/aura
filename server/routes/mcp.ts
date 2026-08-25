// MCP endpoints:
//   GET  /api/mcp          -> read-only inventory (connected + file servers)
//   POST /api/mcp/propose  -> preview a global-server add/update/delete (no write)
//   POST /api/mcp/apply    -> commit it (backup + optimistic concurrency)
//
// Only the GLOBAL `mcpServers` block of ~/.claude.json is writable here; the
// enableAllProjectMcpServers / enabled-disabled knobs live in settings.json and
// are edited via the normal /api/claude flow.

import type { FastifyInstance } from 'fastify'
import { t } from '../i18n/index.ts'
import { getMcpInventory, proposeMcpWrite, applyMcpWrite, validateServer, McpConflictError, type McpServerConfig } from '../mcp'

interface WriteBody {
  name?: string
  /** Server config for add/update, or `null` to delete. */
  server?: McpServerConfig | null
  expectedHash?: string | null
}

/** Validate the shared shape of propose/apply bodies. */
function parseBody(body: unknown): { name: string; server: McpServerConfig | null } | { error: string } {
  const b = (body ?? {}) as WriteBody
  if (typeof b.name !== 'string' || !b.name.trim()) return { error: t('errors.serverNameRequired') }
  const server = b.server == null ? null : b.server
  if (server !== null) {
    const err = validateServer(server)
    if (err) return { error: err }
  }
  return { name: b.name.trim(), server }
}

export function registerMcp(app: FastifyInstance): void {
  app.get('/api/mcp', () => getMcpInventory())

  app.post('/api/mcp/propose', async (req, reply) => {
    const parsed = parseBody(req.body)
    if ('error' in parsed) return reply.code(400).send({ error: parsed.error })
    return proposeMcpWrite(parsed.name, parsed.server)
  })

  app.post('/api/mcp/apply', async (req, reply) => {
    const parsed = parseBody(req.body)
    if ('error' in parsed) return reply.code(400).send({ error: parsed.error })
    const expectedHash = ((req.body ?? {}) as WriteBody).expectedHash ?? null
    try {
      return await applyMcpWrite(parsed.name, parsed.server, expectedHash)
    } catch (e) {
      if (e instanceof McpConflictError) return reply.code(409).send({ error: e.message })
      throw e
    }
  })
}
