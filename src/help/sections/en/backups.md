---
id: backups
title: Backups
icon: restore
order: 65
routes: [backups]
---

The history of the versions I replaced. Every write and every deletion drops the previous version there first — in the application's own `.local/backups` folder, not in `~/.claude`, which stays exactly as Claude Code expects it.

The header gives the totals: versions kept, and weight on disk.

## How a backup is created

Before any write into a writable area, the service copies the existing file to `.local/backups/<timestamp>/<original path>`. The copy **mirrors the tree** of the managed folder, which makes every version identifiable without side metadata.

A file created from scratch produces **no** backup: there was nothing to preserve.

A deletion, on the other hand, copies **recursively** — deleting a skill archives its whole folder, reference files included, under a single timestamp.

## Reading the list

Versions are grouped by original file on the left, with the number of versions kept. On the right, the versions of the selected file, **most recent first**, with their date and weight.

A file absent from this list is one I never replaced. And only writes made **from AURA** are covered: a change made by hand in an editor, or by Claude Code itself, leaves no trace here.

## Restoring

Restoring rewrites nothing behind your back. The chosen version is read again, then **submitted as an ordinary proposal**, with its diff against the current file. So you see exactly what going back will change before it happens — including “no change”, if the file is already in that state.

And like any write, a restore **backs up in turn** the content it replaces. Picking the wrong version is never final: the state before the restore becomes the most recent backup.

A restore obeys the same rules as any other write. It therefore **fails** for a file outside the writable areas: this is the case for the `~/.claude.json` backup taken by the **MCP** module, which does appear in the list but cannot be re-applied from this screen — that file lives outside the managed folder.

## Purging

Two levels, both **without recourse**:

- the bin on a version deletes **the whole snapshot** that contains it. For the archive of a deleted folder, every file in that snapshot goes, not only the row you clicked;
- **Purge all** empties the whole of `.local/backups`, after confirmation.

In both cases the purge touches **the backups only**: the files in `~/.claude` do not move.

## What backups do not cover

- the areas I do not allow myself to write (`plugins/`, the caches, the secrets);
- the `projects/` transcripts purged from the **Maintenance** module — that purge is final;
- anything changed outside AURA.
