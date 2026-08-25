// Read-side access to the timestamped safety backups AURA takes before every
// write/delete (see claude/fs.ts). Layout: `.local/backups/<stamp>/<rel…>`,
// where <rel> mirrors the file's path under the managed .claude dir.
//
// Restore is NOT implemented here: the UI restores by reading a backup's content
// and running it through the normal propose/apply flow (which itself backs up
// the pre-restore state) — so restoring is just another guarded, previewed write.

import { existsSync } from 'node:fs'
import { readdir, stat, readFile, rm } from 'node:fs/promises'
import { join, relative, sep, normalize } from 'node:path'
import { BACKUPS_DIR } from './paths'

export interface BackupEntry {
  /** Snapshot id (the timestamped folder name). */
  stamp: string
  /** Path of the backed-up file, relative to the managed .claude dir. */
  rel: string
  size: number
  mtime: number
}

async function walk(dir: string, base: string, out: { rel: string; size: number; mtime: number }[]): Promise<void> {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    if (d.isDirectory()) {
      await walk(p, base, out)
    } else {
      const s = await stat(p)
      out.push({ rel: relative(base, p).split(sep).join('/'), size: s.size, mtime: s.mtimeMs })
    }
  }
}

/** Flat list of every backed-up file across all snapshots. */
export async function listBackups(): Promise<BackupEntry[]> {
  if (!existsSync(BACKUPS_DIR)) return []
  const out: BackupEntry[] = []
  for (const d of await readdir(BACKUPS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const stampDir = join(BACKUPS_DIR, d.name)
    const files: { rel: string; size: number; mtime: number }[] = []
    await walk(stampDir, stampDir, files)
    for (const f of files) out.push({ stamp: d.name, rel: f.rel, size: f.size, mtime: f.mtime })
  }
  return out
}

/**
 * La forme d'un instantané, telle que `claude/fs.ts` la produit : un instant ISO
 * dont les `:` et les `.` sont devenus des tirets.
 *
 * Une liste blanche de forme, et non un filtre de caractères. L'ancien filtre
 * retirait les séparateurs mais gardait le point, si bien qu'un `stamp` valant
 * `..` désignait le dossier parent : `purgeBackups` y effaçait récursivement
 * tout `.local/` — les sauvegardes *et* les préférences — et `readBackup` y
 * lisait hors du dossier des instantanés.
 */
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/

/** Le dossier d'un instantané, ou une erreur si le nom n'en est pas un. */
function stampDirOf(stamp: string): string {
  if (!STAMP.test(stamp)) throw new Error('Instantané inconnu.')
  return join(BACKUPS_DIR, stamp)
}

/** Read a single backed-up file's content (guards against path traversal). */
export async function readBackup(stamp: string, rel: string): Promise<string> {
  const root = stampDirOf(stamp)
  const abs = normalize(join(root, rel))
  if (abs !== root && !abs.startsWith(root + sep)) throw new Error('Chemin de backup invalide.')
  return readFile(abs, 'utf8')
}

/**
 * Efface un instantané, et lui seul.
 *
 * Le tout venait par omission : un `stamp` absent — ou vide, ce qui revenait au
 * même — effaçait l'ensemble des sauvegardes. C'est le pire défaut par défaut
 * qui soit, sur la seule chose qui permette de revenir en arrière. Le tout se
 * demande maintenant par son nom, ci-dessous.
 */
export async function purgeBackup(stamp: string): Promise<void> {
  const target = stampDirOf(stamp)
  // Ceinture et bretelles : `stampDirOf` a déjà refusé tout ce qui n'est pas un
  // instantané, mais un `rm -rf` mérite qu'on vérifie deux fois où il pointe.
  if (!target.startsWith(BACKUPS_DIR + sep)) throw new Error('Chemin de backup invalide.')
  await rm(target, { recursive: true, force: true })
}

/** Efface toutes les sauvegardes. Sans retour possible : à ne pas déduire. */
export async function purgeAllBackups(): Promise<void> {
  await rm(BACKUPS_DIR, { recursive: true, force: true })
}
