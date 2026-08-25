// Watch the managed ~/.claude directory and tell subscribers what changed.
//
// The SPA used to poll: the session list every 4 s, the followed transcript
// every 2 s. That is a request per tick whether or not anything moved, and it
// still lags reality by up to a tick. Here we let the filesystem say so.
//
// Two subtleties of `fs.watch` shape this module:
//
//  - It fires several times for one logical write (Claude Code appends a row,
//    the OS reports both a size and an mtime change), so every key is coalesced
//    before it reaches a subscriber — on a leading edge, see `emit`.
//  - It is best-effort. Events are coalesced under load and dropped outright on
//    some platforms, and a watcher dies silently if its directory is replaced.
//    We retry a missing or broken watcher, but callers must still treat this as
//    a hint to refresh, never as the sole source of truth — the SPA keeps a slow
//    fallback poll for exactly this reason.

import { watch, existsSync, realpathSync, type FSWatcher } from 'node:fs'
import { join, sep } from 'node:path'
import { CLAUDE_DIR } from './claude/paths.ts'

/** Something changed under `~/.claude`. */
export type ClaudeEvent =
  /** A file in `sessions/` moved — a session started, went busy, or ended. */
  | { kind: 'sessions' }
  /** A transcript grew. `id` is the session it belongs to, sub-agents included. */
  | { kind: 'transcript'; slug: string; id: string }

type Listener = (event: ClaudeEvent) => void

const listeners = new Set<Listener>()

/** Collapse the burst of events one append produces. */
const WINDOW_MS = 150
/** How long to wait before re-arming a watcher that died or found no directory. */
const RETRY_MS = 2000

/** One open coalescing window per key: the timer, and what arrived during it. */
interface Window {
  timer: NodeJS.Timeout
  trailing: ClaudeEvent | null
}

const windows = new Map<string, Window>()

function deliver(event: ClaudeEvent): void {
  for (const l of listeners) {
    try {
      l(event)
    } catch {
      /* a broken subscriber must not take the watcher down */
    }
  }
}

/**
 * Coalesce on a leading edge, not a trailing one.
 *
 * This used to be a plain debounce: every event cleared the previous timer, so
 * nothing was delivered until the key fell silent for a whole window. On a live
 * session — the one case that matters — that is backwards. The first event of a
 * burst carries the freshest news and was the one always thrown away, and a key
 * written to faster than the window could be starved outright.
 *
 * So: deliver at once, stay quiet for a window, and deliver once more at the end
 * if anything arrived meanwhile. Same protection against the burst one append
 * produces, without paying a fixed window of latency for it. The trailing
 * delivery is not optional — without it the last event of a burst, the one that
 * says the turn is over, would be the one lost.
 */
function emit(event: ClaudeEvent, key: string): void {
  const open = windows.get(key)
  if (open) {
    open.trailing = event
    return
  }

  deliver(event)
  windows.set(key, {
    timer: setTimeout(() => {
      const closing = windows.get(key)
      windows.delete(key)
      // A trailing event re-opens a window of its own: it is being delivered
      // now, so what follows it deserves the same protection.
      if (closing?.trailing) emit(closing.trailing, key)
    }, WINDOW_MS),
    trailing: null,
  })
}

/**
 * Which session a changed transcript belongs to.
 *
 * `fs.watch` hands us a path relative to `projects/`, in one of two shapes:
 *   `<slug>/<sessionId>.jsonl`                        — the main thread
 *   `<slug>/<sessionId>/subagents/agent-*.jsonl`      — a sub-agent sidecar
 * Both mean "session `<sessionId>` of `<slug>` has new rows", because the replay
 * folds sub-agent turns into the session that spawned them.
 */
function locate(relative: string): Extract<ClaudeEvent, { kind: 'transcript' }> | null {
  if (!relative.endsWith('.jsonl')) return null
  const parts = relative.split(sep).filter(Boolean)
  const slug = parts[0]
  if (!slug || parts.length < 2) return null

  if (parts.length === 2) {
    const file = parts[1]
    if (!file) return null
    return { kind: 'transcript', slug, id: file.slice(0, -'.jsonl'.length) }
  }
  const id = parts[1]
  if (!id) return null
  return { kind: 'transcript', slug, id }
}

/**
 * The path Windows reports events against.
 *
 * `AURA_CLAUDE_DIR` may hold an 8.3 short name (`JEANDU~1.DUP`), and a home
 * directory may be a junction. libuv compares each event's filename against the
 * directory it was handed, and *asserts* — aborting the process, past any
 * try/catch — when the two spellings disagree. Resolve to the real long path
 * first. On failure, fall back: a watcher that may fail is better than none.
 */
function canonical(dir: string): string {
  try {
    return realpathSync.native(dir)
  } catch {
    return dir
  }
}

/** Arm one watcher, re-arming it whenever the directory or the watch goes away. */
function arm(dir: string, recursive: boolean, onChange: (relative: string) => void): () => void {
  let watcher: FSWatcher | null = null
  let retry: NodeJS.Timeout | null = null
  let stopped = false

  const start = (): void => {
    if (stopped) return
    if (!existsSync(dir)) {
      retry = setTimeout(start, RETRY_MS)
      return
    }
    try {
      watcher = watch(canonical(dir), { recursive, persistent: false }, (_type, filename) => {
        if (filename) onChange(filename.toString())
      })
      watcher.on('error', () => {
        watcher?.close()
        watcher = null
        if (!stopped) retry = setTimeout(start, RETRY_MS)
      })
    } catch {
      retry = setTimeout(start, RETRY_MS)
    }
  }

  start()
  return () => {
    stopped = true
    if (retry) clearTimeout(retry)
    watcher?.close()
  }
}

let stopAll: (() => void) | null = null

/** Start watching on the first subscriber; keep watching until the last leaves. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  if (!stopAll) {
    const stopSessions = arm(join(CLAUDE_DIR, 'sessions'), false, (name) => {
      // Keyed by file, not by the `sessions` kind they all share. Each live CLI
      // rewrites its own status file continuously; under one key, three sessions
      // interleaving their writes kept the window re-opening forever and the
      // list stopped moving at exactly the moment it had the most to say. The
      // event carries no payload, so this key is only a coalescing bucket — one
      // notification per session, which is what makes them independent.
      if (name.endsWith('.json')) emit({ kind: 'sessions' }, `sessions/${name}`)
    })
    const stopProjects = arm(join(CLAUDE_DIR, 'projects'), true, (name) => {
      const event = locate(name)
      if (event) emit(event, `${event.slug}/${event.id}`)
    })
    stopAll = () => {
      stopSessions()
      stopProjects()
    }
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopAll?.()
      stopAll = null
      for (const w of windows.values()) clearTimeout(w.timer)
      windows.clear()
    }
  }
}
