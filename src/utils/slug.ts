// Readable project name from an encoded project slug (path with separators
// replaced by "-", e.g. "C--Users-jean-dupont-Documents-devl-aura").
// We can't perfectly recover the original folder (hyphens are ambiguous), so we
// cut after a known workspace-root marker and keep the deepest (shortest) tail.
const ROOT_MARKERS = ['-devl-', '-Desktop-', '-Documents-', '-Downloads-', '-source-', '-repos-', '-Projects-', '-projects-']
export function prettyProjectSlug(s: string): string {
  let best: string | null = null
  for (const m of ROOT_MARKERS) {
    const i = s.lastIndexOf(m)
    if (i < 0) continue
    const cand = s.slice(i + m.length)
    if (cand && (best === null || cand.length < best.length)) best = cand
  }
  return best ?? s
}

// Kebab-case a free-text name for use in a filename (agents/skills/commands).
export function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
