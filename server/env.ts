// Server-side configuration for the BFF.
//
// AURA is a local, single-user tool: no external service, no secret. The only
// knob is the port and an optional override of the managed .claude directory
// (handy for tests or a sandboxed copy).

import { homedir } from 'node:os';
import { join, normalize, sep } from 'node:path';

export interface ServerEnv {
  /** Port the Fastify server listens on (Quasar's dev proxy targets it). */
  port: number;
  /** Absolute path of the .claude directory AURA manages. */
  claudeDir: string;
}

/** Read the server environment; everything has a sensible local default. */
export function loadEnv(): ServerEnv {
  const port = Number(process.env.PORT ?? 8800);
  const raw = process.env.AURA_CLAUDE_DIR?.trim() || join(homedir(), '.claude');
  return { port, claudeDir: normalizeRoot(raw) };
}

/**
 * Ramène la racine gérée à la forme que produit `path` sur cette plateforme.
 *
 * La garde de chemins compare `normalize(join(CLAUDE_DIR, rel))` à `CLAUDE_DIR`
 * par préfixe. Les deux côtés doivent donc employer le **même** séparateur : sous
 * Windows, un `AURA_CLAUDE_DIR=C:/chemin/vers/.claude` — la forme qu'on obtient
 * en copiant un chemin depuis un éditeur — produit un `abs` en antislashs face à
 * une racine en barres obliques, et *toute* lecture est refusée avec « Chemin
 * hors du dossier géré ». L'application démarre et paraît saine ; seuls les
 * écrans sont vides.
 *
 * Le séparateur final est retiré pour la même raison : la comparaison ajoute
 * déjà `sep`, et une racine qui le porte déjà ne correspondrait plus.
 */
function normalizeRoot(dir: string): string {
  const n = normalize(dir);
  return n.length > 1 && n.endsWith(sep) ? n.slice(0, -1) : n;
}
