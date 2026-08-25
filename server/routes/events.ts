// Server-sent events (`/api/events`): the SPA subscribes once and is told when
// `~/.claude` changes, instead of asking every couple of seconds.

import type { FastifyInstance } from 'fastify'
import { subscribe, type ClaudeEvent } from '../watch.ts'

/**
 * Idle connections die to proxies and load balancers long before anything in
 * `~/.claude` moves. A comment line keeps the socket warm without waking any
 * client-side handler.
 */
const HEARTBEAT_MS = 25_000

export function registerEvents(app: FastifyInstance): void {
  app.get('/api/events', (req, reply) => {
    // Fastify must not try to serialise or close this response: we own the
    // socket until the client hangs up.
    reply.hijack()

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tell any reverse proxy not to buffer: buffering defeats the whole point.
      'X-Accel-Buffering': 'no',
    })
    // Flush the headers so `EventSource` resolves `onopen` immediately, even if
    // nothing changes for minutes.
    reply.raw.write(': connected\n\n')

    function send(event: ClaudeEvent): void {
      reply.raw.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`)
    }

    const unsubscribe = subscribe(send)
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), HEARTBEAT_MS)

    function close(): void {
      clearInterval(heartbeat)
      unsubscribe()
    }
    req.raw.on('close', close)
    req.raw.on('error', close)
  })
}
