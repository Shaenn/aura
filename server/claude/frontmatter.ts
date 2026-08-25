// Minimal frontmatter reader for the Markdown resources (agents, skills,
// commands, memories). We only need to surface a few scalar keys (name,
// description, …) for list views — not a full YAML parser. The raw body is
// preserved untouched; AURA never rewrites frontmatter it didn't mean to.

export interface Frontmatter {
  /** The parsed top-level scalar keys (strings only; nested/complex left out). */
  data: Record<string, string>
  /** The raw frontmatter block (without the `---` fences), or '' if none. */
  raw: string
  /** The document body after the frontmatter. */
  body: string
  /** Whether a frontmatter block was present. */
  present: boolean
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Split a Markdown document into its frontmatter (shallow) and body. */
export function parseFrontmatter(text: string): Frontmatter {
  const m = FENCE.exec(text)
  if (!m) return { data: {}, raw: '', body: text, present: false }
  const raw = m[1] ?? ''
  const body = text.slice(m[0].length)
  const data: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue // skip nested/indented keys — shallow read only
    const key = kv[1] as string
    let val = (kv[2] ?? '').trim()
    // Strip matching surrounding quotes.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    data[key] = val
  }
  return { data, raw, body, present: true }
}
