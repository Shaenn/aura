// Client for the first-class Projects API (`/api/projects/*`) — all read-only.
//
// The wire types are defined once in `shared/` and re-exported here, so callers
// keep importing them from `src/services/projects` while the BFF and the SPA
// typecheck against the same declarations.

import type { PlanInfo } from '@/services/system';
import { apiHeaders } from '@/services/http';

export type {
  FolderCandidate,
  HookEntry,
  IncludedFolder,
  ProjectDetail,
  ProjectResources,
  ProjectSummary,
  ResourceCategory,
  ResourceNode,
} from '@/../shared/projects';

export type {
  Block,
  HookRun,
  ParsedTranscript,
  SilentHookGroup,
  SilentHooks,
  SubagentRunStatus,
  PlanModeMark,
  SubagentRunSummary,
  TitleSource,
  ToolResult,
  TranscriptEvent,
  TranscriptImage,
  TranscriptStats,
  TranscriptSummary,
  Usage,
} from '@/../shared/transcript';

export type {
  Compaction,
  ContextCategory,
  ContextInjection,
  SessionContext,
  TurnContext,
} from '@/../shared/context';

import type {
  FolderCandidate,
  ProjectDetail,
  ProjectResources,
  ProjectSummary,
} from '@/../shared/projects';
import type { ParsedTranscript, TranscriptImage, TranscriptSummary } from '@/../shared/transcript';

async function request(url: string): Promise<Response> {
  const res = await fetch(url, { headers: apiHeaders() });
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
  return res;
}

async function req<T>(url: string): Promise<T> {
  return (await (await request(url)).json()) as T;
}

export const getProjects = (): Promise<{ projects: ProjectSummary[] }> => req('/api/projects');
export const getProjectDetail = (slug: string): Promise<ProjectDetail> =>
  req(`/api/projects/${encodeURIComponent(slug)}`);
/**
 * Le même inventaire que `getProjectDetail`, sans les transcripts.
 *
 * C'est la seule forme appelable depuis un écran qui change de projet souvent :
 * le détail complet résume chaque transcript du projet, ce qui se compte en
 * dizaines de méga-octets lus pour afficher un arbre de fichiers.
 */
export const getProjectResources = (slug: string): Promise<ProjectResources> =>
  req(`/api/projects/${encodeURIComponent(slug)}/resources`);
/** Les sessions d'un projet, du plus récent au plus ancien. Sans l'inventaire. */
export const getProjectSessions = (slug: string): Promise<{ sessions: TranscriptSummary[] }> =>
  req(`/api/projects/${encodeURIComponent(slug)}/sessions`);
/** Plans this project produced — they live in ~/.claude/plans, not in the project. */
export const getProjectPlans = (slug: string): Promise<{ plans: PlanInfo[] }> =>
  req(`/api/projects/${encodeURIComponent(slug)}/plans`);
export const readResource = (
  slug: string,
  path: string,
): Promise<{ rel: string; content: string }> =>
  req(`/api/projects/${encodeURIComponent(slug)}/resource?path=${encodeURIComponent(path)}`);
/** A CLAUDE.md of the source tree — a different sandbox than `readResource`. */
export const readMemory = (slug: string, path: string): Promise<{ rel: string; content: string }> =>
  req(`/api/projects/${encodeURIComponent(slug)}/memory?path=${encodeURIComponent(path)}`);
/**
 * Un document d'un dossier inclus.
 *
 * Troisième bac à sable, et le seul qui dépende d'un geste : le serveur relit la
 * liste des dossiers inclus dans les préférences et n'ouvre que ce qu'elle
 * couvre. Rien d'inclus, rien de lisible.
 */
export const readIncludedFile = (
  slug: string,
  path: string,
): Promise<{ rel: string; content: string }> =>
  req(`/api/projects/${encodeURIComponent(slug)}/included?path=${encodeURIComponent(path)}`);
/** Les dossiers qu'AURA propose d'inclure, du plus fourni au moins fourni. */
export const getFolderCandidates = (slug: string): Promise<{ candidates: FolderCandidate[] }> =>
  req(`/api/projects/${encodeURIComponent(slug)}/folder-candidates`);
/** Un transcript, et l'empreinte du fichier dont il sort. */
export interface TranscriptRead {
  transcript: ParsedTranscript;
  /** `''` si un intermédiaire a retiré l'en-tête : on ne peut alors rien déduire. */
  etag: string;
}

/**
 * Lire un transcript, en disant de quelle version du fichier il vient.
 *
 * Le BFF pose un `ETag` et le navigateur le revalide seul : un fichier inchangé
 * ne retraverse pas le réseau. Mais `fetch` ne laisse pas voir ce `304` — il
 * ressert le corps mis en cache comme un `200`. Sans l'empreinte, l'appelant
 * remplacerait son état par un objet neuf mais identique, et referait rendre
 * toute la timeline pour rien. On la lui rend donc, à lui de comparer.
 */
export async function readTranscript(slug: string, id: string): Promise<TranscriptRead> {
  const res = await request(
    `/api/projects/${encodeURIComponent(slug)}/transcript?id=${encodeURIComponent(id)}`,
  );
  return {
    transcript: (await res.json()) as ParsedTranscript,
    etag: res.headers.get('ETag') ?? '',
  };
}
/**
 * The full text of a tool result Claude Code spilled to disk.
 *
 * Outputs above ~2 KB are not stored in the transcript: it keeps a preview and a
 * pointer to `<session>/tool-results/<toolUseId>.txt`. This fetches that file.
 */
/**
 * L'adresse d'une image du transcript, à donner telle quelle à un `<img>`.
 *
 * Pas de `fetch` ici : les octets ne transitent pas par le JS. Le BFF les sert
 * en `immutable`, donc c'est le cache HTTP du navigateur qui fait le travail —
 * une image rendue deux fois n'est chargée qu'une.
 */
export const transcriptImageUrl = (slug: string, id: string, img: TranscriptImage): string =>
  `/api/projects/${encodeURIComponent(slug)}/transcript/image` +
  `?id=${encodeURIComponent(id)}&uuid=${encodeURIComponent(img.uuid)}&index=${img.index}` +
  (img.agentId ? `&agentId=${encodeURIComponent(img.agentId)}` : '');

export const readToolResult = (
  slug: string,
  id: string,
  toolUseId: string,
): Promise<{ toolUseId: string; content: string; truncated: boolean }> =>
  req(
    `/api/projects/${encodeURIComponent(slug)}/tool-result` +
      `?id=${encodeURIComponent(id)}&toolUseId=${encodeURIComponent(toolUseId)}`,
  );
