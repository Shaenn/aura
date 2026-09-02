---
id: hooks
title: Hooks
icon: webhook
order: 50
routes: [hooks]
---

Actions Claude Code triggers automatically at a precise moment in a session's lifecycle. A `command` hook is shell: it runs **on your machine, with your rights**, and receives the event as JSON on its standard input.

The screen edits the `hooks` key of `settings.json`, and shows separately — read-only — the hooks your plugins bring.

## The anatomy of a hook

Three nested levels, which have to be told apart to read the screen:

1. **The event** — when it fires. One section per event.
2. **The group** — a _matcher_ and the actions that go with it. An event can carry several.
3. **The action** — what is run. A group can chain several.

The **matcher** filters. Left empty, a tool hook fires on **every** tool. `Edit|Write` restricts it to file writes alone.

## The action types

| Type       | What it runs                                       | Field editable here |
| ---------- | -------------------------------------------------- | ------------------- |
| `command`  | A shell command, receiving the JSON event on stdin | The command         |
| `prompt`   | An evaluation by a model                           | The prompt          |
| `agent`    | A sub-agent                                        | The prompt          |
| `http`     | An outgoing request                                | The URL             |
| `mcp_tool` | A tool from an MCP server                          | —                   |

Every action also carries an optional **timeout**, in seconds.

A type whose main field I do not expose (`mcp_tool`) says so and points to the **JSON** tab in Settings. More broadly: **advanced fields the form does not show — `env`, `args`, `if`… — are preserved as they are** on save. Editing a hook here never strips it of what the screen cannot display.

## The event catalogue

Thirty-three events are offered. The add selector, at the bottom of the page, shows the description of the one selected; every section title carries the same tooltip.

**Session lifecycle** — `SessionStart`, `SessionEnd`, `Setup` (launch in init/maintenance mode).

**Around your messages** — `UserPromptSubmit` (before your prompt is processed), `UserPromptExpansion` (when a typed command expands into a prompt).

**Around tools** — `PreToolUse`, `PostToolUse` (after a **success**), `PostToolUseFailure` (after a failure), `PostToolBatch` (after a batch of parallel calls resolves, before the next model call).

**Permissions** — `PermissionRequest` (a dialog is shown), `PermissionDenied` (denied by the auto-mode classifier).

**Sub-agents and tasks** — `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`.

**End of turn** — `Stop` (Claude has finished answering), `StopFailure` (the turn ended on an API error).

**Context** — `PreCompact`, `PostCompact`, `InstructionsLoaded` (a `CLAUDE.md` or a `.claude/rules/*.md` is loaded).

**Model** — `PreModelSwitch` (before a model change: the hook can allow it, deny it or have it confirmed), `PostModelSwitch` (after).

**Environment** — `ConfigChange`, `CwdChanged`, `DirectoryAdded` (a directory joins the workspace, through `/add-dir`), `FileChanged`, `WorktreeCreate`, `WorktreeRemove`.

**MCP** — `Elicitation` (a server asks for input during a tool call), `ElicitationResult` (after your answer, before it goes back to the server).

**Display** — `Notification`, `MessageDisplay`.

## Plugin hooks

A plugin can provide its own hooks. They live in the plugin's `hooks/hooks.json`, **not in your `settings.json`** — without this section, the screen would look empty while hooks were very much running.

So I show them apart: the plugin name, its state (`on` / `off` according to `enabledPlugins`), the events it covers, and the deduplicated list of the commands it runs. They are **not editable here**: managing them is the plugin's business.

## Turning everything off

The switch at the top stops every hook from running without destroying their configuration. It is the first reflex when a session behaves oddly. _Managed_ hooks escape that cut.

Two implementation details that show up in the diff:

- the underlying key, `disableAllHooks`, is **inverted** with respect to the screen's `Enabled` / `Disabled` labels — the switch spares you that mental translation;
- the “enabled” state is written by **the absence of the key**, not by `false`. The file records only departures.

## Adding, removing

`Add a hook on <event>` creates an empty group with a `command` action. `Group` and `Action` add more inside an existing section.

Removing the last group of an event **also removes the event key**, and if it was the last event, the `hooks` key disappears entirely. No empty object is left behind.

## Saving

Nothing is written as you type. The `unsaved` pill marks the gap, **Preview…** shows the `settings.json` diff, and the write happens only on confirmation. The button stays inactive as long as the underlying JSON is invalid.
