import type { MessageSchema } from '../fr';

const tools: MessageSchema['tools'] = {
  info: {
    // Read-only
    Read: 'Read a file’s contents (text, image, PDF, notebook).',
    Grep: 'Search file contents for a pattern (regex).',
    Glob: 'Find files by path pattern, e.g. `src/**/*.ts`.',
    WebFetch: 'Fetch a URL and parse its contents.',
    WebSearch: 'Query a web search engine.',
    NotebookRead: 'Read the cells and outputs of a Jupyter notebook.',
    BashOutput: 'Read back the output of a command running in the background.',
    LSP: 'Query the language server: definitions, references, diagnostics.',
    // Write / execute
    Edit: 'Replace an exact stretch of text in an existing file.',
    Write: 'Create a file, or overwrite its contents entirely.',
    Bash: 'Run POSIX shell commands.',
    PowerShell: 'Run PowerShell commands (Windows).',
    NotebookEdit: 'Edit, insert or delete notebook cells.',
    TodoWrite: 'Keep the session’s task list up to date.',
    SlashCommand: 'Trigger an existing slash command.',
    KillShell: 'Stop a shell running in the background.',
    // Delegation
    Agent: 'Start a subagent, with its own context and its own tools.',
    Skill: 'Load a skill and follow its instructions.',
  },
  mcpTool: 'The “{tool}” tool from the “{server}” MCP server.',
  mcpAll: 'Every tool from the “{server}” MCP server.',
  bashRestricted: 'Bash, restricted to these commands: {arg}.',
  agentRestricted: 'Delegation restricted to the “{arg}” subagent.',
  restricted: '{base}, restricted to: {arg}.',
  unknown: 'A tool outside the built-in set.',
};

export default tools;
