import type { MessageSchema } from '../fr'

// Noms d'écrans traduits selon la table de `docs/voice.md` : Atelier → Workshop,
// Rejeu → Replay. Casse de phrase, jamais de capitale de titre.
const nav: MessageSchema['nav'] = {
  home: 'Overview',
  projects: 'Projects',
  project: 'Project',
  session: 'Session',
  settings: 'Settings',
  agents: 'Agents',
  skills: 'Skills',
  plugins: 'Plugins',
  memory: 'Memory',
  backups: 'Backups',
  hooks: 'Hooks',
  mcp: 'MCP',
  maintenance: 'Maintenance',
  sessions: 'Active sessions',
  atelier: 'Workshop',
  usage: 'Usage & costs',
  diagnostic: 'Diagnostic',
  help: 'Manual',
}

export default nav
