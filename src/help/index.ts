// The help registry. Every `sections/<locale>/*.md` is bundled at build time (no
// BFF call: the manual ships with the app, it does not live in ~/.claude), parsed
// with the same frontmatter reader as skills and agents, and indexed by route
// name so the drawer can answer "what documents the screen I am on?".
//
// Adding a page: drop a `sections/fr/<id>.md` with the frontmatter below, then
// its `sections/en/<id>.md`. Nothing else to register.
//
//     ---
//     id: hooks
//     title: Hooks
//     icon: webhook
//     order: 100
//     routes: [hooks]
//     ---
//
// La langue sort du chemin, et les fonctions la lisent elles-mêmes plutôt que de
// la recevoir : `currentLocale()` s'appuie sur la locale de vue-i18n, qui est
// réactive, si bien qu'un `computed` qui appelle `searchSections` se recalcule
// tout seul à la bascule. C'est le même parti pris que `src/utils/format.ts`.
//
// Une page non traduite retombe sur le français plutôt que de disparaître : le
// manuel reste complet pendant qu'on le traduit, et un trou se voit à la langue
// de la page, pas à son absence.

import { currentLocale, DEFAULT_LOCALE, isLocale, type AppLocale } from '@/i18n'
import { parseDoc, entryTokens, type FmEntry } from '@/utils/resourceFrontmatter'
import type { HelpSection } from './types'

const files = import.meta.glob<string>('./sections/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * Lowercase and drop the combining marks left by NFD, so "mémoire" is found by
 * typing "memoire". `\p{M}` is every Unicode mark — after normalize('NFD') that
 * is exactly the accents split off from their base letter.
 */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function scalar(entries: FmEntry[], key: string): string {
  return entries.find((e) => e.key === key)?.value ?? ''
}

function toSection(path: string, raw: string): HelpSection {
  const { entries, body } = parseDoc(raw)
  const fallbackId = path.replace(/^.*\//, '').replace(/\.md$/, '')
  const routesEntry = entries.find((e) => e.key === 'routes')

  const title = scalar(entries, 'title') || fallbackId
  return {
    id: scalar(entries, 'id') || fallbackId,
    title,
    icon: scalar(entries, 'icon') || 'article',
    order: Number(scalar(entries, 'order')) || 999,
    routes: routesEntry ? entryTokens(routesEntry) : [],
    body: body.trim(),
    haystack: fold(`${title}\n${body}`),
  }
}

/** `./sections/en/hooks.md` → `en`. */
function localeOf(path: string): AppLocale {
  const seg = path.split('/')[2] ?? ''
  return isLocale(seg) ? seg : DEFAULT_LOCALE
}

const byLocale = new Map<AppLocale, HelpSection[]>()
for (const [path, raw] of Object.entries(files)) {
  const l = localeOf(path)
  const list = byLocale.get(l) ?? []
  list.push(toSection(path, raw))
  byLocale.set(l, list)
}
for (const list of byLocale.values()) list.sort((a, b) => a.order - b.order)

/**
 * Les pages du manuel dans la langue courante, complétées par le français.
 *
 * Le repli se fait page par page, pas en bloc : une seule page manquante ne fait
 * pas retomber tout le manuel.
 */
export function helpSections(): HelpSection[] {
  const base = byLocale.get(DEFAULT_LOCALE) ?? []
  const locale = currentLocale()
  if (locale === DEFAULT_LOCALE) return base

  const translated = new Map((byLocale.get(locale) ?? []).map((s) => [s.id, s]))
  return base.map((s) => translated.get(s.id) ?? s)
}

/** Route name → section id. A section may document several routes. */
const byRoute = new Map<string, string>()
for (const s of byLocale.get(DEFAULT_LOCALE) ?? []) {
  for (const r of s.routes) byRoute.set(r, s.id)
}

export function findSection(id: string | null | undefined): HelpSection | undefined {
  return id ? helpSections().find((s) => s.id === id) : undefined
}

/** The section documenting a route, if any — the drawer's default content. */
export function sectionForRoute(routeName: unknown): HelpSection | undefined {
  return typeof routeName === 'string' ? findSection(byRoute.get(routeName)) : undefined
}

/** Sections matching a free-text query, in manual order. Blank query → all. */
export function searchSections(query: string): HelpSection[] {
  const sections = helpSections()
  const q = fold(query.trim())
  if (!q) return sections
  const terms = q.split(/\s+/)
  return sections.filter((s) => terms.every((t) => s.haystack.includes(t)))
}
