import type { MessageSchema } from '../../fr';

const home: MessageSchema['pages']['home'] = {
  kicker: 'AGENTIC UNIFIED RESOURCE ASSISTANT',
  desc: 'I keep your Claude Code environment. Every module reads and writes {path} — I show you every write before applying it.',
  sessionsLabel: 'Running sessions',
  noSession: "I don't see any active session.",
  sessionsMore: '+{n} · live view',
  sessionsAll: 'Live session view',
  groups: { resources: 'Resources', system: 'System' },
  primaries: {
    projectsHint: 'Your Claude Code projects — .claude resources and session replay.',
    projectsCta: 'Open',
    atelierHint: 'Start a session and work with the agent, without a terminal.',
    atelierCta: 'Start',
  },
  hints: {
    agents: 'Personal subagents and their prompts.',
    skills: 'Reusable capabilities triggered on demand.',
    plugins: 'Installed plugins and marketplaces.',
    memory: 'Standing instructions and per-project memories.',
    hooks: 'Automate actions at key moments.',
    mcp: 'MCP servers connected and configured.',
    settings: 'Permissions, plugins, language, effort, interface.',
    backups: 'Restore an earlier version of any file.',
    usage: 'Tokens spent, estimated cost, weight of sub-agents.',
    diagnostic: 'Where the money goes, and what to do.',
    maintenance: 'Storage, cache purge, generated plans.',
    help: 'One page per module, and the shared concepts.',
  },
};

export default home;
