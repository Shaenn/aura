// Nested get/set/delete by key path, used to bind form controls to a JSON
// document while preserving key order (we mutate the parsed object in place;
// JSON.stringify then reproduces insertion order → minimal, meaningful diffs).

export type Path = (string | number)[];

type Json = Record<string, unknown> | unknown[];

/** Read a nested value; returns undefined if any segment is missing. */
export function getAt(root: unknown, path: Path): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** Set a nested value, creating intermediate objects/arrays as needed. */
export function setAt(root: Json, path: Path, value: unknown): void {
  if (!path.length) return;
  let cur: Record<string | number, unknown> = root as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    const next = cur[key];
    if (next == null || typeof next !== 'object') {
      // Create an array when the next segment is a number, else an object.
      cur[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    cur = cur[key] as Record<string | number, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}

/** Delete a nested key (no-op if the path doesn't fully exist). */
export function deleteAt(root: Json, path: Path): void {
  if (!path.length) return;
  const parent = getAt(root, path.slice(0, -1));
  if (parent == null || typeof parent !== 'object') return;
  const key = path[path.length - 1]!;
  if (Array.isArray(parent) && typeof key === 'number') {
    parent.splice(key, 1);
  } else {
    delete (parent as Record<string | number, unknown>)[key];
  }
}
