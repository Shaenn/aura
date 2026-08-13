# Contributing

**English** · [Français](CONTRIBUTING.md)

Technical guide for working on the application. For installing and using it, see the
[README](README.en.md).

By proposing a contribution, you agree to it being published under the project's
[MIT licence](LICENSE). The [code of conduct](CODE_OF_CONDUCT.en.md) applies to issues as much
as to reviews, and [SECURITY.en.md](SECURITY.en.md) says how to report a flaw without exposing
it.

## Stack

- **Front**: Vue 3 + TypeScript + Pinia + Quasar (SPA), `vue-router`.
- **BFF** (Backend-for-Frontend): a **Fastify** server (`server/`), run by `tsx`.
- **Agent**: `@anthropic-ai/claude-agent-sdk` for the Workshop (sessions AURA owns).
- **Transcript rendering**: `markdown-it` + `highlight.js` (+ `mermaid`) for session replay;
  `chart.js` for usage charts, `lottie-web` for animations.
- **Tooling**: ESLint + Prettier, `vite-plugin-checker` (vue-tsc + eslint), `vitest`, `concurrently`.

## Architecture

```
Browser (Quasar SPA)  ──/api/*──►  Fastify BFF (server/)  ──►  ~/.claude  (guarded read / write)
      :9100 (dev)                       :8800                   (the user's local folder)
```

The BFF has two jobs:

1. **Expose a guarded API over `~/.claude`.** The front never touches the disk directly: it calls
   `/api/*`, and the server lists / reads / writes inside the `.claude` folder through a
   **sandboxed** layer (`..` guard, write allowlist, read denylist — `server/claude/paths.ts`,
   `server/claude/fs.ts`). Every write goes through a **propose → apply** flow with a **backup**
   taken first.
2. In **production** it also serves the built SPA from the same process (one deployable). In dev,
   Quasar serves the front on `:9100` and proxies `/api` to `:8800` (`quasar.config.ts` →
   `devServer.proxy`).

So the front only ever calls `/api/...` — same origin, no CORS, no secret on the browser side.

AURA is a **local, single-user** tool: no authentication, no external service. The BFF listens on
`127.0.0.1` only, with no variable to open it up. What that does not close — the browser, after
all, is on the machine — is handled by `server/guard.ts`: `Host` checked against DNS rebinding,
`Sec-Fetch-Site` required on every write. See [SECURITY.en.md](SECURITY.en.md).

## Layout

```
shared/                 wire types, imported as-is by both sides
  transcript.ts         replay model (TranscriptEvent, Block, images)
  context.ts            context-window filling + compactions
  projects.ts           Projects API types
  agent.ts              Workshop protocol
  processes.ts          the live Claude processes (Maintenance)

server/                 Fastify BFF
  index.ts              bootstrap (routes + static serving in prod)
  env.ts                local config (PORT, AURA_CLAUDE_DIR — see README)
  paths.ts              APP_DIR / IS_BUNDLE / BACKUPS_DIR
  guard.ts              who may call /api (Host, Sec-Fetch-Site)
  errors.ts             what an error is allowed to tell the client
  net.ts                where the request came from — guards the orderly shutdown
  claude/               fs.ts (sandboxed I/O + backup), paths.ts (path guard),
                        frontmatter.ts, model.ts
  projects.ts           a project's .claude inventory + resource reads (read-only)
  transcript.ts         parsing .jsonl transcripts → TranscriptEvent / Block
  transcript-cache.ts   never reparses a file whose fingerprint has not moved
  context.ts            rebuilds what filled the window, turn by turn
  usage.ts              token aggregation across the whole corpus (narrow pass, ~1200 files)
  tokens.ts             folds the repeated `usage` counters of one answer
  pricing.ts            cost estimate at API list prices (⚠️ not what you are billed)
  maintenance.ts        storage, purge, live sessions, plans, slug ↔ path mapping
  processes.ts          enumerates and classifies Claude processes, and kills them
                        (⚠️ the only surface that leaves ~/.claude — see server/CLAUDE.md)
  mcp.ts / backups.ts / plugin-hooks.ts   matching inventories
  watch.ts              watches ~/.claude (debounced fs.watch, best-effort)
  diagnostics/          the measure → calibrate → name → decide chain
                        (signals, thresholds, rules, recommend, behaviour, pace, session)
  agent/                Workshop: runner (an owned session, no HTTP), registry (live sessions
                        in memory), queue, pending, ask, activity, folder, slug,
                        files (the working folder's tree, for `@`),
                        shells (background commands: follows the messages, reads the
                        outputs — ⚠️ second surface outside ~/.claude)…
  routes/               claude.ts (list/read/propose/apply/delete + resource index),
                        projects.ts, maintenance.ts, mcp.ts, backups.ts, preferences.ts,
                        usage.ts, diagnostics.ts, events.ts (SSE), agent.ts

src/
  pages/                HomePage, ProjectsPage, ProjectDetailPage, SessionsPage,
                        TranscriptReplayPage, AgentsPage, SkillsPage, PluginsPage, McpPage,
                        MemoryPage, HooksPage, BackupsPage, AtelierPage, UsagePage,
                        DiagnosticPage, MaintenancePage, SettingsPage, HelpPage
  components/           replay/ (TranscriptTimeline, ToolCall, MarkdownView, ContextPanel,
                        TaskPanel, AskUserQuestionView…), agent/ (SessionComposer,
                        PermissionPrompt, AskPrompt…), resources/, settings/, usage/, help/,
                        ui/ (SegmentedControl, FormSection, LabelValueRow, CopyButton,
                        HelpTip, LottieView), ConfirmDiffDialog, RuleTree, PlanTree,
                        CliCommandDialog
  services/             front API clients → they hit /api/*:
                        claude/, projects/, system/, mcp/, backups/, preferences/,
                        usage/, diagnostics/, agent/, events.ts
  stores/               Pinia (system, settings)
  composables/          useBreadcrumbs, useJsonForm, useFrontmatterForm, useHelp,
                        useLiveSession, useAgentTracks, useTranscriptTurns, useChartTokens,
                        useExpandAll
  help/                 sections/*.md — the manual's single source (drawer + /help page)
  utils/                format, slug, markdown, diff, json-edit, tools, ansi, agentColors,
                        resourceFrontmatter, pathMatch (ranking and tree for `@`)
  boot/, router/, layouts/, css/

test/                   vitest, node environment — parsers, aggregates, diagnostics

scripts/                tooling outside the application
  free-ports.mjs        frees 8800/9100: orderly BFF shutdown first, force second
  i18n-scan.mjs         survey of the strings to translate

dev.ps1 / dev.bat       launch + open the browser
stop.ps1 / stop.bat     orderly stop (they delegate to scripts/free-ports.mjs)
```

## Instructions for Claude Code

The `CLAUDE.md` files are split by scope, so a session only loads what concerns it:

- `CLAUDE.md` (root) — identity, architecture, commands, cross-cutting conventions.
- `src/CLAUDE.md` — front rules, design tokens, primitives, the manual.
- `server/CLAUDE.md` — path guard, propose/apply contract, BFF pitfalls.

A subfolder's file is only loaded once Claude touches a file in that folder. Add a rule there
rather than at the root when it concerns one side only.

## Front conventions

The project follows the `frontend-rules/` rules (Quasar / Vue 3) — see `frontend-rules/rules.md`:
`<script setup lang="ts">`, Quasar components (never a raw native element), no hard-coded design
value (use the tokens), accessibility (accessible name + keyboard), canonical async states, form
validation through field rules.

Do not refactor existing non-conforming code without flagging it — point at it and let someone
decide.

### Design system (theme & tokens)

The visual system rests on a **closed vocabulary of CSS tokens** defined in `src/css/app.scss`.
The golden rule: **always a token, never a hard-coded value** — and that holds for colours **as
much as** for sizes, radii, spacing and durations.

**Colours.** Neutral tokens in `:root`; surfaces / text / lines themed (`body--dark` by default,
overrides under `body.body--light`). The theme goes through Quasar's `Dark` plugin, driven by the
`settings` store; `boot/settings.ts` loads the preference from the BFF before the first render —
nothing is kept in the browser, and there is no flash on load.
`--bg` · `--surface` · `--surface-2/3/4` · `--text` · `--muted` · `--dim` · `--faint` · `--line` ·
`--line-2/3` · brand `--brand` (+ `-hover/-soft/-line/-muted`, `--on-brand`) · states `--pulse` /
`--warn` / `--danger`.

The palette's contrast ratios and ΔE values are computed and annotated in `app.scss`, including
for colour-vision deficiencies. Changing a value invalidates that work.

**Scales (theme-agnostic, in `:root`).** Pick the nearest step, never a free value:

| Dimension  | Tokens                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Typography | `--fs-2xs` 10 · `--fs-xs` 11 · `--fs-sm` 12 · `--fs-base` 13 · `--fs-md` 14 · `--fs-lg` 15 (px) |
| Radius     | `--radius-xs` 4 · `--radius-sm` 6 · `--radius-md` 12 (px)                                       |
| Spacing    | `--space-xs` 4 · `--space-sm` 8 · `--space-md` 12 · `--space-lg` 16 · `--space-xl` 24 (px)      |
| Motion     | `--motion-fast` 0.12s · `--motion-base` 0.2s · `--motion-slow` 0.3s                             |

**Primitives.** Utility classes (`.surface-card`, `.status-dot`, `.section-label`, `.font-mono`)
and reusable components in `src/components/ui/`: `SegmentedControl` (segmented "tech" buttons,
dark-aware colours encapsulated), `FormSection` (label + control, stacked with a hint or inline),
`LabelValueRow` (key/value row), `CopyButton`, `HelpTip`, `LottieView`. Reuse these primitives
rather than copying their markup/CSS.

## Quality

```bash
pnpm lint        # ESLint
pnpm format      # Prettier
pnpm typecheck   # tsc over server/ and test/
pnpm test        # vitest
```

`src/` is **not** covered by `pnpm typecheck`: the front is typed by `vue-tsc` through
`vite-plugin-checker`, therefore during `pnpm dev` or `pnpm build`.

`server/` and `test/` have their own `tsconfig.json` (Node, `lib: esnext` without DOM, `.ts`
extensions allowed on import); the root tsconfig excludes them. `exactOptionalPropertyTypes` is on
for `src/` (inherited from Quasar) and off for `server/`: the BFF builds its DTOs from untyped
JSON, where `field: undefined` is the normal way to write "absent".

Tests run in the `node` environment (`test/**/*.test.ts`): they cover the parsers, the aggregates
and the diagnostics. Vue components are not covered by vitest; Playwright is run by hand.

CI (`.github/workflows/ci.yml`) chains those four commands on `windows-latest`. `pnpm build` is
there for the reason above: without it, a type break in `src/` would sail through.

A few tests read the machine's `~/.claude` if it exists and skip themselves otherwise. That is
worth knowing before deliberately failing one of them: a failure prints the paths it read.

## Adding a surface to the BFF

1. `server/routes/<name>.ts`: register the routes under an `/api/<name>` prefix; for any read or
   write of the `.claude` folder, go through `server/claude/fs.ts` (sandboxed I/O + backup) and
   `server/claude/paths.ts` (path guard) — **never** handle raw paths.
2. Register it in `server/index.ts` (`registerXxx`).
3. Every mutation follows the **propose / apply** contract: the server returns the diff, the front
   confirms, then the write happens with a backup **and** a check that the on-disk content still
   matches what the client saw (optimistic concurrency) — see `server/routes/claude.ts` and
   `src/components/ConfirmDiffDialog.vue`.
4. Shapes exchanged with the front live in `shared/`, never duplicated on both sides.
5. On the front side, a service `src/services/<name>/index.ts` (typed `fetch` client, base
   `/api/<name>`) modelled on the existing ones (`claude`, `projects`, `system`).
6. A destructive route names its target: nothing that deletes should be obtainable by omission.
   Purging the backups used to wipe them all on an empty body — the kind of default you only
   discover once.
7. An error handed back to the client goes through `publicMessage` (`server/errors.ts`): AURA's
   message is written to be read, Node's carries the machine's absolute path.

## Technical notes

- The server loads `server/.env` through Node's native `--env-file` (no `dotenv` dependency). A
  full restart is needed to pick up a new variable (`tsx`'s hot reload does not re-read
  `--env-file`).
- The managed folder is overridden by `AURA_CLAUDE_DIR` — handy to work on a copy of the folder
  rather than the real one.
- The port is `8800`, not `8788`: the latter belongs to another local application. The dev server
  fails loudly rather than sliding to the next free port.
- Production static serving switches on **by the presence of the build** (`dist/spa/index.html`),
  not through an inline `NODE_ENV` (incompatible with PowerShell).
- Backups of modified files live in `.local/backups` (restorable from the **Backups** page); the
  `.local/` folder is git-ignored.
- Freshness goes through SSE (`/api/events`, fed by `server/watch.ts`) rather than polling.
  `fs.watch` is best-effort — coalesced events, a watcher dying in silence — so the front keeps a
  slow fallback poll: it is a refresh signal, never the only source of truth.
- The prices in `server/pricing.ts` are **API list rates**. A Pro/Max subscription bills a monthly
  flat fee: the interface must say the figure answers "what this session would have cost through
  the API", not "what you paid".
