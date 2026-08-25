// Discover hooks contributed by installed plugins. These live in each plugin's
// own `hooks/hooks.json` (same shape as settings.json > hooks), NOT in
// settings.json — so they must be surfaced separately (read-only) or the Hooks
// view would wrongly look empty while plugin hooks are actually active.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CLAUDE_DIR } from './claude/paths'

export interface PluginHooks {
  plugin: string
  hooks: Record<string, unknown>
}

export async function getPluginHooks(): Promise<PluginHooks[]> {
  const out: PluginHooks[] = []
  const rawInstalled = await readFile(join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'), 'utf8').catch(() => null)
  if (!rawInstalled) return out

  let parsed: { plugins?: Record<string, { installPath?: string }[]> }
  try {
    parsed = JSON.parse(rawInstalled) as typeof parsed
  } catch {
    return out
  }

  for (const [id, entries] of Object.entries(parsed.plugins ?? {})) {
    const installPath = entries[0]?.installPath
    if (!installPath) continue
    // installPath comes from the trusted registry (not user input); read directly.
    const raw = await readFile(join(installPath, 'hooks', 'hooks.json'), 'utf8').catch(() => null)
    if (!raw) continue
    try {
      const h = JSON.parse(raw) as { hooks?: Record<string, unknown> }
      if (h.hooks && Object.keys(h.hooks).length) out.push({ plugin: id, hooks: h.hooks })
    } catch {
      /* skip malformed plugin hooks */
    }
  }
  return out
}
