import type { MessageSchema } from '../../fr';

const projects: MessageSchema['pages']['projects'] = {
  title: 'Projects',
  count: '{n} project · from ~/.claude/projects | {n} projects · from ~/.claude/projects',
  all: 'All projects',
  filterPlaceholder: 'Filter by name or path…',
  filterAria: 'Filter the projects',
  hasClaudeDir: 'Has a .claude folder',
  noMatch: 'No project matches your filter.',
  empty: "I don't see any Claude Code project on this machine.",
  loadError: "I couldn't load the projects.",
  columns: {
    name: 'Project',
    path: 'Path',
    sessions: 'Sessions',
    size: 'Size',
    lastActivity: 'Last activity',
  },
};

export default projects;
