import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// La barre latérale se déduit de la source du manuel, jamais d'une liste tenue à la main :
// une page ajoutée dans `src/help/sections/` apparaît ici au build suivant. `order` est le
// même champ qui classe les pages dans l'application — un seul ordre, une seule vérité.
function manualSidebar(locale: 'fr' | 'en', prefix: string) {
  const dir = join(root, 'src/help/sections', locale)

  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const source = readFileSync(join(dir, name), 'utf8')
      const title = /^title:\s*(.+)$/m.exec(source)?.[1]?.trim() ?? name.replace(/\.md$/, '')
      const order = Number(/^order:\s*(\d+)$/m.exec(source)?.[1] ?? 999)
      return { text: title, link: `${prefix}/${name.replace(/\.md$/, '')}`, order }
    })
    .sort((a, b) => a.order - b.order)
    .map(({ text, link }) => ({ text, link }))
}

const REPO = 'https://github.com/Shaenn/aura'

export default defineConfig({
  // Le site est servi sous le nom du dépôt sur GitHub Pages.
  base: '/aura/',
  title: 'AURA',
  appearance: 'dark',
  cleanUrls: true,
  // `partials/` n'est pas du contenu : ce sont les blocs que `scripts/sync-site.mjs`
  // recopie dans les pages du manuel. Sans cette exclusion, ils deviendraient des pages.
  srcExclude: ['partials/**'],
  lastUpdated: false,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/aura/media/favicon.svg' }]],

  locales: {
    root: {
      label: 'Français',
      lang: 'fr',
      description: 'Le poste de pilotage de votre environnement Claude Code.',
      themeConfig: {
        nav: [
          { text: 'Manuel', link: '/guide/concepts' },
          { text: 'Installer', link: '/#installation' },
        ],
        sidebar: { '/guide/': [{ text: 'Manuel', items: manualSidebar('fr', '/guide') }] },
        outline: { level: [2, 3], label: 'Sur cette page' },
        docFooter: { prev: 'Page précédente', next: 'Page suivante' },
        darkModeSwitchLabel: 'Apparence',
        returnToTopLabel: 'Haut de page',
        langMenuLabel: 'Langue',
        notFound: {
          title: 'Je ne trouve pas cette page.',
          quote: "L'adresse ne correspond à aucune page du site.",
          linkText: "Revenir à l'accueil",
        },
        footer: {
          message: 'Sous licence MIT. Écrit à 100 % par Claude Code, sous direction humaine.',
          copyright: `<a href="${REPO}">github.com/Shaenn/aura</a>`,
        },
      },
    },

    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      description: 'The control desk for your Claude Code environment.',
      themeConfig: {
        nav: [
          { text: 'Manual', link: '/en/guide/concepts' },
          { text: 'Install', link: '/en/#installation' },
        ],
        sidebar: { '/en/guide/': [{ text: 'Manual', items: manualSidebar('en', '/en/guide') }] },
        footer: {
          message: 'MIT licensed. Written 100 % by Claude Code, under human direction.',
          copyright: `<a href="${REPO}">github.com/Shaenn/aura</a>`,
        },
      },
    },
  },

  themeConfig: {
    logo: '/media/favicon.svg',
    // Recherche indexée au build et servie avec le site : aucun service tiers, ce qui est
    // la moindre des choses pour la vitrine d'un outil qui ne fait aucun appel sortant.
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: REPO }],
  },
})
