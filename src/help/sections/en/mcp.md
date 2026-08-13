---
id: mcp
title: MCP
icon: cable
order: 55
routes: [mcp]
---

The inventory of MCP servers — the connectors that give Claude outside tools: Figma, Gmail, a database, an internal service.

Three different sources feed this screen, and each has its own write regime. That is the key to reading the page.

## 1. Connected · claude.ai

Read from `~/.claude/mcp-needs-auth-cache.json`, the cache Claude Code keeps for servers authenticated through your account. I show their name and their identifier, **nothing more**: their connection is managed in claude.ai and in Claude Code, never here. Cache missing or unreadable ⇒ empty list, no error.

## 2. Configured · file

Read from `~/.claude.json`, and there are **two origins inside that same file**:

- **global** scope — the root `mcpServers` block. These are the only ones I modify.
- **project · `<name>`** scope — the `mcpServers` block of a `projects` entry, that is, the servers a working folder declares. **Read-only.**

Each row states the **transport** — the `type` key if it is set, otherwise inferred: a `command` gives `stdio`, a `url` gives `http` — and the useful detail: the full command with its arguments, or the URL.

### Adding, editing, deleting a global server

The form asks for a name, a transport, then the command and its arguments (one per line) or the URL. When editing, the name is locked — renaming means deleting and creating again.

Two guarantees are worth knowing:

- **Keys the form does not show are preserved.** A server carrying an `env` block, for instance, keeps it intact after an edit: the form starts from the existing configuration and overwrites only what it manages.
- **Changing transport clears the other one.** Switching to `stdio` removes `url`; switching to `http` removes `command` and `args`. No contradictory leftover survives.

## Writing into `~/.claude.json`

That file lives **outside** the `~/.claude` folder and holds far more than your MCP servers. So I go about it with particular care, different from the rest of the application:

1. **The diff is narrowed to the block at hand.** The preview compares the old and the new `mcpServers`, not the thousands of lines of the file — otherwise the change would be invisible.
2. **Only the `mcpServers` key is rewritten.** Every other key is copied across as it is.
3. **Concurrency is guarded by a fingerprint of the whole file.** If `~/.claude.json` changed — even somewhere other than `mcpServers` — between the preview and the confirmation, the write is **refused**. Reload and start again.
4. **The complete file is backed up** before the rewrite, in my own backup tree.

## 3. MCP settings

Those three keys live in `settings.json` and are edited in the last section, under the usual write contract (diff, backup, refusal if the file moved).

- **`enableAllProjectMcpServers`** — `Auto-approved` / `To confirm`. Since “to confirm” is the default behaviour, it is written by **the absence of the key**; only “auto-approved” sets `true`.
- **`enabledMcpjsonServers`** — the list of those approved by name.
- **`disabledMcpjsonServers`** — the list of those refused.

These three keys apply to the servers declared by a **repository `.mcp.json`**, which Claude Code offers to approve when the project opens.

## Diagnosing

- A server absent from the whole screen is **not configured**.
- A server that is present but whose tools never appear in a session **has not finished authenticating**: the session will tell you on the first call.
- A project server you would like to change cannot be changed here: it belongs to the declaration of its working folder.
