import { apiHeaders, type HeaderMap } from '@/services/http'

// Client for the safety-backups API (`/api/backups/*`). Restore itself reuses
// the claude propose/apply flow (see BackupsPage), so it's not here.

export interface BackupEntry {
  stamp: string
  rel: string
  size: number
  mtime: number
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: apiHeaders(init?.headers as HeaderMap | undefined),
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const b = (await res.json()) as { error?: string }
      if (b.error) msg = b.error
    } catch {
      /* non-JSON */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function listBackups(): Promise<{ entries: BackupEntry[] }> {
  return req('/api/backups')
}

export function readBackup(stamp: string, path: string): Promise<{ content: string }> {
  return req(`/api/backups/content?stamp=${encodeURIComponent(stamp)}&path=${encodeURIComponent(path)}`)
}

/**
 * Efface un instantané, ou la totalité si `stamp` est omis.
 *
 * Le corps le dit dans les deux cas : `{ all: true }` n'est pas décoratif. Le
 * BFF refuse désormais une demande de purge qui ne nomme pas sa cible — un
 * corps vide effaçait tout, et c'est ce qu'on envoie par accident.
 */
export function purgeBackups(stamp?: string): Promise<{ ok: true }> {
  return req('/api/backups/purge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stamp ? { stamp } : { all: true }),
  })
}
