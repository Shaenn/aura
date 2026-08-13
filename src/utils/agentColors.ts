// Gives every agent a stable identity color, derived from its name alone.
//
// The name is the only thing we can rely on. Most agents that appear in a
// transcript have no `.md` file to read a `color:` from: `Explore`, `Plan` and
// `general-purpose` are built into Claude Code, plugin agents live outside the
// project, and an agent deleted from `.claude/agents/` still has its whole run
// recorded. Hashing the name keeps all four cases colored — and keeps a given
// agent the same color across sessions, projects, and after its file is gone.
//
// The eight hues match the values Claude Code's frontmatter allows in `color:`,
// so wiring that override in later is a lookup, not a redesign.

/** The eight names Claude Code accepts in an agent's `color:` frontmatter. */
export const AGENT_HUES = [
  'blue',
  'green',
  'yellow',
  'purple',
  'pink',
  'orange',
  'cyan',
  'red',
] as const;

export type AgentHue = (typeof AGENT_HUES)[number];

/**
 * FNV-1a, then murmur3's finalizer.
 *
 * The finalizer is the point. Taking `hash % 8` reads the low three bits, and a
 * plain multiply-add hash barely mixes them: `hash * 31` sends `dev-back` and
 * `dev-front` to the same bucket, which is precisely the pair a reader needs to
 * tell apart. `fmix32` avalanches the high bits down before the modulo.
 *
 * The offset basis is not FNV's standard `0x811c9dc5`: this one distributes a
 * corpus of real agent names evenly across all eight hues, where the standard
 * one leaves some empty and doubles up others.
 *
 * Eight hues cannot separate more than eight agents — collisions are arithmetic,
 * not a bug, which is why every dot ships with the agent's name beside it. The
 * function must never change: it *is* the mapping, and re-tuning it silently
 * repaints every agent in every past transcript.
 */
function hashString(s: string): number {
  let hash = 0xfced3cef;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // murmur3 fmix32
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** The hue an agent name maps to. Same name, same hue, always. */
export function agentHue(name: string): AgentHue {
  return AGENT_HUES[hashString(name) % AGENT_HUES.length] as AgentHue;
}

/**
 * The CSS custom property carrying that hue, ready for a `style` binding.
 * A stroke or a dot — never a text color; see the note in `app.scss`.
 */
export function agentColor(name: string): string {
  return `var(--agent-${agentHue(name)})`;
}

/**
 * La couleur d'un run, depuis son identité telle que le transcript la porte.
 *
 * Le type d'abord — deux runs du même agent se ressemblent parce qu'ils sont le
 * même agent — et l'`agentId` en repli, qui est toujours là quand rien n'a pu
 * nommer le run. La règle tient en une ligne, mais elle doit être *la même* pour
 * la pastille d'une piste et pour le filet de son flux : les écrire deux fois,
 * c'est les laisser diverger le jour où l'une des deux gagne un cas.
 */
export function agentColorOf(run: { agentType?: string; agentId?: string }): string {
  return agentColor(run.agentType ?? run.agentId ?? '');
}
