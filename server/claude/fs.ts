// Safe filesystem operations over the managed .claude directory.
//
// All access goes through the guards in ./paths (escape + allow/deny). Writes
// are two-phase by contract: the route layer first `propose`s (read current,
// return before/after — no write), then `apply`s here, which snapshots a backup
// and writes only if the on-disk content still matches what the client saw
// (optimistic concurrency — refuses to clobber an out-of-band change).

import { readFile, writeFile, readdir, stat, mkdir, copyFile, cp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { t } from '../i18n/index.ts'
import { BACKUPS_DIR } from '../paths'
import { resolveForRead, resolveForWrite, isDenied } from './paths'

export interface DirEntry {
  /** Root-relative path (POSIX-style). */
  rel: string
  name: string
  kind: 'file' | 'dir'
  size: number
  /** Epoch millis of last modification. */
  mtime: number
}

/** Read a UTF-8 text file. Throws PathError for escapes/denied, ENOENT if absent. */
export async function readText(rel: string): Promise<string> {
  const { abs } = resolveForRead(rel)
  return readFile(abs, 'utf8')
}

/** Read a text file, returning null instead of throwing when it doesn't exist. */
export async function readTextOrNull(rel: string): Promise<string | null> {
  try {
    return await readText(rel)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** List one directory (non-recursive), hiding denied entries. */
export async function listDir(rel: string): Promise<DirEntry[]> {
  const { abs, rel: base } = resolveForRead(rel || '.')
  const names = await readdir(abs, { withFileTypes: true })
  const out: DirEntry[] = []
  for (const d of names) {
    const childRel = base && base !== '.' ? `${base}/${d.name}` : d.name
    if (isDenied(childRel)) continue
    let size = 0
    let mtime = 0
    try {
      const s = await stat(join(abs, d.name))
      size = s.size
      mtime = s.mtimeMs
    } catch {
      /* unreadable entry — report it with zeros rather than failing the listing */
    }
    out.push({
      rel: childRel,
      name: d.name,
      kind: d.isDirectory() ? 'dir' : 'file',
      size,
      mtime,
    })
  }
  // Directories first, then files, each alphabetical.
  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
  return out
}

/** Does a readable path exist? (denied/escape ⇒ false). */
export async function exists(rel: string): Promise<boolean> {
  try {
    const { abs } = resolveForRead(rel)
    await stat(abs)
    return true
  } catch {
    return false
  }
}

export interface ApplyResult {
  ok: true
  /** Absolute path of the backup that was taken (null when the file was new). */
  backupPath: string | null
  rel: string
}

/** Optimistic-concurrency mismatch: on-disk content changed since `propose`. */
export class ConflictError extends Error {
  constructor(readonly current: string | null) {
    super(t('guard.fileChanged'))
  }
}

/**
 * Apply a write inside a writable area, after backing up any existing file.
 *
 * @param expectedBefore  the content the client last saw (from `propose`);
 *   `null` means "the file was expected not to exist". If reality differs, we
 *   throw ConflictError and write nothing.
 */
export async function writeWithBackup(rel: string, content: string, expectedBefore: string | null): Promise<ApplyResult> {
  const { abs, rel: safeRel } = resolveForWrite(rel)

  const current = await readTextOrNull(rel)
  if (current !== expectedBefore) throw new ConflictError(current)

  let backupPath: string | null = null
  if (current !== null) {
    backupPath = await backup(safeRel, abs)
  }

  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf8')
  return { ok: true, backupPath, rel: safeRel }
}

/** Copy the current file into a per-write timestamped backup tree. */
async function backup(safeRel: string, abs: string): Promise<string> {
  // Caller-provided stamp avoids Date.now() here; use file mtime for uniqueness.
  const s = await stat(abs)
  const stamp = new Date(s.mtimeMs).toISOString().replace(/[:.]/g, '-')
  const dest = join(BACKUPS_DIR, stamp, safeRel)
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(abs, dest)
  return dest
}

/**
 * Delete a writable file or directory, after backing it up (recursively for a
 * directory — e.g. a whole skill folder). Throws ENOENT if it doesn't exist.
 */
export async function deleteWithBackup(rel: string): Promise<{ backupPath: string; rel: string }> {
  const { abs, rel: safeRel } = resolveForWrite(rel)
  const s = await stat(abs) // ENOENT ⇒ nothing to delete
  const stamp = new Date(s.mtimeMs).toISOString().replace(/[:.]/g, '-')
  const dest = join(BACKUPS_DIR, stamp, safeRel)
  await mkdir(dirname(dest), { recursive: true })
  await cp(abs, dest, { recursive: true })
  await rm(abs, { recursive: true, force: true })
  return { backupPath: dest, rel: safeRel }
}
