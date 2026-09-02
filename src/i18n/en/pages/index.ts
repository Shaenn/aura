import type { MessageSchema } from '../../fr'
import agents from './agents'
import atelier from './atelier'
import backups from './backups'
import diagnostic from './diagnostic'
import help from './help'
import home from './home'
import hooks from './hooks'
import maintenance from './maintenance'
import mcp from './mcp'
import memory from './memory'
import notFound from './notFound'
import plugins from './plugins'
import project from './project'
import projects from './projects'
import replay from './replay'
import sessions from './sessions'
import settings from './settings'
import skills from './skills'
import usage from './usage'

// Annoté pour la même raison qu'`en/index.ts` : une page ajoutée au français et
// oubliée ici doit casser le typecheck, pas se découvrir à l'écran.
const pages: MessageSchema['pages'] = {
  agents,
  atelier,
  backups,
  diagnostic,
  help,
  home,
  hooks,
  maintenance,
  mcp,
  memory,
  notFound,
  plugins,
  project,
  projects,
  sessions,
  replay,
  settings,
  skills,
  usage,
}

export default pages
