---
id: projects
title: Projects
icon: folder_open
order: 90
routes: [projects]
---

The inventory of projects Claude Code has already worked on. Each row is a folder under `~/.claude/projects`, whose name encodes the source path.

## Where the columns come from

| Column            | Source                                                         |
| ----------------- | -------------------------------------------------------------- |
| **Project**       | The last segment of the real source path; the slug otherwise   |
| **Path**          | The real working folder path, with Windows separators          |
| **Sessions**      | The number of `.jsonl` files at the root of the folder         |
| **Size**          | The total weight of the transcript folder, sub-agents included |
| **Last activity** | The modification date of the most recent transcript            |

The **real path is not derived from the slug**: the slug replaces every non-alphanumeric character with a dash, which cannot be undone. I recover it by reading the paths declared in `~/.claude.json` and re-encoding them to find a match. A project that file says nothing about therefore shows its raw slug instead of a path — a sign that no match could be established, not that the project is broken.

The badge next to the name means the source folder holds a `.claude` folder — so, resources of its own.

The default sort puts **the last activity first**. Every column sorts, and the filter covers both the name and the path.

## How to read this list

- **Last activity** tells a living project from an abandoned one.
- **Size** says which one weighs, before going to **Maintenance**.
- **The session count** counts transcripts, not distinct conversations in the human sense: a session resumed later stays one file.

Clicking a row — anywhere on it — opens the project detail.

## Orphan projects

A project whose sources were moved or deleted **keeps its transcripts**: they stay listed, readable and replayable. Only its `.claude` resources become unreachable, since they lived in the source tree.
