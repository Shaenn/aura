import type { MessageSchema } from '../fr'

const frontmatter: MessageSchema['frontmatter'] = {
  unknown: "A key Claude Code doesn't document for this resource type: it will be ignored.",
  ignored: 'ignored',
  undefinedKeys: '{n} key not set | {n} keys not set',
  defaultsNote: '— values applied by default',
  requiredCount: '{n} required | {n} required',
  skill: {
    name: {
      label: 'Name',
      info: "The skill's display name. It does not change the /name command, which follows the folder name.",
      fallback: 'folder name',
    },
    description: {
      label: 'Description',
      info: 'What the skill does and when to use it. Claude reads it to decide whether to trigger the skill. 1,536 characters in total with when_to_use.',
      fallback: 'first paragraph of the body',
    },
    when_to_use: {
      label: 'When to use it',
      info: 'Extra triggering context: key phrases, example requests. Adds to the description.',
      fallback: 'the description alone',
    },
    'argument-hint': {
      label: 'Argument hint',
      info: 'Shown in autocomplete to indicate the expected arguments, e.g. [issue-number].',
      fallback: 'no hint',
    },
    arguments: {
      label: 'Named arguments',
      info: "Named positional arguments, substituted as $name in the skill's body.",
      fallback: 'only $ARGUMENTS, $0, $1…',
    },
    'allowed-tools': {
      label: 'Allowed tools',
      info: 'Tools usable without asking for permission while the skill is active.',
      fallback: 'usual permissions',
    },
    'disallowed-tools': {
      label: 'Withdrawn tools',
      info: 'Tools removed from the pool during the skill. The restriction lifts at the next message: for a lasting block, use the permissions in settings.json.',
      fallback: 'no tool withdrawn',
    },
    'user-invocable': {
      label: 'User-invocable',
      info: 'At false, the skill is hidden from the / menu: only Claude can load it.',
      fallback: 'true',
    },
    'disable-model-invocation': {
      label: 'Auto-invocation disabled',
      info: 'At true, Claude never triggers the skill on its own: an explicit request is required.',
      fallback: 'false',
    },
    model: {
      label: 'Model',
      info: 'The model used while the skill is active; the session takes its own back at the next prompt.',
      fallback: 'session model',
    },
    effort: {
      label: 'Effort',
      info: 'Reasoning level during the skill.',
      fallback: 'session effort',
    },
    context: {
      label: 'Context',
      info: 'At fork, the skill runs in an isolated subagent: its contents become the prompt.',
      fallback: 'main context',
    },
    agent: {
      label: 'Subagent type',
      info: 'The subagent used when context is fork. No effect otherwise.',
      fallback: 'general-purpose',
    },
    paths: {
      label: 'Paths',
      info: 'Globs that restrict activation: Claude only loads the skill for matching files.',
      fallback: 'active everywhere',
    },
    shell: {
      label: 'Shell',
      info: "Interpreter for the inline commands (!`cmd`) in the skill's body.",
      fallback: 'bash',
    },
    hooks: {
      label: 'Hooks',
      info: 'Lifecycle hooks active only during this skill.',
      fallback: 'no hook',
    },
  },
  agent: {
    name: {
      label: 'Name',
      info: "The agent's unique identifier (lowercase + hyphens), passed to hooks as agent_type. The file name does not have to match.",
      fallback: 'required field',
    },
    description: {
      label: 'Description',
      info: 'When to delegate to this agent. Claude reads it to decide whether a task fits; “use proactively” encourages automatic delegation.',
      fallback: 'required field',
    },
    tools: {
      label: 'Tools',
      info: "The agent's tool allowlist. Accepts MCP patterns (mcp__server__*) and Agent(worker, researcher) to restrict the agents it may start.",
      fallback: "inherits the parent's tools",
    },
    disallowedTools: {
      label: 'Denied tools',
      info: 'A denylist, applied before `tools`. Handy to drop a few inherited tools without listing them all.',
      fallback: 'no tool denied',
    },
    model: {
      label: 'Model',
      info: "The agent's model. A full ID (claude-opus-4-8) is also accepted.",
      fallback: "inherit — the parent's model",
    },
    effort: {
      label: 'Effort',
      info: "The agent's reasoning level. Overrides the session's.",
      fallback: 'session effort',
    },
    permissionMode: {
      label: 'Permission mode',
      info: 'How permission requests are handled. A parent in bypassPermissions or acceptEdits wins and cannot be overridden. Ignored for plugin agents.',
      fallback: 'parent mode',
    },
    maxTurns: {
      label: 'Maximum turns',
      info: 'How many cycles the agent may run before stopping.',
      fallback: 'unlimited',
    },
    isolation: {
      label: 'Isolation',
      info: 'At worktree, the agent works in an isolated git copy, branched from the default branch. The worktree is cleaned up if it changed nothing.',
      fallback: 'no isolation',
    },
    memory: {
      label: 'Memory',
      info: 'Memory persisted across conversations: user (~/.claude/agent-memory), project (versionable), local (outside version control).',
      fallback: 'no persistent memory',
    },
    skills: {
      label: 'Preloaded skills',
      info: 'Skills injected into the context in full at startup. A skill with disable-model-invocation cannot be preloaded.',
      fallback: 'no preloaded skill',
    },
    mcpServers: {
      label: 'MCP servers',
      info: "MCP servers available to the agent: a reference shares the parent's connection, an inline definition is opened then closed with the agent. Ignored for plugin agents.",
      fallback: 'no extra server',
    },
    hooks: {
      label: 'Hooks',
      info: 'Hooks active only during this agent. Stop becomes SubagentStop at runtime. Ignored for plugin agents.',
      fallback: 'no hook',
    },
    background: {
      label: 'Forced background',
      info: 'At true, the agent always runs in the background, even when Claude is waiting on its result.',
      fallback: 'Claude decides',
    },
    color: {
      label: 'Colour',
      info: 'Display colour in the task list and the transcript.',
      fallback: 'default colour',
    },
    initialPrompt: {
      label: 'Initial prompt',
      info: "Auto-submitted as the first turn when the agent stands in for the main session (--agent). Prepended to the user's prompt.",
      fallback: 'no initial prompt',
    },
  },
  rule: {
    paths: {
      label: 'Paths',
      info: 'File patterns this rule applies to.',
      fallback: 'no path declared',
    },
  },
}

export default frontmatter
