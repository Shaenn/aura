---
id: memory
title: Memory
icon: psychology
order: 45
routes: [memory]
---

What Claude knows about you and your projects from one conversation to the next. **Three different objects** share this screen, and mixing them up is the main source of error.

| Object            | File                               | Loaded when                                    | Editing       |
| ----------------- | ---------------------------------- | ---------------------------------------------- | ------------- |
| Global memory     | `~/.claude/CLAUDE.md`              | At the start of **every** session, any project | Raw text      |
| Project index     | `projects/<slug>/memory/MEMORY.md` | At every session **of that project**           | Raw text      |
| Structured memory | `projects/<slug>/memory/<name>.md` | On demand, when it looks relevant              | Fields + body |

## What the page reads

I walk `projects/`, and for each project I look for a `memory/` subfolder. **A project with no `memory/` folder, or whose folder holds no `.md`, does not appear in the list** — it is not empty, it is absent.

Inside that folder, `MEMORY.md` is handled separately: it is the index, not a memory. Every other `.md` is a structured memory, from whose frontmatter I read the `name` (the file name otherwise), the `description`, and the `type`.

The project names shown are **shortened to be readable**: the real slug encodes the full path (`C--Users-…-devl-aura`) and is cut after a known root marker (`Documents`, `devl`, `repos`…). The exact path stays visible in the breadcrumb tooltip, at the top of the editor.

## The four types

The type is a label of nature, not a filing category. It is stored under `metadata.type`.

- **user** — who you are: role, expertise, lasting preferences.
- **feedback** — guidance on how to work, correction as well as confirmed approach. Must state the **why**.
- **project** — work in progress, a goal or a constraint neither the code nor the git history reveals. Absolute dates.
- **reference** — a pointer to an external resource: URL, dashboard, ticket.

A memory should not repeat what the repository already tells. Memories link to each other with `[[memory-name]]`.

## The editor

The header breadcrumb states the scope then the file; the tooltip gives the real path. The `unsaved` pill appears as soon as the text departs from disk, and **changing selection with pending changes asks for confirmation** before dropping them.

A structured memory is edited on two levels:

- **the fields** — `name`, `description`, and the `type` as clickable pills. They patch the matching frontmatter key **in place**: key order, keys I do not model and the body stay intact. A value that requires it is automatically quoted to stay valid YAML.
- **the body** — the rest of the file, in Markdown.

The global `CLAUDE.md` and a `MEMORY.md` are edited as a whole, frontmatter included if there is one: they are not structured memories.

### Edit / Preview

The selector switches the content between input and rendering. A memory **opens in preview** — it is read far more often than it is changed; a memory you have just created opens in edit mode, on its template.

In preview, **relative links are intercepted**: clicking a line of the index opens the target memory in the editor instead of navigating the browser away. That is what makes `MEMORY.md` usable as a table of contents. A link whose target does not exist says so explicitly. Absolute URLs keep their normal behaviour.

## Creating a memory

The `+` at the head of a project asks for a name. It is **kebab-cased automatically** — accents removed, lowercase, everything else becoming dashes — and serves as the file name. A name already taken is refused.

The file is pre-filled with the expected template: `name`, `description`, `metadata.type` set to `project`, and a body prompt. Nothing is on disk yet: the `new` badge stays until you have previewed, then applied the write.

## The index keeps itself up to date

`MEMORY.md` is the table of contents loaded at every session: **one line per memory, never its content**. I keep it current without you having to open it:

- when a memory is **created**, the line `- [Title](file.md) — hook` is added, the title coming from the `name` field and the hook from `description`;
- when it is **deleted**, the matching line is removed;
- a line already present is **replaced where it is**, not moved to the end of the list, and its neighbours do not shift;
- if the index did not exist, it is created with a `# Memory Index` heading.

Recognition works on the **link target** (`](file.md)`), not on the text: renaming the label by hand breaks nothing. This upkeep is best-effort — if it fails, saving the memory itself did happen.

## Writing and deleting

Every write follows the common contract: **Preview…** shows the diff, **Apply** backs up the previous version then writes, and refuses if the file changed on disk in the meantime.

`Delete` is offered only for a structured memory — neither the global `CLAUDE.md` nor an index can be deleted here. The deleted version is backed up first, and its line leaves the index.
