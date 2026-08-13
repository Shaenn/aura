// Binds form controls to a JSON *text* buffer as the single source of truth, so
// a structured form and a raw-JSON editor stay perfectly in sync and every write
// preserves key order (round-trip safety — see utils/json-edit).
//
// Reads parse the current text; writes clone → mutate → re-serialize the text.
// When the text isn't valid JSON, `valid` is false and controls should disable.

import { computed, type Ref, type WritableComputedRef } from 'vue';
import { getAt, setAt, deleteAt, type Path } from '@/utils/json-edit';

export function useJsonForm(content: Ref<string>) {
  const parsed = computed<Record<string, unknown> | null>(() => {
    try {
      const o: unknown = JSON.parse(content.value || '{}');
      return o && typeof o === 'object' && !Array.isArray(o)
        ? (o as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  });

  const valid = computed(() => parsed.value !== null);

  const serialize = (obj: unknown): string => JSON.stringify(obj, null, 2) + '\n';

  /** Clone the current object, apply a mutation, write it back to the text. */
  function mutate(fn: (o: Record<string, unknown>) => void): void {
    const base: Record<string, unknown> = parsed.value ? structuredClone(parsed.value) : {};
    fn(base);
    content.value = serialize(base);
  }

  /** A writable computed bound to a nested path, with a fallback when absent. */
  function field<T>(path: Path, fallback: T): WritableComputedRef<T> {
    return computed<T>({
      get: () => {
        const v = getAt(parsed.value, path);
        return (v === undefined ? fallback : v) as T;
      },
      set: (val) => mutate((o) => setAt(o, path, val)),
    });
  }

  const has = (path: Path): boolean => getAt(parsed.value, path) !== undefined;
  const remove = (path: Path): void => mutate((o) => deleteAt(o, path));

  /** Read a string[] at a path ([] when absent or wrong type). */
  function stringArray(path: Path): string[] {
    const v = getAt(parsed.value, path);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  }

  function pushTo(path: Path, val: unknown): void {
    mutate((o) => {
      const arr = getAt(o, path);
      if (Array.isArray(arr)) arr.push(val);
      else setAt(o, path, [val]);
    });
  }

  function removeFrom(path: Path, index: number): void {
    mutate((o) => {
      const arr = getAt(o, path);
      if (Array.isArray(arr)) arr.splice(index, 1);
    });
  }

  return { parsed, valid, serialize, mutate, field, has, remove, stringArray, pushTo, removeFrom };
}
