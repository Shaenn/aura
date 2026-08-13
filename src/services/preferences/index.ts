import { apiHeaders } from '@/services/http';

// Client for the server-side UI preferences (`/api/preferences`).
//
// These replace the browser's localStorage: preferences live in the BFF's
// `.local/preferences.json`. The store owns the shape; here we just read/write
// the whole object.

export type Preferences = Record<string, unknown>;

/** Read the stored preferences ({} when none). Times out so boot never hangs. */
export async function getPreferences(timeoutMs = 3000): Promise<Preferences> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/preferences', {
      headers: apiHeaders(),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Preferences;
  } finally {
    clearTimeout(timer);
  }
}

/** Persist the whole preferences object (full replace). */
export async function savePreferences(prefs: Preferences): Promise<void> {
  const res = await fetch('/api/preferences', {
    method: 'PUT',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(prefs),
  });
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
}
