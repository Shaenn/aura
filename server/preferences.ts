// Les préférences d'interface, sur disque (`.local/preferences.json`).
//
// Le front en détient la forme et les écrit d'un bloc (`PUT /api/preferences`) ;
// ce module ne fait que les relire. Il est à part de la route depuis que le BFF
// en a besoin lui aussi : les dossiers de projet inclus y sont déclarés, et
// c'est le serveur qui décide de ce qu'il ouvre, jamais la requête.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LOCAL_DIR } from './paths'

export const PREFERENCES_PATH = join(LOCAL_DIR, 'preferences.json')

/** Read the preferences object; missing/unreadable/non-object ⇒ {}. */
export async function readPreferences(): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(PREFERENCES_PATH, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {} // absent file is the normal empty state
  }
}

/**
 * Les dossiers inclus déclarés pour un projet, bruts.
 *
 * Rien n'est validé ici — c'est `sanitizeFolders` qui s'en charge, au plus près
 * de l'usage, pour qu'aucun appelant ne puisse l'oublier.
 */
export async function includedFoldersOf(slug: string): Promise<unknown> {
  const prefs = await readPreferences()
  const byProject = prefs.includedFolders
  if (!byProject || typeof byProject !== 'object' || Array.isArray(byProject)) return []
  return (byProject as Record<string, unknown>)[slug] ?? []
}
