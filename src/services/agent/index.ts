// Client de l'API de l'Atelier (`/api/agent/*`).
//
// Les types du fil sont déclarés une fois dans `shared/` et réexportés ici : le
// BFF et la SPA typent contre les mêmes déclarations, donc un champ renommé
// casse les deux compilations d'un coup — ce qui est le but.

export type {
  ActiveTool,
  AgentActivity,
  AgentPhase,
  AgentSession,
  AgentStatus,
  AgentUpsert,
  AskQuestion,
  AskRequest,
  BackgroundShell,
  PermissionAnswer,
  PermissionRequest,
  PromptAttachment,
  ShellOutput,
  SlashCommandInfo,
} from '@/../shared/agent';
export { IDLE_ACTIVITY, PERMISSION_MODES } from '@/../shared/agent';

import type {
  AgentSession,
  PermissionAnswer,
  PromptAttachment,
  ShellOutput,
  SlashCommandInfo,
} from '@/../shared/agent';
import { apiHeaders } from '@/services/http';

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  // `Content-Type` seulement quand il y a un corps : annoncer du JSON sans en
  // envoyer fait répondre 400 à Fastify, qui refuse un corps JSON vide. Les
  // ordres sans argument — arrêter, interrompre — tombaient tous là-dessus.
  const res = await fetch(url, {
    method,
    headers: apiHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const parsed = (await res.json()) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* réponse non-JSON : le code HTTP suffira */
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return (await res.json()) as T;
}

export const listAgentSessions = (): Promise<{ sessions: AgentSession[] }> =>
  send('/api/agent/sessions', 'GET');

export const createAgentSession = (body: {
  cwd: string;
  model?: string;
  permissionMode?: string;
  prompt?: string;
  /** Les images du premier tour, quand la session s'ouvre sur un message. */
  attachments?: PromptAttachment[];
  /** Identifiant SDK d'une session à prolonger, en place. */
  resume?: string;
}): Promise<{ session: AgentSession }> => send('/api/agent/sessions', 'POST', body);

export const setSessionPermissionMode = (
  runId: string,
  permissionMode: string,
): Promise<{ ok: true }> =>
  send(`/api/agent/sessions/${runId}/permission-mode`, 'POST', { permissionMode });

export const sendPrompt = (
  runId: string,
  prompt: string,
  attachments?: PromptAttachment[],
): Promise<{ ok: true }> =>
  send(`/api/agent/sessions/${runId}/send`, 'POST', {
    prompt,
    ...(attachments?.length ? { attachments } : {}),
  });

/**
 * Les commandes `/` que la session accepte.
 *
 * Le premier appel démarre le processus du CLI s'il ne tourne pas encore : on
 * ne l'appelle donc qu'au premier `/` tapé, pas à l'ouverture de l'écran.
 */
export const getSessionCommands = (runId: string): Promise<{ commands: SlashCommandInfo[] }> =>
  send(`/api/agent/sessions/${runId}/commands`, 'GET');

/**
 * Les fichiers du dossier de travail, pour l'autocomplétion du `@`.
 *
 * Aucun chemin ne monte : le serveur part du `cwd` de la session. La liste
 * arrive entière et se filtre ici même, si bien qu'une frappe ne coûte rien.
 * `truncated` dit qu'un dépôt trop grand a été coupé — l'écran le signale
 * plutôt que de laisser croire à une liste complète.
 */
export const getSessionFiles = (runId: string): Promise<{ files: string[]; truncated: boolean }> =>
  send(`/api/agent/sessions/${runId}/files`, 'GET');

/**
 * La suite de la sortie d'un shell lancé en arrière-plan.
 *
 * `from` est le curseur rendu par l'appel précédent : le panneau ne redemande
 * que ce qui s'est écrit depuis. Aucun chemin ne monte — le serveur retrouve le
 * fichier à partir de l'identifiant du shell, comme pour les fichiers du `@`.
 */
export const getShellOutput = (runId: string, shellId: string, from = 0): Promise<ShellOutput> =>
  send(`/api/agent/sessions/${runId}/shells/${shellId}/output?from=${from}`, 'GET');

export const interruptSession = (runId: string): Promise<{ ok: true }> =>
  send(`/api/agent/sessions/${runId}/interrupt`, 'POST');

export const stopSession = (runId: string): Promise<{ ok: true }> =>
  send(`/api/agent/sessions/${runId}`, 'DELETE');

/**
 * Répondre à une demande de permission.
 *
 * Un `410` n'est pas une panne : la demande a existé et un autre onglet,
 * l'échéance ou une interruption l'a déjà tranchée. L'appelant retire le bandeau
 * et n'affiche rien.
 */
export const answerPermission = (
  runId: string,
  id: string,
  answer: PermissionAnswer,
  reason?: string,
): Promise<{ ok: true }> =>
  send(`/api/agent/sessions/${runId}/permissions/${id}`, 'POST', { answer, reason });

export const answerAsk = (
  runId: string,
  id: string,
  answers: Record<string, string>,
  notes?: string,
): Promise<{ ok: true }> =>
  send(`/api/agent/sessions/${runId}/ask/${id}`, 'POST', { answers, notes });

/**
 * Ouvre le sélecteur de dossier du système, sur la machine du BFF.
 *
 * `path: null` = l'utilisateur a annulé. Un `501` = la plateforme n'a pas de
 * sélecteur ; l'appelant retombe alors sur la saisie du chemin.
 */
export const pickFolder = (startFrom?: string): Promise<{ path: string | null }> =>
  send('/api/agent/pick-folder', 'POST', { startFrom });

/** L'adresse du flux ; l'`EventSource` est ouverte par `useLiveSession`. */
export const streamUrl = (runId: string): string => `/api/agent/sessions/${runId}/stream`;
