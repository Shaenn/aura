import type { MessageSchema } from '../fr'
import agent from './agent'
import cli from './cli'
import common from './common'
import diagnostics from './diagnostics'
import diff from './diff'
import formats from './formats'
import frontmatter from './frontmatter'
import layout from './layout'
import nav from './nav'
import pages from './pages'
import replay from './replay'
import resources from './resources'
import rules from './rules'
import tools from './tools'

// Annoté, et pas seulement composé : les tranches se contrôlent chacune de leur
// côté, mais rien ne vérifiait l'assemblage. Une tranche ajoutée au français et
// oubliée ici serait passée en silence — c'est cette ligne qui la fait voir.
const en: MessageSchema = {
  agent,
  cli,
  common,
  diagnostics,
  diff,
  formats,
  frontmatter,
  layout,
  nav,
  pages,
  replay,
  resources,
  rules,
  tools,
}

export default en
