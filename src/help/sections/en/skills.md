---
id: skills
title: Skills
icon: bolt
order: 35
routes: [skills]
---

Your reusable know-how: one **folder** per skill in `~/.claude/skills/`, whose entry point is `SKILL.md`. A skill is a set of instructions Claude loads when the situation calls for it — unlike an agent, it runs **in the current conversation**, with its context.

As with agents, the screen is `read only`: it shows and explains, it does not write. The only write is deletion.

## What the page reads from disk

The service lists the **subfolders** of `skills/` and, for each, tries to read `<folder>/SKILL.md`. A folder without a `SKILL.md` is silently ignored — which is exactly what Claude Code does, and therefore what explains a skill “that doesn't exist” while its files are plainly there.

The name shown comes from the `name` frontmatter key, the folder name otherwise. Careful: **`name` does not change the `/name` command**, which always follows the folder name.

## The expander: the reference files

Each entry in the list carries a chevron. Expanding it shows **the other files in the skill folder** — the ones `SKILL.md` may ask to read. I walk the skill folder and **one level of subfolders**; files nested deeper are not listed. An unreadable subfolder interrupts nothing: the entry point stays readable.

Those files are the heart of _progressive disclosure_: they are **not** injected into the context with the skill. It is the body of `SKILL.md` that says which ones to read, and when. Seeing them here is seeing what the skill has at hand without it costing a single token until it uses them.

Clicking a reference file opens it in the right-hand panel:

- a `.md` is rendered as Markdown, **in full** — no frontmatter card, since only the entry point carries one;
- any other file is shown as a highlighted code block, the highlighting inferred from the extension (`json`, `js`, `ts`, `sh`, `bash`, `yml`, `yaml`, `toml`, `py`).

## Reading the frontmatter card

It works like the agents' one: every key that is set is explained on hover, every absent key is listed under the “N keys not set” expander with the value Claude Code will assume, and any key outside the skills vocabulary carries the `ignored` flag.

The skills vocabulary is in **kebab-case** (`allowed-tools`, `user-invocable`) where the agents' one is camelCase. An agent key slipped into a `SKILL.md` will do nothing.

No key is required in a skill. If `description` is missing, the card says so: **Claude then falls back on the first paragraph of the body** to decide whether to load the skill — which works by accident far more often than by intent.

## What decides the trigger

Three keys, and those only, govern when a skill comes into play.

- **`description`** — what Claude reads to decide. It must state _when_ to use it, not only what the skill does. This is the first cause of a skill that never triggers.
- **`when_to_use`** — extra triggering context: key phrases, example requests. It **adds to** the description; the two share a budget of 1,536 characters.
- **`paths`** — globs restricting activation to matching files. Shown one per line, wildcards highlighted.

Two switches change its reach:

- **`user-invocable`** set to `false` — the skill disappears from the `/` menu; only Claude can load it;
- **`disable-model-invocation`** set to `true` — Claude never triggers it on its own; it has to be asked for.

Both at once make the skill **unreachable**.

## A skill's full vocabulary

| Key                        | Role                                                                                    | Without it                     |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| `name`                     | Displayed name. Does not change the `/name` command.                                    | Folder name                    |
| `description`              | What the skill does and when to use it.                                                 | First paragraph of the body    |
| `when_to_use`              | Extra triggering context.                                                               | The description alone          |
| `argument-hint`            | Shown in autocompletion, e.g. `[issue-number]`.                                         | No hint                        |
| `arguments`                | Named positional arguments, substituted by `$name` in the body.                         | Only `$ARGUMENTS`, `$0`, `$1`… |
| `allowed-tools`            | Tools usable **without asking permission** while the skill is active.                   | Usual permissions              |
| `disallowed-tools`         | Tools removed from the pool during the skill. The restriction ends at the next message. | No tool removed                |
| `user-invocable`           | `false`: hidden from the `/` menu.                                                      | `true`                         |
| `disable-model-invocation` | `true`: never triggered spontaneously.                                                  | `false`                        |
| `model`                    | Model used while the skill is active; the session takes its own back afterwards.        | Session model                  |
| `effort`                   | Reasoning level during the skill.                                                       | Session effort                 |
| `context`                  | `fork`: the skill runs in an isolated sub-agent, its content becoming the prompt.       | Main context                   |
| `agent`                    | Sub-agent used when `context: fork`. No effect otherwise.                               | `general-purpose`              |
| `paths`                    | Globs restricting activation.                                                           | Active everywhere              |
| `shell`                    | Interpreter for the body's inline `` !`cmd` `` commands: `bash` or `powershell`.        | `bash`                         |
| `hooks`                    | Lifecycle hooks active only during this skill.                                          | No hook                        |

For a **lasting** block on a tool, `disallowed-tools` is not enough: it lasts only as long as the skill. Go through the `settings.json` permissions.

## Deleting

Deletion targets the **whole folder**, reference files included — the dialog shows that path, not the `SKILL.md` one. A timestamped copy of the complete folder is taken first, recoverable from **Backups**.
