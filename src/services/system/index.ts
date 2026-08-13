import { apiHeaders, type HeaderMap } from '@/services/http';
import type { KillProcessResult, ProcessList } from '@/../shared/processes';

export type { ClaudeProcess, ClaudeProcessKind } from '@/../shared/processes';

// Client for the observability & maintenance API (`/api/system/*`).

export interface StorageArea {
  key: string;
  label: string;
  size: number;
  purgeable: boolean;
}
export interface Storage {
  areas: StorageArea[];
  backups: number;
  total: number;
}
export interface SessionInfo {
  pid?: number;
  sessionId: string;
  cwd: string;
  name?: string;
  status?: string;
  /** When `status` is `waiting`, what it's blocked on (e.g. `permission prompt`). */
  waitingFor?: string;
  kind?: string;
  startedAt?: number;
  updatedAt?: number;
  version?: string;
  /** Project dir slug holding this session's transcript; '' if not located. */
  slug: string;
}
export interface PlanInfo {
  name: string;
  title: string;
  mtime: number;
  size: number;
  /** Owning project slug + real path; both empty when the plan has no known project. */
  projectSlug: string;
  projectPath: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: apiHeaders(init?.headers as HeaderMap | undefined),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b.error) msg = b.error;
    } catch {
      /* non-JSON */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const getStorage = (): Promise<Storage> => req('/api/system/storage');
export const purgeArea = (area: string): Promise<{ ok: true }> =>
  req('/api/system/purge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ area }),
  });
export const getSessions = (): Promise<{ sessions: SessionInfo[] }> => req('/api/system/sessions');

/** Les processus Claude vivants — ce que le système exécute, pas ce que le disque déclare. */
export const getProcesses = (): Promise<ProcessList> => req('/api/system/processes');

/**
 * Terminer un processus, `descendants` compris.
 *
 * Presque toujours avec la descendance : un job coupé sans son hôte de
 * pseudo-terminal renaît aussitôt. Le serveur reste seul juge de l'ordre.
 */
export const killProcess = (pid: number, descendants: boolean): Promise<KillProcessResult> =>
  req('/api/system/processes/kill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid, descendants }),
  });
export const getPlans = (): Promise<{ plans: PlanInfo[] }> => req('/api/system/plans');
export const readPlan = (name: string): Promise<{ name: string; content: string }> =>
  req(`/api/system/plan?name=${encodeURIComponent(name)}`);
export const deletePlan = (name: string): Promise<{ ok: true }> =>
  req('/api/system/plan/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
