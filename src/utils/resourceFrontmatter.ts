// Read-only view model for the Markdown resources whose behaviour lives in their
// frontmatter — SKILL.md and agents/<name>.md. Two things are modelled here: the
// frontmatter block split into typed entries, and the documented meaning plus the
// implicit default of every key Claude Code understands. The editor path
// (useFrontmatterForm) patches keys in place; this module never writes — it only
// describes what a file says, and what Claude Code assumes for the keys it omits.
//
// Skills:  https://code.claude.com/docs/en/skills.md ("Frontmatter reference")
// Agents:  https://code.claude.com/docs/en/sub-agents.md ("Supported frontmatter fields")
//
// The two vocabularies are deliberately distinct: skills use `allowed-tools` /
// `disable-model-invocation`, agents use `tools` / `permissionMode`. A key from
// one is not valid in the other, and the cards flag it as ignored.

import { parseTools } from './tools';
import { t } from '@/i18n';

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** How a key's value should be rendered, and how it is read from YAML. */
export type KeyKind = 'text' | 'tools' | 'bool' | 'globs' | 'enum' | 'list' | 'block';

export interface FmEntry {
  key: string;
  /** Scalar value, or the joined list, or '' for a nested block. */
  value: string;
  /** Non-empty only for an explicit YAML list (`- item` or `[a, b]`). */
  list: string[];
  /** Raw indented lines, for nested blocks (hooks) we do not model. */
  raw: string;
}

export interface ParsedDoc {
  present: boolean;
  entries: FmEntry[];
  body: string;
}

function unquote(v: string): string {
  const t = v.trim();
  const quoted = (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"));
  return quoted ? t.slice(1, -1) : t;
}

/**
 * Only a YAML flow sequence (`[a, b]`) is a list at parse time. A comma-bearing
 * scalar stays a scalar: `description` routinely contains commas, and splitting
 * it would shred the sentence. Keys that *are* comma-separated (tools, paths)
 * are split by the consumer via `entryTokens`, which respects `Bash(a, b)`.
 */
function flowList(value: string): string[] {
  if (!(value.startsWith('[') && value.endsWith(']'))) return [];
  return parseTools(value.slice(1, -1)).map(unquote).filter(Boolean);
}

/**
 * The values of a list-ish entry: an explicit YAML list, else the scalar split
 * on commas at paren depth 0 — so `Bash(git status, git log)` stays one token.
 */
export function entryTokens(e: FmEntry): string[] {
  if (e.list.length) return e.list;
  return e.value ? parseTools(e.value) : [];
}

/**
 * Parse a Markdown resource into its frontmatter entries and its body. Top-level
 * keys only: a scalar, a `- item` list, or an indented block kept as raw text.
 */
export function parseDoc(text: string): ParsedDoc {
  const m = FENCE.exec(text);
  if (!m) return { present: false, entries: [], body: text };

  const lines = (m[1] ?? '').split(/\r?\n/);
  const entries: FmEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i] ?? '');
    const key = kv?.[1];
    if (!key) continue;

    const scalar = (kv?.[2] ?? '').trim();
    if (scalar) {
      const value = unquote(scalar);
      const list = flowList(value);
      entries.push({ key, value: list.length ? list.join(', ') : value, list, raw: '' });
      continue;
    }

    // No scalar: gather the indented lines that belong to this key.
    const indented: string[] = [];
    let j = i + 1;
    while (j < lines.length && /^\s+\S/.test(lines[j] ?? '')) {
      indented.push(lines[j] ?? '');
      j++;
    }
    i = j - 1;
    if (!indented.length) continue; // a bare `key:` carries nothing to show

    const bullets = indented.map((l) => /^\s*-\s+(.*)$/.exec(l)?.[1]);
    if (bullets.every((b) => b !== undefined)) {
      const list = bullets.map((b) => unquote((b ?? '').trim())).filter(Boolean);
      entries.push({ key, value: list.join(', '), list, raw: '' });
    } else {
      entries.push({ key, value: '', list: [], raw: indented.join('\n') });
    }
  }

  return { present: true, entries, body: text.slice(m[0].length) };
}

/** Le vocabulaire auquel une clé appartient — voir `src/i18n/<langue>/frontmatter.ts`. */
export type KeyNs = 'skill' | 'agent' | 'rule';

export interface KeySpec {
  key: string;
  kind: KeyKind;
  /**
   * Où lire les mots de cette clé (nom, explication, valeur par défaut).
   *
   * Trois cas, et ils ne disent pas la même chose : un vocabulaire, quand la clé
   * est documentée ; `'unknown'`, quand un vocabulaire s'applique mais ignore
   * cette clé — ce qui mérite d'être signalé ; `null`, quand la ressource n'a
   * pas de vocabulaire du tout, auquel cas se taire est la seule chose honnête.
   */
  ns: KeyNs | 'unknown' | null;
  /** Documented values, for `enum` keys. */
  values?: string[];
  /** The resource is invalid without it — flagged when missing. */
  required?: boolean;
}

/** Rattache tout un vocabulaire à son catalogue, sans l'annoter clé par clé. */
function vocabulary(ns: KeyNs, specs: Omit<KeySpec, 'ns'>[]): KeySpec[] {
  return specs.map((s) => ({ ...s, ns }));
}

const documented = (spec: KeySpec): spec is KeySpec & { ns: KeyNs } =>
  spec.ns !== null && spec.ns !== 'unknown';

/** Le nom d'affichage d'une clé — son propre nom si rien ne la documente. */
export function keyLabel(spec: KeySpec): string {
  return documented(spec) ? t(`frontmatter.${spec.ns}.${spec.key}.label`) : spec.key;
}

/** Ce que la clé fait — rendu en infobulle. Vide quand il n'y a rien à en dire. */
export function keyInfo(spec: KeySpec): string {
  if (documented(spec)) return t(`frontmatter.${spec.ns}.${spec.key}.info`);
  return spec.ns === 'unknown' ? t('frontmatter.unknown') : '';
}

/** Ce que Claude Code suppose quand la clé est absente. */
export function keyFallback(spec: KeySpec): string {
  return documented(spec) ? t(`frontmatter.${spec.ns}.${spec.key}.fallback`) : '';
}

/** The keys Claude Code reads from a SKILL.md, in the order we present them. */
export const SKILL_KEYS: KeySpec[] = vocabulary('skill', [
  {
    key: 'name',
    kind: 'text',
  },
  {
    key: 'description',
    kind: 'text',
  },
  {
    key: 'when_to_use',
    kind: 'text',
  },
  {
    key: 'argument-hint',
    kind: 'text',
  },
  {
    key: 'arguments',
    kind: 'list',
  },
  {
    key: 'allowed-tools',
    kind: 'tools',
  },
  {
    key: 'disallowed-tools',
    kind: 'tools',
  },
  {
    key: 'user-invocable',
    kind: 'bool',
  },
  {
    key: 'disable-model-invocation',
    kind: 'bool',
  },
  {
    key: 'model',
    kind: 'enum',
    values: ['inherit', 'haiku', 'sonnet', 'opus', 'fable'],
  },
  {
    key: 'effort',
    kind: 'enum',
    values: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    key: 'context',
    kind: 'enum',
    values: ['fork'],
  },
  {
    key: 'agent',
    kind: 'enum',
    values: ['Explore', 'Plan', 'general-purpose'],
  },
  {
    key: 'paths',
    kind: 'globs',
  },
  {
    key: 'shell',
    kind: 'enum',
    values: ['bash', 'powershell'],
  },
  {
    key: 'hooks',
    kind: 'block',
  },
]);

/**
 * The keys Claude Code reads from an agents/<name>.md. Note the camelCase —
 * agents use `disallowedTools`, `permissionMode`, `maxTurns`, where skills use
 * kebab-case. `hooks`, `mcpServers` and `permissionMode` are ignored for agents
 * that come from a plugin.
 */
export const AGENT_KEYS: KeySpec[] = vocabulary('agent', [
  {
    key: 'name',
    kind: 'text',
    required: true,
  },
  {
    key: 'description',
    kind: 'text',
    required: true,
  },
  {
    key: 'tools',
    kind: 'tools',
  },
  {
    key: 'disallowedTools',
    kind: 'tools',
  },
  {
    key: 'model',
    kind: 'enum',
    values: ['inherit', 'haiku', 'sonnet', 'opus', 'fable'],
  },
  {
    key: 'effort',
    kind: 'enum',
    values: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    key: 'permissionMode',
    kind: 'enum',
    values: ['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan', 'manual'],
  },
  {
    key: 'maxTurns',
    kind: 'text',
  },
  {
    key: 'isolation',
    kind: 'enum',
    values: ['worktree'],
  },
  {
    key: 'memory',
    kind: 'enum',
    values: ['user', 'project', 'local'],
  },
  {
    key: 'skills',
    kind: 'list',
  },
  {
    key: 'mcpServers',
    kind: 'list',
  },
  {
    key: 'hooks',
    kind: 'block',
  },
  {
    key: 'background',
    kind: 'bool',
  },
  {
    key: 'color',
    kind: 'enum',
    values: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'],
  },
  {
    key: 'initialPrompt',
    kind: 'text',
  },
]);

/**
 * A `rules/*.md` file declares which files it applies to, and nothing else. This
 * is a project convention rather than a Claude Code feature, so the vocabulary
 * stays deliberately thin: it exists to render `paths` as globs, not to judge
 * the rest. Categories with no vocabulary at all get an empty list instead.
 */
export const RULE_KEYS: KeySpec[] = vocabulary('rule', [
  {
    key: 'paths',
    kind: 'globs',
  },
]);

/** The documented spec for a key, or a generic one for keys we don't know. */
export function keySpec(keys: KeySpec[], key: string): KeySpec {
  return (
    keys.find((s) => s.key === key) ?? {
      key,
      kind: 'text',
      ns: 'unknown',
    }
  );
}

/** True when Claude Code documents this key for the given resource type. */
export const isKnownKey = (keys: KeySpec[], key: string): boolean =>
  keys.some((s) => s.key === key);
