---
layout: home

hero:
  name: AURA
  text: Agentic Unified Resource Assistant
  tagline: The control desk for your Claude Code environment. Local, no account, no outgoing call.
  image:
    src: /media/favicon.svg
    alt: ''
  actions:
    - theme: brand
      text: Read the manual
      link: /en/guide/concepts
    - theme: alt
      text: Install
      link: '#installation'
    - theme: alt
      text: GitHub
      link: https://github.com/Shaenn/aura

features:
  - title: The context window, rebuilt
    details: What filled it, in what order, and what a compaction threw away. You finally see where the tokens go.
  - title: Sub-agent tracks
    details: Every sub-agent gets its own tab, and the URL carries it — an address, the one you share to show what an agent did.
  - title: A diagnostic calibrated on your corpus
    details: A threshold is the P90 of your own sessions, never a catalogue value. Actions are ranked by cumulative impact.
  - title: Every write is previewed
    details: The server returns a diff, you confirm, the previous version goes to backup. A concurrent write is refused, never overwritten.
  - title: 100% local
    details: One server on your machine, your ~/.claude folder, nothing else. No telemetry, no API key, no browser-side storage.
  - title: Its own manual
    details: Eighteen pages saying why each screen is built the way it is. They read right here, without installing anything.
---

Claude Code writes a great deal into `~/.claude`, and shows almost none of it.

Your agents, your skills, your hooks, your MCP servers, your permissions live in a handful of
JSON and Markdown files edited blind. Your sessions, for their part, leave behind `.jsonl`
transcripts of several megabytes — the full account of what the model read, thought, attempted
and spent — that nobody ever reads.

**AURA opens that folder.** It is a local web application that inventories your resources,
watches your sessions live, replays the old ones line by line, prices what they cost, and tells
you which ones deserved an action. It runs on your machine, talks to no outside service, and
never changes a file without showing you the diff first.

<figure>
  <img class="shot" src="/media/replay.png" alt="Session replay: the sub-agent tracks, and the context window rebuilt turn by turn">
  <figcaption>Session replay: the sub-agent tracks, and the context window rebuilt turn by turn.</figcaption>
</figure>

<figure>
  <img class="shot" src="/media/diagnostic.png" alt="Diagnostic: actions ranked by cumulative impact">
  <figcaption>The diagnostic: actions ranked by cumulative impact, not by severity.</figcaption>
</figure>

<p style="text-align:center"><sub>The screenshots use an anonymised demonstration dataset. The interface is shown in French; it also runs in English.</sub></p>

## Not another token counter

There are a good half-dozen dashboards that read your transcripts and tell you what Claude Code
costs you. They do it well. AURA overlaps them on that ground, but that is not where it is
decided.

|                                           | Usage counters | Config managers | **AURA** |
| ----------------------------------------- | :------------: | :-------------: | :------: |
| Tokens, costs, charts                     |      yes       |        —        |   yes    |
| Edit agents, skills, hooks, MCP, settings |       —        |       yes       |   yes    |
| Full replay of a session                  |   sometimes    |        —        |   yes    |
| **Context window rebuilt**                |       —        |        —        | **yes**  |
| **Sub-agent tracks kept separate**        |       —        |        —        | **yes**  |
| **Diagnostic calibrated on your corpus**  |       —        |        —        | **yes**  |
| **Diff + backup before every write**      |       —        |    sometimes    | **yes**  |
| Run a session from the interface          |       —        |        —        |   yes    |

The two left-hand columns describe families of tools, not named projects: the comparison stays
true when one of them adds a feature.

## The safety model

AURA modifies files that govern the behaviour of an autonomous agent on your machine. The
contract is therefore explicit, and it holds in four guarantees.

**1. Every write is previewed.** The server computes the resulting content and returns a
line-by-line diff. Nothing is written until you confirm.

**2. Every write is reversible.** The previous version goes, timestamped, into `.local/backups`
— next to the application, never inside `~/.claude`. Deletions included.

**3. A concurrent write is never overwritten.** If the file moved on disk between the proposal
and the confirmation, the confirmation is **refused**.

**4. The write perimeter is an allowlist, deliberately short.** Inside `~/.claude`:
`settings.json`, `CLAUDE.md`, and the `agents/`, `skills/`, `projects/` folders. Everything else
is read-only. Facing it, a read denylist: **`.credentials.json` is never read**, nor exposed,
nor backed up.

The detail is in [Concepts](/en/guide/concepts) — five minutes, and you will know exactly what
AURA allows itself to write, to read, and to refuse.

## Installation

You need **Node.js 24**, **pnpm ≥ 11**, and an existing `~/.claude` folder — so Claude Code
installed and run at least once. Developed and tested on **Windows**, exclusively.

```bash
git clone https://github.com/Shaenn/aura.git aura
cd aura
pnpm install
pnpm dev:all
```

The application opens on `http://127.0.0.1:9100`. To stop it: `Ctrl+C`, or `pnpm stop` from
another window — a Workshop session runs a `claude` process, and that is the only gesture
which, on Windows, triggers an orderly shutdown.

::: warning Keep your transcripts, or AURA has nothing to show
Claude Code prunes on its own any session untouched for 30 days. Before anything else, extend
that retention in `~/.claude/settings.json`:

```json
{ "cleanupPeriodDays": 3650 }
```

:::

## Written 100% by Claude Code

Not a single line of this repository was typed by hand. Everything — the server, the SPA, the
tests, the manual — was written by Claude Code, under human direction: the specification, the
trade-offs, the refusals and the reviews are mine, the code is its.

It is a choice, not a confession. The practical corollary: judge the repository like any other.
If it has a bug, it is a bug.
