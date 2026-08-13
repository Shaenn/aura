---
id: concepts
title: Concepts
icon: hub
order: 10
routes: []
---

AURA is a control desk for `~/.claude`, the local configuration of Claude Code. Every module reads a real file in that folder; **nothing is stored elsewhere**, and nothing is sent anywhere — the service that reaches the disk runs on this machine, with no account, no key, no outgoing call.

What follows holds for every screen. The rest of the manual does not come back to it.

## The managed folder

The watched path is shown at all times in the status bar, top right. It is `~/.claude` by default, and follows the `AURA_CLAUDE_DIR` environment variable when it is set — handy for working on a copy.

The dot to the left of the version shows the state of the local service. Switched off, I can no longer read anything: no screen will be up to date. The version shown is Claude Code's, read back from the file the CLI writes after each update.

## Every write is previewed

The modules that change a file never write it directly. They work in two steps:

1. **Proposal** — I compute the resulting content and show the **line-by-line diff**, with the number of lines added and removed. Nothing is written to disk, and the apply button stays inactive if there is no change.
2. **Confirmation** — on approval, the previous version is backed up, then the file is replaced.

Between the two, I remember the content I showed you. **If the file changed on disk in the meantime, the confirmation is refused** rather than overwriting the concurrent change: a message asks you to reload. That is what makes it safe to have two AURA screens open on `settings.json`, or to work while a Claude Code session is running.

## Every write is backed up

Before each replacement — **a deletion included** — the previous version is copied, timestamped, into a backup folder of my own (`.local/backups`, next to the application, never inside `~/.claude`).

The **Backups** module lists those versions and allows going back. A restore is itself a write: it is therefore previewed, and backs up in turn the version it replaces.

A file created from scratch produces no backup: there was nothing to preserve.

## What I am allowed to write

Deliberately little. Inside `~/.claude`:

- `settings.json` and `CLAUDE.md`;
- the `agents/`, `skills/` and `projects/` folders.

Everything else is **read-only** — `plugins/` in particular, whose installation coordinates several files and belongs to Claude Code. Where an action falls outside that perimeter, I give you the **exact CLI command** to run rather than tinkering with the files.

Outside that folder, two exceptions, each documented on its own screen:

- the `mcpServers` block of `~/.claude.json`, which the **MCP** module changes **without touching the rest of the file**;
- your working folder, where the **Workshop** agent writes — but it is the agent that writes, under your authorisation, one tool call at a time.

A project's `.claude` resources I **never** write: the Project page shows them read-only.

## What I refuse to read

The authentication secret (`.credentials.json`) is never read, exposed, backed up or changed. Also excluded from general browsing are the caches and volatile areas: file history, telemetry, paste cache, shell snapshots, statistics, tasks, jobs, daemon, and the internal state of sessions.

Some of those areas stay visible **through dedicated modules**, with a narrow read and for a precise purpose: **Maintenance** measures their size so they can be purged, **Active sessions** reads the state of running sessions. None of those paths is ever opened by the generic explorer, nor written.

Finally, every path supplied by the interface is normalised and checked: it cannot leave the managed folder, whatever the number of `..`.

## The two kinds of screen

It helps to know, on arriving at a module, which category it falls into:

- **Those that show** — Agents, Skills, a Project page, a replay, the Diagnostic, Usage. They explain what a file declares and what Claude Code will infer from it. Their only possible write is a deletion.
- **Those that change** — Settings, Hooks, MCP, Plugins, Memory. They all follow the contract above: an `unsaved` pill marks the gap with the disk, **Preview…** opens the diff, **Reload** gives up.

Nothing leaves as you type, anywhere.

## The numbers and their status

Wherever I show tokens or dollars, two conventions hold:

- **dollars are API list rates.** A Pro or Max plan bills at a flat fee: the amount says what this usage _would have cost at the API_. A model with no known rate has its tokens counted and its cost excluded, and the screen names it;
- **a `~` marks an estimate.** Token totals read from a transcript are measured; the per-category breakdown of the context window is estimated (≈ 4 characters per token). The two are never reconciled artificially.

## Help, in two places

The `?` button in the status bar opens **the manual page for the current screen**, in a drawer laid over it, without recomposing the page. Navigating with the drawer open changes the manual page underneath it.

The **full Manual** gathers all those pages, with a table of contents and an accent-insensitive full-text search. Every page has a direct address (`/aide?s=<id>`), the one the drawer opens.
