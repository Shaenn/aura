/**
 * Coercions for values parsed out of untrusted JSON (transcripts, settings,
 * `~/.claude.json`), where a field's type is whatever the writer happened to
 * emit.
 *
 * `String(v)` is the tempting shortcut, but it renders an object as the useless
 * `'[object Object]'` and a null as `'null'` — both of which then flow into
 * comparisons and into the UI. These narrow instead: a value of the wrong shape
 * reads as absent.
 */

/** The value if it is a string, else `fallback` (default `''`). */
export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** The value if it is a finite number, else `fallback` (default `0`). */
export function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
