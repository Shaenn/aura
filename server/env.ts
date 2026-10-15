// Server-side configuration for the BFF.
//
// AURA is a local, single-user tool. Three knobs live here: the port, an
// optional override of the managed .claude directory (handy for tests or a
// sandboxed copy), and the log level.
//
// Il y a désormais une exception à « aucun service externe, aucun secret », et
// elle est volontairement tenue à l'écart d'ici : la Passerelle
// (`passerelle/index.ts`) lit `AURA_TELEGRAM_TOKEN` et `AURA_TELEGRAM_CHATS`
// directement dans l'environnement. Ce jeton ne traverse donc pas `ServerEnv`,
// que tout le serveur importe — il reste dans le seul module qui en a besoin, et
// aucune route n'est en mesure de le renvoyer par mégarde.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, normalize, sep } from 'node:path'

/**
 * Les ports d'AURA, lus dans `ports.json` à la racine du dépôt.
 *
 * Une seule déclaration pour une valeur que le proxy de Quasar et le script
 * `stop` doivent tous deux connaître — voir l'en-tête de `quasar.config.ts`
 * pour les neuf endroits où elle vivait.
 */
const PORTS = JSON.parse(readFileSync(new URL('../ports.json', import.meta.url), 'utf8')) as { web: number; api: number }

export interface ServerEnv {
  /** Port the Fastify server listens on (Quasar's dev proxy targets it). */
  port: number
  /** Absolute path of the .claude directory AURA manages. */
  claudeDir: string
  /**
   * Le niveau du journal (`LOG_LEVEL`), `info` par défaut. `debug` rend
   * visibles les relevés — les routes que la SPA interroge en boucle —, qui ne
   * s'écrivent qu'en `dbg` (voir `journal.ts`).
   */
  niveauJournal: NiveauJournal
}

/** Les niveaux de pino, que Fastify comprend. */
export type NiveauJournal = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const NIVEAUX_JOURNAL: NiveauJournal[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

/** Read the server environment; everything has a sensible local default. */
export function loadEnv(): ServerEnv {
  // `PORT` garde la priorité : c'est ce qui permet de lancer une seconde
  // instance, ou un test sur un port libre, sans toucher au fichier partagé.
  const port = Number(process.env.PORT ?? PORTS.api)
  const raw = process.env.AURA_CLAUDE_DIR?.trim() || join(homedir(), '.claude')
  // Une valeur inconnue retombe sur `info` plutôt que d'empêcher le démarrage :
  // une faute de frappe dans un réglage de confort ne doit pas couper AURA.
  const niveau = (process.env.LOG_LEVEL ?? '').trim().toLowerCase() as NiveauJournal
  return { port, claudeDir: normalizeRoot(raw), niveauJournal: NIVEAUX_JOURNAL.includes(niveau) ? niveau : 'info' }
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
  const n = normalize(dir)
  return n.length > 1 && n.endsWith(sep) ? n.slice(0, -1) : n
}
