import type { MessageSchema } from '../../fr'

const agents: MessageSchema['pages']['agents'] = {
  title: 'Agents',
  subtitle: 'Personal subagents (~/.claude/agents/*.md) — isolated context, restricted tools.',
  empty: "I don't see any personal agent.",
  placeholder: 'Select an agent to show it here.',
  noDescription: "No description: Claude won't know when to delegate to this agent.",
  deleteTitle: 'Delete this agent?',
  deleteNote: 'A timestamped backup is taken before the deletion.',
}

export default agents
