---
id: plugins
title: Plugins
icon: extension
order: 40
routes: [plugins]
---

The installed plugins and the marketplaces they come from. A plugin brings in a batch of resources at once: skills, agents, hooks, MCP servers.

The screen reads two sources and writes only one:

- it **reads** `plugins/installed_plugins.json` and `plugins/known_marketplaces.json`, the inventory Claude Code keeps;
- it **writes** `settings.json` only — the declarative `enabledPlugins` and `extraKnownMarketplaces` keys.

The `plugins/` folder itself I **never** write: it is managed by the CLI, which clones repositories and resolves dependencies in it.

## Marketplaces

A marketplace is a catalogue of plugins. The list merges two views, which explains the three badges:

- **built-in** — the marketplace is in the Claude Code registry, with no declaration from you. The badge states an **origin**, not a protection: it removes like the others.
- **added** — it is both in the registry _and_ declared in your `settings.json` (`extraKnownMarketplaces`). This is the normal state of a marketplace you added yourself.
- **pending** — it is declared in `settings.json` but **absent from the registry**: Claude Code has not materialised it yet. Nothing has been cloned.

Under the name are the source type and its location, as the registry records them (`github`, a local path, a repository URL…).

### Adding

The field accepts the three forms the CLI understands: `owner/repo`, an `https://…/repo.git` URL, or a local path. Submitting **writes nothing**: I give you the exact command to run in Claude Code —

```
/plugin marketplace add <source>
```

— with a copy button. Claude Code is the one that will clone or copy the marketplace.

So there is no “install a plugin” action on this screen: you add the marketplace, then install **from Claude Code**.

### Removing

The behaviour depends on the badge, and that is deliberate:

- a **pending** marketplace exists only as a declaration in `settings.json`: removing it from there is complete and correct. The removal is therefore immediate and local to the screen, to be confirmed by the diff like any other write.
- a **real** marketplace requires the `/plugin marketplace remove <name>` command, because it also uninstalls the plugins that come from it and deletes the local clone. If it was declared in your `settings.json` as well, a **Remove from the config too** button does the half that is yours.

## Installed plugins

Each row carries the full `name@marketplace` identifier, its version and its scope, as the registry declares them.

### Enabling, disabling

The selector writes into `settings.json`. The detail matters: a plugin is **on by default**, so

- `Off` writes `enabledPlugins["name@marketplace"] = false`;
- `On` **deletes the key** instead of writing `true` — and if it was the last one, the now-empty `enabledPlugins` object goes with it.

The file records only your departures from the default behaviour. Disabling uninstalls nothing: the files stay in `plugins/`, and turning it back on is immediate.

### Uninstalling

The bin opens the `/plugin uninstall <name@marketplace>` command: uninstalling removes the plugin **and** clears its cache, which is Claude Code's business.

## Saving

Enable/disable changes do not leave as you make them. They pile up in the screen — the `unsaved` pill says so — and **Preview…** opens the `settings.json` diff before writing. `Reload` drops what has not been applied and re-reads the file.

## Worth knowing

A plugin can provide its own **hooks**. They do not appear in your `settings.json`: the **Hooks** module shows them separately, read-only, with the on/off state of the plugin that carries them.
