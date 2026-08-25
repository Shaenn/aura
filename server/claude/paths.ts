// Path safety for everything under the managed .claude directory.
//
// Two guarantees enforced here, once, for every route:
//  1. No escape: a client-supplied relative path can never resolve outside the
//     .claude root — `..`, absolute paths, and symlinks, the last one because
//     the prefix check runs on the *canonical* path the disk gives back.
//  2. Least privilege: reads are broad (browse almost anything) but a denylist
//     always hides secrets/caches; WRITES are restricted to an allowlist of the
//     human-editable resource areas. AURA never writes a cache or a log.
//
// Both lists are matched case-insensitively. A denylist compared byte for byte
// is decoration on Windows: `.Credentials.json` opens the very file that
// `.credentials.json` refuses, and NTFS hands back the same bytes.

import { realpathSync } from 'node:fs'
import { basename, dirname, normalize, sep, join } from 'node:path'
import { loadEnv } from '../env'
import { t } from '../i18n/index.ts'

/** Absolute root of the managed directory (usually ~/.claude). */
export const CLAUDE_DIR = loadEnv().claudeDir

/**
 * The path as the disk names it: symlinks followed, real case, 8.3 short names
 * expanded.
 *
 * A path that does not exist yet has no canonical form — we canonicalise its
 * first existing ancestor and glue the rest back on. That is enough: a write
 * can only leave the root through a directory that, itself, already exists.
 */
export function canonicalPath(abs: string): string {
  let head = normalize(abs)
  const tail: string[] = []
  for (;;) {
    try {
      const real = realpathSync.native(head)
      return tail.length ? join(real, ...tail) : real
    } catch {
      const parent = dirname(head)
      if (parent === head) return normalize(abs) // volume root unreachable
      tail.unshift(basename(head))
      head = parent
    }
  }
}

/** The root under its canonical form — every prefix check compares against it. */
const CLAUDE_ROOT = canonicalPath(CLAUDE_DIR)

/** A path (relative to CLAUDE_DIR) refused for *any* access — secrets & noise. */
const DENY_READ: { exact: Set<string>; prefixes: string[] } = {
  // Never read, expose, back up or modify these.
  exact: new Set(['.credentials.json']),
  // Volatile / huge / private-transcript areas: hidden from the browser too.
  prefixes: ['file-history', 'telemetry', 'paste-cache', 'shell-snapshots', 'statsig', 'cache', 'sessions', 'session-env', 'tasks', 'jobs', 'daemon'],
}

/** Path prefixes (relative to CLAUDE_DIR) that MAY be written by AURA. */
const WRITE_ALLOW: { exact: Set<string>; prefixes: string[] } = {
  // `plugins/` is never written directly — Claude Code manages that tree and
  // coordinates several files; AURA only edits the declarative settings.json keys
  // and surfaces the `/plugin …` CLI commands for install/uninstall/remove.
  // Lower-cased, like every entry compared here — see the header note.
  exact: new Set(['settings.json', 'claude.md']),
  prefixes: ['agents', 'skills', 'projects'],
}

/** Normalise a client path to POSIX-style, root-relative, no leading slash. */
function toRel(rel: string): string {
  return normalize(rel)
    .replace(/^([/\\])+/, '')
    .split(sep)
    .join('/')
}

export class PathError extends Error {
  constructor(
    message: string,
    readonly code: 'escape' | 'denied' | 'not-writable' = 'denied',
  ) {
    super(message)
  }
}

/**
 * Resolve a client-supplied relative path to an absolute path *inside*
 * CLAUDE_DIR, or throw. Guards against `..` escapes and absolute inputs.
 */
export function resolveSafe(rel: string): { abs: string; rel: string } {
  const cleaned = toRel(rel)
  // Canonicalise *before* judging: the name the client sent is not necessarily
  // the name the disk uses, and only the latter says where the bytes are.
  const abs = canonicalPath(join(CLAUDE_ROOT, cleaned))
  if (abs !== CLAUDE_ROOT && !abs.startsWith(CLAUDE_ROOT + sep)) {
    throw new PathError(t('guard.outsideRoot', { path: rel }), 'escape')
  }
  // The denylist then runs on what the disk really names, not on what was asked:
  // `agents/../.credentials.json` and a symlink to it both end up as themselves.
  const real =
    abs === CLAUDE_ROOT
      ? cleaned
      : abs
          .slice(CLAUDE_ROOT.length + 1)
          .split(sep)
          .join('/')
  return { abs, rel: real }
}

/** True when a root-relative path is hidden from all access (secrets/caches). */
export function isDenied(rel: string): boolean {
  const r = toRel(rel).toLowerCase()
  if (DENY_READ.exact.has(r)) return true
  return DENY_READ.prefixes.some((p) => r === p || r.startsWith(p + '/'))
}

/** True when a root-relative path is within a AURA-writable area. */
export function isWritable(rel: string): boolean {
  const r = toRel(rel).toLowerCase()
  if (isDenied(r)) return false
  if (WRITE_ALLOW.exact.has(r)) return true
  return WRITE_ALLOW.prefixes.some((p) => r === p || r.startsWith(p + '/'))
}

/** Resolve for reading: throws on escape or a denied (secret/cache) path. */
export function resolveForRead(rel: string): { abs: string; rel: string } {
  const res = resolveSafe(rel)
  // C'est une politique d'AURA, pas un refus du système : elle s'énonce donc à
  // la première personne — voir docs/voix.md.
  if (isDenied(res.rel)) throw new PathError(`Je ne lis pas ce chemin : ${rel}`, 'denied')
  return res
}

/** Resolve for writing: throws unless the path is within a writable area. */
export function resolveForWrite(rel: string): { abs: string; rel: string } {
  const res = resolveSafe(rel)
  if (!isWritable(res.rel)) {
    throw new PathError(t('guard.notWritable', { path: rel }), 'not-writable')
  }
  return res
}
