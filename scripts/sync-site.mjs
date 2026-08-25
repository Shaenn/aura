// Copie ce que le site vitrine emprunte au reste du dépôt : le manuel embarqué et les
// médias du README. Rien de tout cela n'est versionné sous `site/` — une page corrigée
// dans `src/help/sections/` est corrigée sur le site au build suivant, sans geste.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const LOCALES = [
  { code: 'fr', help: 'src/help/sections/fr', out: 'site/guide' },
  { code: 'en', help: 'src/help/sections/en', out: 'site/en/guide' },
]

function partial(name) {
  return readFile(join(root, 'site/partials', `${name}.md`), 'utf8')
}

// Le frontmatter du manuel est écrit pour l'application (`id`, `icon`, `order`,
// `routes`). VitePress n'en lit que `title` et ignore le reste : on le laisse tel quel,
// et l'encart se glisse après lui — jamais avant, sous peine de le rendre invisible.
function injectAfterFrontmatter(source, block) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source)
  if (!match) return `${block}\n\n${source}`
  return `${match[0]}\n${block}\n${source.slice(match[0].length)}`
}

async function syncLocale(locale) {
  const from = join(root, locale.help)
  const to = join(root, locale.out)

  await rm(to, { recursive: true, force: true })
  await mkdir(to, { recursive: true })

  const notice = await partial(`manuel-${locale.code}`)
  const videos = await partial(`atelier-videos-${locale.code}`)
  const pages = (await readdir(from)).filter((name) => name.endsWith('.md'))

  for (const name of pages) {
    const source = await readFile(join(from, name), 'utf8')
    let page = injectAfterFrontmatter(source, notice.trim())

    // Les trois démonstrations n'ont pas leur place dans le manuel embarqué — dans
    // l'application, l'Atelier est à un clic. Sur le site, elles sont ce qui montre.
    if (name === 'atelier.md') page = `${page.trimEnd()}\n\n${videos.trim()}\n`

    await writeFile(join(to, name), page)
  }

  return pages.length
}

async function syncMedia() {
  const to = join(root, 'site/public/media')
  await rm(to, { recursive: true, force: true })
  await mkdir(to, { recursive: true })

  await cp(join(root, 'docs/screenshots'), to, { recursive: true })
  await cp(join(root, 'docs/videos'), to, { recursive: true })
  await cp(join(root, 'public/icons/favicon.svg'), join(to, 'favicon.svg'))
}

for (const locale of LOCALES) {
  const count = await syncLocale(locale)
  console.log(`site: ${count} pages de manuel copiées vers ${locale.out}`)
}

await syncMedia()
console.log('site: captures, vidéos et icône copiées vers site/public/media')
