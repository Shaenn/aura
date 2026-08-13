import { t, te } from '@/i18n';

// Read the tools fields of skills (`allowed-tools`) and agents (`tools`), and
// explain each token. The value is a comma-separated list, but a token can carry
// its own parenthesised, comma-containing argument — e.g. `Bash(git status, git
// log)` — so we split on commas only at paren depth 0.

/** Split a tools string into trimmed tokens, respecting parentheses. */
export function parseTools(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      const t = cur.trim();
      if (t) out.push(t);
      cur = '';
    } else {
      cur += ch;
    }
  }
  const last = cur.trim();
  if (last) out.push(last);
  return out;
}

/** The base name of a token, ignoring any (…) argument — `Bash(x)` → `Bash`. */
export function toolBase(token: string): string {
  const i = token.indexOf('(');
  return (i === -1 ? token : token.slice(0, i)).trim();
}

/**
 * Explain any tools token, including the open-ended forms the picker doesn't
 * list: `Bash(git status)`, `mcp__serveur__outil`, `Agent(Explore)`.
 *
 * Les explications vivent dans `src/i18n/<langue>/tools.ts`. La clé est construite depuis
 * le nom de l'outil, qui peut venir d'un plugin : d'où le `te()` avant le `t()`,
 * sans quoi un outil inconnu afficherait sa propre clé.
 */
export function describeToolToken(token: string): string {
  const base = toolBase(token);
  const arg = token
    .slice(base.length)
    .replace(/^\(|\)$/g, '')
    .trim();

  if (base.startsWith('mcp__')) {
    const [, server, tool] = base.split('__');
    return tool
      ? t('tools.mcpTool', { tool, server: server ?? '?' })
      : t('tools.mcpAll', { server: server ?? '?' });
  }
  if (arg && base === 'Bash') return t('tools.bashRestricted', { arg });
  if (arg && base === 'Agent') return t('tools.agentRestricted', { arg });
  if (arg) return t('tools.restricted', { base, arg });

  const key = `tools.info.${base}`;
  return te(key) ? t(key) : t('tools.unknown');
}
