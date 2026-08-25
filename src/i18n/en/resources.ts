import type { MessageSchema } from '../fr'

const resources: MessageSchema['resources'] = {
  panelTitle: 'Project resources',
  reloadAria: 'Reload the project resources',
  copyContent: 'Copy the content',
  noDescription: 'No description in the frontmatter.',
  deleted: 'File deleted.',
  deletedNote: "I've kept a backup of it.",
  categories: {
    agents: 'Agents',
    skills: 'Skills',
    commands: 'Commands',
    rules: 'Rules',
    memory: 'Memory (CLAUDE.md)',
    settings: 'Settings',
    docs: 'Docs',
    tools: 'Tools',
    other: 'Other',
  },
  projectMemory: 'Project memory',
  repoDocs: 'Repository documents',
  outsideClaude: 'outside .claude',
  plans: 'Plans',
  include: {
    action: 'Include a folder',
    title: 'Include a folder',
    intro:
      'I count the documents in each folder of the project. The number does not say which ones serve you — a folder of templates looks just like a folder of documentation.',
    empty: 'I find no folder carrying documents in this project.',
    docs: 'no document | 1 document | {count} documents',
    apply: 'Apply',
    selected: 'no folder selected | 1 folder selected | {count} folders selected',
    toggleAria: 'Include folder {folder}',
    coveredAria: 'Already included by folder {folder}',
    removeAria: 'Remove folder {folder} from the tree',
  },
  noClaudeDir: 'No {dir} folder at this project source (or unknown source path).',
  emptyClaudeDir: '{dir} folder present, but with no indexed resource.',
  errors: {
    list: "I couldn't read this list",
    delete: "I couldn't delete this file",
    read: 'Cannot read this file.',
    unreadable: 'Inventory unreadable.',
  },
}

export default resources
