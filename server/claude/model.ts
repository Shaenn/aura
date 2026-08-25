// Which context window the user actually configured.
//
// A transcript cannot answer this on its own. A session running the 1M window
// records `message.model` with the `[1m]` suffix stripped (plain `claude-opus-5`),
// so `contextLimitFor` has to infer the window from evidence: it only concludes
// "1M" once some turn — or some compaction — has been seen above 200k. Until then
// a long-window session is drawn against a 200k ceiling. That is exactly the case
// for a session followed live, which starts small and stays small for a while.
//
// The suffix does survive where the model was chosen, in settings:
// `"model": "opus[1m]"`. So we read it there and hand it to the accumulator as a
// second, up-front signal. Precedence follows Claude Code's own — the project's
// local settings, then the project's, then the user's.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CLAUDE_DIR } from './paths'

/** A model id asks for the large window by carrying the `[1m]` suffix. */
function isLong(model: string): boolean {
  return model.includes('[1m]')
}

/**
 * The `model` key of one settings file, or null.
 *
 * Absent, unreadable or malformed all mean the same thing here — this file says
 * nothing about the model — so none of them is an error worth propagating.
 */
async function modelOf(abs: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(abs, 'utf8'))
    const model = (parsed as { model?: unknown } | null)?.model
    return typeof model === 'string' && model ? model : null
  } catch {
    return null
  }
}

/**
 * Settings files to consult for `cwd`, most specific first.
 *
 * A session without a `cwd` still has the user's own settings — that is the
 * common case for the window, since the model is usually chosen once globally.
 */
function settingsChain(cwd: string): string[] {
  const chain: string[] = []
  if (cwd) {
    chain.push(join(cwd, '.claude', 'settings.local.json'))
    chain.push(join(cwd, '.claude', 'settings.json'))
  }
  chain.push(join(CLAUDE_DIR, 'settings.json'))
  return chain
}

/**
 * Re-reading three small files per transcript parse would be silly — the answer
 * changes only when the user picks another model. A short TTL keeps a burst of
 * polls off the disk while still noticing that change within seconds.
 */
const TTL_MS = 5_000
const cache = new Map<string, { at: number; long: boolean }>()

/** True when the configured model asks for the 1M window. */
export async function configuredLongWindow(cwd: string): Promise<boolean> {
  const key = cwd || ''
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.long

  let long = false
  for (const file of settingsChain(key)) {
    const model = await modelOf(file)
    // The first file that names a model decides: an override that selects a
    // small-window model must *win*, not be overruled by a broader setting.
    if (model) {
      long = isLong(model)
      break
    }
  }

  cache.set(key, { at: Date.now(), long })
  return long
}
