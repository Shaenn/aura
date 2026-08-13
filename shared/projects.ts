// Wire types of the Projects API (`/api/projects/*`), shared between the BFF
// that builds them and the SPA that renders them. See `./transcript.ts`.

import type { TranscriptSummary } from './transcript.ts';

export interface ProjectSummary {
  slug: string;
  path: string;
  name: string;
  size: number;
  sessions: number;
  lastActivity: number;
  hasClaudeDir: boolean;
}

export type ResourceCategory =
  | 'agents'
  | 'skills'
  | 'commands'
  | 'rules'
  | 'hooks'
  | 'docs'
  | 'tools'
  | 'settings'
  | 'memory'
  | 'repo'
  | 'included'
  | 'other';

export interface ResourceNode {
  category: ResourceCategory;
  /** POSIX path relative to the source .claude folder. */
  rel: string;
  name: string;
  title: string;
  description: string;
  size: number;
  mtime: number;
}

/**
 * Un dossier du projet que l'utilisateur a demandé à voir, et ses documents.
 *
 * Le `rel` des fichiers part de la racine du projet, comme celui des CLAUDE.md,
 * et non du dossier inclus : c'est ce que la route de lecture attend.
 */
export interface IncludedFolder {
  rel: string;
  files: ResourceNode[];
}

/** Un dossier qu'AURA propose d'inclure, avec ce qu'il contient. */
export interface FolderCandidate {
  rel: string;
  /** Documents du sous-arbre — ce qui justifie ou non de l'inclure. */
  docs: number;
  included: boolean;
}

export interface HookEntry {
  event: string;
  matcher: string;
  command: string;
}

/**
 * L'inventaire des fichiers d'un projet, sans rien de ce qui coûte cher à
 * produire. `ProjectDetail` en est l'extension : mêmes champs, plus les hooks et
 * le résumé de chaque transcript. Les écrans qui n'affichent que l'arbre des
 * ressources demandent celui-ci — voir `getProjectResources` côté serveur.
 */
export interface ProjectResources {
  slug: string;
  path: string;
  name: string;
  hasClaudeDir: boolean;
  resources: ResourceNode[];
  /** Agent instructions found in the source tree — CLAUDE.md and its siblings
   * (AGENTS.md, GEMINI.md, .cursorrules…). Their `rel` is relative to the
   * project root, not to .claude — so they read through their own endpoint. */
  memories: ResourceNode[];
  /** Repository documents: README, CONTRIBUTING, LICENSE and the like, taken at
   * the project root only, plus the fixed .github templates. Same origin and
   * same endpoint as `memories` — a separate list because a README is not
   * memory: Claude Code never loads it on its own. */
  repoDocs: ResourceNode[];
  /** Les dossiers que l'utilisateur a inclus, un groupe chacun. Vide par défaut :
   * aucun projet n'en a tant qu'on n'en a pas demandé. */
  folders: IncludedFolder[];
}

export interface ProjectDetail extends ProjectResources {
  hooks: HookEntry[];
  transcripts: TranscriptSummary[];
}
