---
id: agents
title: Agents
icon: smart_toy
order: 30
routes: [agents]
---

Your personal sub-agents: one Markdown file per agent, in `~/.claude/agents/`. An agent is a specialised worker Claude delegates a task to — it leaves with its own context, its own tools, and returns only its conclusion.

The screen is a **viewer**, not an editor. The `read only` banner says so: the only write possible here is deletion.

## What the page reads from disk

The local service lists `agents/`, **one level only**, and keeps `.md` files alone. An agent filed in a subfolder therefore does not appear; nor does a `.txt` file. For each one, it reads the frontmatter and extracts two values:

- the **displayed name** — the `name` key if it exists, the file name without its extension otherwise;
- the **description** — shown under the name, truncated to two lines in the list.

A missing `agents/` folder gives an empty list, not an error.

## The colour pill

Every agent carries a coloured pill. Its hue is not decorative and does not come from the file: it is **computed from the name**, by hashing, among the eight hues Claude Code accepts in the `color` key — blue, green, yellow, purple, pink, orange, cyan, red.

Two useful consequences:

- an agent keeps its hue everywhere — here, and in the replay of a session where it appears under the same name (`subagent_type`);
- an agent with **no** file still keeps its hue: `Explore`, `Plan`, `general-purpose` are built into Claude Code, a plugin agent lives elsewhere, and a deleted agent stays recorded in past transcripts.

Eight hues do not separate more than eight agents: collisions are arithmetic. That is why the name is always written next to the pill — colour never carries the information alone.

## The right-hand panel

Selecting an agent shows three things:

1. **The real path** of the file, at the top, and the delete button;
2. **The frontmatter card** — the header decoded, key by key;
3. **The body of the file**, rendered as Markdown. That body is the agent's **system prompt**: it is literally what the agent reads before starting.

## Reading the frontmatter card

The card does three things plain syntax highlighting would not.

**It explains every key.** Hover a key name: its role appears. Tool-typed values become one chip per tool, itself explainable on hover — including the open forms the documentation does not enumerate: `Bash(git status)` reads as “Bash, restricted to the commands…”, `mcp__server__tool` as the tool of an MCP server, `Agent(Explore)` as a restricted delegation.

**It flags what serves no purpose.** A key outside the agents vocabulary carries the `ignored` flag. This is the most frequent trap: the agents vocabulary is **not** the skills one. Agents write `tools`, `disallowedTools`, `permissionMode`, `maxTurns` — in camelCase. `allowed-tools` or `disable-model-invocation` are skill keys: in an agent, they produce nothing.

**It shows what the file leaves unsaid.** The “N keys not set” expander lists every absent key with **the value Claude Code assumes**. That is where the implicit decisions are read: an agent without `tools` inherits every tool from its parent; an agent without `model` runs on the parent's model.

Two keys are **required** and flagged in red when missing: `name` and `description`.

## An agent's full vocabulary

| Key               | Role                                                                                                           | Without it                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `name`            | Unique identifier (lowercase + dashes), passed to hooks as `agent_type`. The file name does not have to match. | **Required**                   |
| `description`     | _When_ to delegate to this agent.                                                                              | **Required**                   |
| `tools`           | Tool allowlist. Accepts MCP patterns and `Agent(worker, researcher)`.                                          | Inherits the parent's tools    |
| `disallowedTools` | Denylist, applied **before** `tools`.                                                                          | No tool denied                 |
| `model`           | `inherit`, `haiku`, `sonnet`, `opus`, `fable`, or a full identifier.                                           | `inherit` — the parent's model |
| `effort`          | `low`, `medium`, `high`, `xhigh`, `max`.                                                                       | Session effort                 |
| `permissionMode`  | How permission requests are handled. A parent in `bypassPermissions` or `acceptEdits` wins.                    | Parent's mode                  |
| `maxTurns`        | Number of cycles before a forced stop.                                                                         | Unlimited                      |
| `isolation`       | `worktree`: the agent works in an isolated git copy, cleaned up if it changed nothing.                         | No isolation                   |
| `memory`          | Persistent memory between conversations: `user`, `project`, `local`.                                           | No persistent memory           |
| `skills`          | Skills injected in full at startup.                                                                            | No preloaded skill             |
| `mcpServers`      | The agent's MCP servers — a shared reference, or an inline definition opened then closed with it.              | No extra server                |
| `hooks`           | Hooks active only during this agent. `Stop` becomes `SubagentStop`.                                            | No hook                        |
| `background`      | `true`: always run in the background.                                                                          | Claude chooses                 |
| `color`           | Display colour in tasks and in the transcript.                                                                 | Default colour                 |
| `initialPrompt`   | Auto-submitted as the first turn when the agent stands in for the main session (`--agent`).                    | No initial prompt              |

`hooks`, `mcpServers` and `permissionMode` are **ignored for agents provided by a plugin**.

Keys whose content is a nested YAML block (`hooks`, an inline `mcpServers`) are shown as they are, without interpretation: I do not model what I cannot describe.

## Why there is no editor

Writing an agent is prompt work, not form work: the `description` decides when the delegation happens, and the body decides what the agent knows how to do. Ask Claude to write it — the `create-agents` skill exists for that. This screen is here to **check** what the file really declares, and what Claude Code will infer from it.

## Deleting

The `Delete` button asks for confirmation and shows the exact path targeted — here, the `.md` file alone. A **timestamped copy is taken before** the deletion and stays available in the **Backups** module. The list then reloads.
