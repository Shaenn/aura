---
id: settings
title: Settings
icon: tune
order: 60
routes: [settings]
---

The editor for `~/.claude/settings.json`, the file that governs how Claude Code behaves on this machine. Four tabs: **General**, **Permissions**, **Interface & updates**, and **JSON**.

## The form and the JSON are the same file

There is **only one** source of truth: the text of the file, the one the JSON tab shows. The form tabs are only views onto that text — each control shows, next to its label, the **exact key** it drives, so the mapping never has to be guessed.

Practical consequences:

- **a key I do not know stays intact.** The screen rewrites only the key you touched; it never erases what it cannot display;
- **the order of your keys is preserved** — new ones are appended at the end;
- on the other hand, the first change made through a control **renormalises the file's formatting** to two-space indentation. It shows up in the diff: it is the only thing that changes beyond your own edit.

The **Format** button in the JSON tab applies the same normalisation, changing nothing else.

As long as the text is not valid JSON, a banner says so, the forms are greyed out and saving is blocked: it has to be fixed in the JSON tab. The parser's error message is shown there as it is, position included.

## Inherited, yes, no

Many options are **three-position** switches, and that is deliberate: an absent key is not `false`, it means “Claude Code decides”.

- **Inherited** — the key is **removed** from the file. The tooltip recalls Claude Code's default for that key.
- **Yes** / **No** — the key is written explicitly.

This differs from clearing a text field, which writes an empty value into it: a cleared language gives `"language": ""`, not the absence of the key.

## General tab

| Setting           | Key                     | Note                             |
| ----------------- | ----------------------- | -------------------------------- |
| Language          | `language`              | Preferred answer language        |
| Default model     | `model`                 | Empty = automatic selection      |
| Effort level      | `effortLevel`           | `low`, `medium`, `high`, `xhigh` |
| Fast mode         | `fastMode`              | Three positions                  |
| Extended thinking | `alwaysThinkingEnabled` | Three positions                  |
| Editor            | `editorMode`            | `normal` or `vim`                |

## Permissions tab

The **default mode** (`permissions.defaultMode`) decides what triggers a permission request. Six values, described in the selector:

- `default` — asks on the first use of a tool;
- `acceptEdits` — accepts file edits without asking;
- `plan` — read-only;
- `auto` — approval with guardrails;
- `dontAsk` — denies anything an `allow` rule does not authorise;
- `bypassPermissions` — **skips every request**. I show a red banner while that mode is active: keep it for isolated environments, a container or a VM.

Then come four lists of patterns, each with its counter:

- **Allowed** (`permissions.allow`) — e.g. `Bash(npm run *)`;
- **Denied** (`permissions.deny`) — e.g. `Read(.env)`;
- **To confirm** (`permissions.ask`) — e.g. `WebFetch(domain:*)`;
- **Additional folders** (`permissions.additionalDirectories`) — extends the working area beyond the current folder.

In Claude Code, **`deny` wins over `allow`**. An exact duplicate is not added twice: typing a rule that is already there simply clears the field.

## Interface & updates tab

`tui` (`fullscreen` / `inline`), `autoUpdatesChannel` (`stable` / `latest`), and `cleanupPeriodDays` — the number of days before Claude Code cleans up sessions and artefacts.

Then a series of three-position switches, whose “Inherited” tooltip recalls **Claude Code's default** each time: `autoCompactEnabled`, `autoMemoryEnabled`, `fileCheckpointingEnabled` (the `/rewind` snapshots), `spinnerTipsEnabled`, `prefersReducedMotion`, `agentPushNotifEnabled`, `skipAutoPermissionPrompt`, `remoteControlAtStartup`, `includeCoAuthoredBy`.

The **status line**, finally, appears only when it is configured, and **read-only**: its structure is too free for a field. Fine editing goes through the JSON tab.

## Saving

Nothing leaves as you type. The `unsaved` pill marks the gap with the disk, **Preview…** opens the diff, and the write happens only on confirmation — with a backup of the previous version, and a refusal if the file changed in the meantime. **Reload** drops the pending changes and re-reads the disk.

A missing `settings.json` is not an error: the screen starts on `{}` and the first save creates the file.

## Other screens write the same file

`settings.json` is also changed, on their own keys, by the **Hooks** (`hooks`, `disableAllHooks`), **Plugins** (`enabledPlugins`, `extraKnownMarketplaces`), **MCP** (the three `…McpjsonServers` keys and `enableAllProjectMcpServers`) and **Active sessions** (`permissions.allow`, through “Always allow”) modules. All follow the same contract, and the anti-overwrite guard keeps two open screens from stepping on each other.
