// Binds form controls to a Markdown document's YAML frontmatter, with the file
// *text* as the single source of truth (same round-trip philosophy as
// useJsonForm). Reads parse the frontmatter block; writes patch one scalar key
// and re-assemble, preserving key order, unknown keys, and the body verbatim.
//
// This is a deliberately small frontmatter handler: it edits top-level scalar
// keys (name, description, tools, model…). Complex/nested YAML (e.g. hooks) is
// left untouched in the block and remains editable via the raw body if needed.

import { computed, type Ref, type WritableComputedRef } from 'vue';

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

interface Parsed {
  hasFm: boolean;
  fm: string; // frontmatter body (between the fences)
  body: string; // everything after the closing fence
}

function parse(text: string): Parsed {
  const m = FENCE.exec(text);
  if (!m) return { hasFm: false, fm: '', body: text };
  return { hasFm: true, fm: m[1] ?? '', body: text.slice(m[0].length) };
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Read a top-level scalar key from a frontmatter block. */
function readKey(fm: string, key: string): string | undefined {
  for (const line of fm.split(/\r?\n/)) {
    const m = new RegExp(`^${key}\\s*:\\s*(.*)$`).exec(line);
    if (m) return unquote(m[1] ?? '');
  }
  return undefined;
}

/** True when a YAML scalar must be double-quoted to stay valid. */
function needsQuote(v: string): boolean {
  return (
    v === '' ||
    /^\s|\s$/.test(v) ||
    v.includes(': ') ||
    v.endsWith(':') ||
    v.includes(' #') ||
    v.includes('\n') ||
    /^[!&*[\]{}#|>@`"'%,?-]/.test(v)
  );
}

function serialize(v: string): string {
  return needsQuote(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v;
}

/** Set/replace/remove a top-level scalar key, returning the new frontmatter. */
function setKey(fm: string, key: string, value: string | undefined): string {
  const lines = fm.length ? fm.split(/\r?\n/) : [];
  const idx = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
  if (value === undefined) {
    if (idx >= 0) lines.splice(idx, 1);
  } else {
    const line = `${key}: ${serialize(value)}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  return lines.join('\n');
}

function assemble(fm: string, body: string): string {
  return `---\n${fm}\n---\n${body}`;
}

/** Read a one-level nested scalar (e.g. metadata → type). */
function readNested(fm: string, parent: string, child: string): string | undefined {
  const lines = fm.split(/\r?\n/);
  const pi = lines.findIndex((l) => new RegExp(`^${parent}\\s*:`).test(l));
  if (pi < 0) return undefined;
  for (let i = pi + 1; i < lines.length; i++) {
    if (!/^\s+/.test(lines[i] ?? '')) break; // left the nested block
    const m = new RegExp(`^\\s+${child}\\s*:\\s*(.*)$`).exec(lines[i] ?? '');
    if (m) return unquote(m[1] ?? '');
  }
  return undefined;
}

/** Set/replace/remove a one-level nested scalar, creating the parent if needed. */
function setNested(fm: string, parent: string, child: string, value: string | undefined): string {
  const lines = fm.length ? fm.split(/\r?\n/) : [];
  const pi = lines.findIndex((l) => new RegExp(`^${parent}\\s*:`).test(l));
  if (pi < 0) {
    if (value === undefined) return fm;
    lines.push(`${parent}:`, `  ${child}: ${serialize(value)}`);
    return lines.join('\n');
  }
  let ci = -1;
  for (let i = pi + 1; i < lines.length; i++) {
    if (!/^\s+/.test(lines[i] ?? '')) break;
    if (new RegExp(`^\\s+${child}\\s*:`).test(lines[i] ?? '')) {
      ci = i;
      break;
    }
  }
  if (value === undefined) {
    if (ci >= 0) lines.splice(ci, 1);
  } else if (ci >= 0) {
    lines[ci] = `  ${child}: ${serialize(value)}`;
  } else {
    lines.splice(pi + 1, 0, `  ${child}: ${serialize(value)}`);
  }
  return lines.join('\n');
}

export function useFrontmatterForm(content: Ref<string>) {
  const parsed = computed(() => parse(content.value));
  const hasFrontmatter = computed(() => parsed.value.hasFm);

  /** A writable computed bound to a frontmatter scalar key. */
  function field(key: string, fallback = ''): WritableComputedRef<string> {
    return computed<string>({
      get: () => readKey(parsed.value.fm, key) ?? fallback,
      set: (val) => {
        const p = parsed.value;
        const fm = setKey(p.fm, key, val === '' ? undefined : val);
        content.value = assemble(fm, p.body);
      },
    });
  }

  /** A writable computed bound to a one-level nested key (e.g. metadata.type). */
  function nestedField(parent: string, child: string, fallback = ''): WritableComputedRef<string> {
    return computed<string>({
      get: () => readNested(parsed.value.fm, parent, child) ?? fallback,
      set: (val) => {
        const p = parsed.value;
        const fm = setNested(p.fm, parent, child, val === '' ? undefined : val);
        content.value = assemble(fm, p.body);
      },
    });
  }

  /** The document body (after the frontmatter). */
  const body = computed<string>({
    get: () => parsed.value.body,
    set: (val) => {
      const p = parsed.value;
      content.value = p.hasFm ? assemble(p.fm, val) : val;
    },
  });

  return { hasFrontmatter, field, nestedField, body };
}
