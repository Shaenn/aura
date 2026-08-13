// Narrow a tool's `input` — typed `unknown` on the wire, because the transcript
// records whatever the model sent — down to the shapes a view can render.
//
// Every accessor returns a usable default instead of throwing. A tool call from a
// future Claude Code version must degrade to an empty field, never to a blank
// timeline.

export type ToolInput = Record<string, unknown>;

export function asRecord(value: unknown): ToolInput {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ToolInput) : {};
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function bool(value: unknown): boolean {
  return value === true;
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A value a chip can print without lying about it. Objects are not one. */
export type ChipValue = string | number | boolean | null | undefined;

/** Non-empty `{ k, v }` pairs, in the order given — for `ToolChips`. */
export function chips(pairs: [string, ChipValue][]): { k: string; v: string }[] {
  const out: { k: string; v: string }[] = [];
  for (const [k, raw] of pairs) {
    if (raw === undefined || raw === null || raw === false || raw === '') continue;
    out.push({ k, v: String(raw) });
  }
  return out;
}
