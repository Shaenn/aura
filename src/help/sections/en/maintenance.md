---
id: maintenance
title: Maintenance
icon: storage
order: 85
routes: [maintenance]
---

What `~/.claude` takes up on disk, what can be reclaimed, and the plans no project claims any more.

## Storage

One bar per area, with its real weight — the size is recomputed by walking the tree at every load, which explains the short delay on a large folder.

| Area                     | Content                                            |
| ------------------------ | -------------------------------------------------- |
| Conversation transcripts | `projects/` — the full record of all your sessions |
| Edited file history      | `file-history/`                                    |
| Pending telemetry        | `telemetry/`                                       |
| Paste cache              | `paste-cache/`                                     |
| Shell snapshots          | `shell-snapshots/`                                 |
| Generated plans          | `plans/`                                           |
| AURA backups             | `.local/backups` — outside `~/.claude`             |

**A bar's length is relative to the heaviest area**, not to the total: it is there to spot at a glance what weighs, not to read a slice of pie. The figure at the head of the section, on the other hand, is the sum of the listed areas.

The caches and the history grow without end; they almost always explain a folder that has become large.

## Purging

Each area purges independently, and a purge **deletes the whole folder**. Most hold only what can be rebuilt or has already been consumed — history, telemetry, paste cache, shell snapshots.

**`projects/` is the exception.** It purges like the others, but it holds the transcripts of all your conversations: it is the **only copy that exists**. Every replay goes with it, along with the raw material of the **Diagnostic** and of **Usage**, which have no other source. I ask for a stronger confirmation, distinct from the others, and **my backups do not cover this purge**: there is no going back.

Purging `plans/` deletes every plan, including those attached to a project. Purging the **AURA backups** amounts to emptying the **Backups** module.

The service refuses any area absent from this list: the purge is an allowlist, not a free path.

## Before purging

A running Claude Code session may be reading a cache. Purging does not corrupt it, but it can make it fail on a read. The **Active sessions** screen says what is running right now.

## Plans without a project

A plan is attached to the project that produced it **by one path only**: a session in plan mode writes the `planFilePath` field into its transcript, and I use it to link each file in `plans/` to its project. Plans attached that way are read from their project page.

What is left are the ones this sweep did not claim — plans older than that field, or whose transcript has been purged. **This section is the only place they can be read and deleted from**; without it, they would be unreachable.

The list shows the title — the first non-empty line of the file, `#` removed —, the date and the weight. Selecting a plan shows it in full, rendered as Markdown. Deleting, once confirmed, removes the file and is not backed up: `plans/` is not a covered area.

## Claude processes

The other screens read `~/.claude/sessions`: they show the sessions that **declare themselves**. This section asks the system, and shows what **runs** — not the same list.

The gap is not theoretical. A daemon, a pty host and the Chrome extension bridge write no session file: of nine Claude processes recorded one evening, four appeared nowhere. Those are the ones that outlive whatever started them, so exactly the ones you are looking for when something runs and you cannot say why.

| Role          | What it is                                                          |
| ------------- | ------------------------------------------------------------------- |
| AURA          | Me. I am not terminated from here — use the shutdown.               |
| Workshop      | A session I launched: I am its parent process.                      |
| Terminal      | A session opened by hand, in a shell.                               |
| Job           | Work started in the background from a session.                      |
| Pty host      | A job's carrier. It restarts the job if you cut the job alone.      |
| Daemon        | The jobs' host. It **outlives** the session that started it.        |
| Chrome bridge | The link to the extension. Chrome restarts it on its own as needed. |

**Orphan** means whatever started this process is gone. For a daemon the mark is read from the launcher it writes into its own command line, not from its parent: a daemon is re-parented as soon as its session disappears.

## Terminating a process

The cross cuts the process **and its whole descent**, always, top down. This is not overcaution: cutting a job without its pty host sees it reborn within the second, same session under a new number. The confirmation says how many processes will fall.

A force-terminated process does not clean up its file in `~/.claude/sessions`. The other screens are not fooled — they check that the number is still alive — but the file stays on disk until Claude Code rewrites it.

Two refusals, both deliberate: I do not terminate myself, and I only touch Claude processes I have just seen running. A number read from a stale screen no longer designates anything.

## Reload

The button at the top recomputes the sizes, re-reads the list of plans — which requires walking the transcripts — **and** asks for the processes again. The process list does not refresh on its own: it dates from its last load.
