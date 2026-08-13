---
id: project
title: Project detail
icon: account_tree
order: 92
routes: [project]
---

Everything I know about a project, gathered on one screen. Several stores share it, and they **do not live in the same place** — that is the key to understanding what can be changed and what cannot.

| Block                | Real location                                         | Regime     |
| -------------------- | ----------------------------------------------------- | ---------- |
| `.claude` resources  | `<sources>/.claude/`                                  | Read-only  |
| Project memory       | The `CLAUDE.md` files and their peers, in the sources | Read-only  |
| Repository documents | `README`, `CONTRIBUTING`… at the source root          | Read-only  |
| Included folders     | The source folders you asked to see                   | Read-only  |
| Plans                | `~/.claude/plans/`                                    | Deletable  |
| Sessions             | `~/.claude/projects/<slug>/`                          | Replayable |

The `.claude is read-only` banner at the top is a promise: **I never write into a project's source folder.** Including a folder changes nothing there — it is a display preference, stored on my side.

## The indicators

Four tiles: the number of **`.claude` resources**, the number of recorded sessions, the number of hooks the project declares, and the **weight of `.claude`** — the sum of the sizes of the inventoried resources, not the size of the transcripts.

The first tile and the last speak of the same set, and of it alone: neither the memory, nor the repository documents, nor your included folders enter it, since none of them sits inside `.claude`. The counter at the top of the navigator announces something else: **everything the tree shows**, plans and included folders included.

## The resource navigator

On the left, the inventory; on the right, the content of the selected file. Groups arrive **collapsed**: an established project lines up enough of them that the bottom of the tree would need scrolling, whereas collapsed they all fit on screen and say at a glance what the project carries.

Resources are filed by category, inferred from the **first segment** of their path inside `.claude`:

**Agents**, **Skills**, **Commands**, **Rules**, **Docs**, **Tools**, then **Settings** (`settings.json` / `settings.local.json`), **Memory** (every `CLAUDE.md`), and **Other** for the rest. Only non-empty categories appear.

Two presentation choices are worth pointing out:

- **A skill is presented as a folder** — its `SKILL.md` at the top, its reference files below, and its subfolders collapsible. That is the real “one skill = one folder + its references” shape, not a flat list of files.
- **Rules and docs recover their tree.** The list is rebuilt as a collapsible tree, each folder showing how many files it holds.

For **memory**, the order is deliberately reversed: a level's `CLAUDE.md` is shown **before** the subfolders that override it — the order in which Claude Code stacks them.

Files whose name suggests a secret (`credential`, `.env`, `secret`, `.key`, `.pem`) are **excluded from the inventory**, even for reading.

### The viewer

A `.md` is shown with its **frontmatter card** then its rendered body. The card uses the vocabulary of the category: the agents one for an agent, the skills one for a skill, and for a rule the single `paths`. For other categories, **no vocabulary is assumed**: keys are shown as they are, rather than judged “ignored” in the name of an invented reference.

Any file that is not Markdown is shown as a code block, highlighted from its extension.

A document's raw HTML is **rendered, not displayed**. A hand-written README centres its badges in a `<div align="center">`, folds a section into a `<details>` and comments out a block it is not ready to publish: showing those tags in full made the file unreadable. The HTML is sanitised before display — the layout gets through, nothing executable does. An image on a relative path cannot be served from the sources: I show its alternative text in a dashed frame rather than a broken-image icon.

### Project memory

This sweep leaves `.claude` — that is where I walk the source tree. So it is **bounded three times**: heavy or generated folders are skipped (`node_modules`, `.git`, `dist`, `.venv`, tool caches…), depth is capped at 6 levels, and the walk stops at 4,000 folders. A pathological monorepo gives a partial list, never a page that stops answering. Folder symlinks are not followed.

The **Project memory** group gathers the instruction files agents stack level by level: `CLAUDE.md`, but also `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules` and `.github/copilot-instructions.md`. They are looked for **at any depth**, because that is how they apply: the file closest to the code wins over the one at the root.

A project can carry one of these **without** a `.claude` folder: this block is computed independently.

### Repository documents

The **Repository documents** group shows what a repository publishes: `README`, `CONTRIBUTING`, `CHANGELOG`, `LICENSE`, `SECURITY`, `CODE_OF_CONDUCT`, `ARCHITECTURE` and a few others, with or without an extension. The `README` comes first — it is the front door, and alphabetical order would bury it behind an `ARCHITECTURE.md`. The `.github/` templates close the list.

These are taken **at the root only**. A subfolder's `README.md` does not have the standing of a `CLAUDE.md`: in a monorepo, the list would never end.

### Included folders

A repository often keeps its most useful matter outside `.claude`: a `docs/`, a `specs/`, a folder of reports. **Including a folder** adds it to the tree, with its documents (`.md`, `.markdown`, `.txt`, `.rst`) in depth.

I measure, I do not decide. The picker offers the project's tree with, for each folder, the number of documents it carries — but that number does not say which ones serve you: a folder of templates the program consumes looks exactly like a folder of documentation. That is the one thing I cannot settle for you.

You compose a whole selection there, then apply it in one go. Ticking a folder carries its subtree: its subfolders appear ticked but frozen, since including them separately would make two groups for the same files.

The list is a **preference**, stored with the others in my install folder — nothing is written into your repository. But it has a second role: **I re-read it from disk before every read**, and I only open what it covers. That is what makes a requested path never sufficient on its own. With nothing included, this door opens nothing.

Removing a folder from the tree does not touch the folder itself.

### The plans

Plans are not in the project: they live in `~/.claude/plans`. They are attached to this project because one of its transcripts carries their path (`planFilePath`). So they appear in the navigator but **not** in the resource count nor in the weight of `.claude`.

A plan is the **only thing deletable** from this screen; that deletion is not backed up.

## Hooks

The read-only list of the hooks the project declares — read from its `settings.json` **and** its `settings.local.json`, flattened: the event, the matcher if there is one, and the command. An action without a command (a `prompt`, `http`… hook) shows its type instead. These are the hooks that will add to yours when Claude Code works here.

## Sessions

The table of transcripts, filterable, sortable on every column.

**Session** — the session's real title: the one you typed, or the one Claude Code generated and keeps current. A session never named falls back on **its first message**, and the tooltip says so, so the column does not silently mix two kinds of text. Two possible badges: title set by hand, and presence of sub-agents.

**Turns** — the **human's** turns: neither the echoes of tool results, nor the harness injections. It is the same figure as the one in the Diagnostic module.

**Tokens** — input, output, cache read and cache write added together.

**Cost** — at API list price, as everywhere else in AURA. A `≥` before the amount means a model in that session **has no known rate**: the total is then a floor, not an estimate.

**Duration** — the gap between the first and the last timestamp of the transcript.

Then the **git branch**, the **size** of the file and its **modification** date. On a narrow screen, branch and size are the first columns dropped: they are the ones you find again inside the open session.

A dash `—` in a measurement column is not a zero: it is a session where nothing was measured (never run, or a transcript with no response). When sorting, those rows are grouped at one end rather than mixed with sessions genuinely measured at zero.

Clicking a row opens the session **replay**.
