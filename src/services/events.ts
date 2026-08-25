// Subscribe to what changes under ~/.claude, pushed by the BFF (`/api/events`).
//
// One `EventSource` is shared by the whole app: the browser caps concurrent
// connections per origin, and a stream per component would spend that budget on
// nothing. It opens with the first subscriber and closes with the last.
//
// `EventSource` reconnects on its own when the connection drops, but the
// filesystem watcher behind it is best-effort — events can be coalesced or lost.
// Treat a notification as "look again", and keep a slow fallback poll for the
// screens where missing a change would be visible.

export type ClaudeEvent = { kind: 'sessions' } | { kind: 'transcript'; slug: string; id: string }

type Listener = (event: ClaudeEvent) => void

const listeners = new Set<Listener>()
let source: EventSource | null = null

function dispatch(raw: MessageEvent<string>): void {
  let event: ClaudeEvent
  try {
    event = JSON.parse(raw.data) as ClaudeEvent
  } catch {
    return
  }
  for (const l of [...listeners]) l(event)
}

function open(): void {
  source = new EventSource('/api/events')
  source.addEventListener('sessions', dispatch as EventListener)
  source.addEventListener('transcript', dispatch as EventListener)
}

function close(): void {
  source?.close()
  source = null
}

/** Listen until the returned function is called. Safe to call from `onMounted`. */
export function onClaudeChange(listener: Listener): () => void {
  listeners.add(listener)
  if (!source) open()

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) close()
  }
}
