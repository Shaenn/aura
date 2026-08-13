---
id: home
title: Overview
icon: dashboard
order: 20
routes: [home]
---

The control centre, my way in. It reaches every module and shows the current state of the Claude Code environment.

The page is built around a **core**, framed by two arcs of modules.

## The core

Two entry points of equal weight, treated alike because they form a pair:

- **Projects** — to look: your Claude Code projects, their `.claude` resources, and the replay of their sessions;
- **Workshop** — to act: start a session and work with the agent, without a terminal.

These are **actions**, not resources: that is why they are not repeated on the arcs.

## The sessions panel

It lists the Claude Code sessions **running** on this machine, with their status, the first three shown. The dot pulses as soon as something happens. Clicking a row opens its live view; the foot of the panel leads to the full screen, saying how many sessions are not shown.

Those sessions come from the same reading as the status bar — a single timer polls the service for every surface that shows it, rather than one per screen.

## The arcs

On the left, **Resources** — what Claude reuses from one project to the next:

| Module  | What it manages                              |
| ------- | -------------------------------------------- |
| Agents  | Your sub-agents and their prompts            |
| Skills  | The know-how loaded on demand                |
| Plugins | Installed plugins and their marketplaces     |
| Memory  | Standing instructions and per-project memory |
| Hooks   | Automatic actions at key moments             |
| MCP     | The outside tool servers                     |

On the right, **System** — the plumbing:

| Module        | What it manages                                           |
| ------------- | --------------------------------------------------------- |
| Settings      | `settings.json`: permissions, language, effort, interface |
| Backups       | Restore an earlier version of any file                    |
| Usage & costs | Tokens spent, estimated cost, weight of sub-agents        |
| Diagnostic    | Where the money goes, and what to do                      |
| Maintenance   | Storage, cache purge, orphan plans                        |
| Manual        | What you are reading                                      |

## The tile indicators

Every module carries an indicator in the corner of its icon:

- a **counter** — the number of resources found on disk (agents, skills, plugins) or of manual pages. A counter at zero is not an error: the folder exists and is empty;
- a **dot** — the presence of the file the module manages (`settings.json` for Settings and Hooks, `CLAUDE.md` for Memory). It says a file exists, **not** that something is happening in it: only the session indicators point at real activity.

On a narrow screen the arcs straighten into columns: the curve is only a staging of depth, never information.

## The status bar

Present on every screen. On the left, the mark and the breadcrumb. On the right:

- **the local service state** — online / offline. The pill is polled at every navigation;
- **the number of running sessions**, when there are any. Silent otherwise: a counter at zero shown permanently teaches nothing. Its tooltip separates what is **busy** from what is **waiting for an action**;
- **the installed Claude Code version**, and the **managed folder**;
- **help** (`?`), which opens the manual page for the current screen — the label names that page rather than saying “help”;
- **the theme**, light or dark.
