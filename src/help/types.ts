// A help section is one manual page: one Markdown file under `sections/`, whose
// frontmatter declares where it belongs (order, icon) and which application
// routes it documents. The same section feeds both surfaces — the contextual
// drawer, which shows the one matching the current route, and the manual page,
// which shows them all.

export interface HelpSection {
  /** Stable slug: the `?s=` deep-link target and the `man aura-<id>` command name. */
  id: string
  title: string
  /** Material icon, mirrored in the manual's table of contents. */
  icon: string
  /** Position in the manual; the table of contents and scroll-spy follow it. */
  order: number
  /** Route names this section documents. Empty for cross-cutting sections. */
  routes: string[]
  /** Markdown body, frontmatter stripped. */
  body: string
  /** Folded title + body, for the manual's search box. */
  haystack: string
}
