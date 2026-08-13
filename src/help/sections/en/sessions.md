---
id: sessions
title: Active sessions
icon: sensors
order: 94
routes: [sessions]
---

The **live** view of the Claude Code sessions running on this machine: the list on the left, the stream of the chosen session in the middle, and — if the screen is wide enough — its tracking and its context window on the right.

## How I know a session exists

Claude Code writes one state file per session in `~/.claude/sessions`. I read them, but I do not trust them blindly: **the CLI only removes that file when it exits on its own**. A process that was killed, or cut mid-turn, leaves its own behind.

So I ask the operating system about every PID, and I **drop the sessions whose process no longer exists**. Without a PID, I keep the entry: a doubt beats an erasure. An accepted blind spot: Windows reuses PIDs, so a very old file can point at an unrelated process.

The refresh is **not** fast polling: the service watches the folder and **pushes** changes. A slow 30-second net catches merged or lost events, and the case where the pushed stream is unavailable.

## Statuses

- **busy** — the session is working: Claude is producing an answer or running a tool. Green dot, breathing.
- **waiting** — the session is **blocked on you**: a permission is being asked, or a question put. Amber dot, breathing — it is the only state that wants something from you, and leaving it still would be the worst case.
- **idle** — the session is open but waiting for nothing. Steady grey dot.

A `waiting` status that lasts is the useful signal of this screen.

## The list

Sessions are grouped by **project** — one level only, never a tree: the project is the only division that exists on the Claude Code side, and intermediate parent folders would point at nothing you could open. Each group collapses, and shows a dot if something is happening in it plus its session count.

The order of the groups follows the service's order — **active sessions first** — which brings up the working projects at the same time. A filter field appears past five sessions; it covers the project name, its path and the session name.

The displayed name is stripped of its identifier tail: Claude Code names its sessions `<project>-<start of identifier>`, and in a column already filed by project that hexadecimal suffix only pushes the useful name out of frame. A session whose only name is its identifier keeps it.

## The stream

The header gives the session's real title — the transcript's, not the technical handle —, the state (`LIVE`, `PERMISSION`, `idle`), and the project name. **Clicking the project name copies its full path** in Windows presentation, the one you paste into an explorer or a terminal.

The stream itself is the same timeline as the replay: same turns, same tool cards, same milestones. Two settings drive it:

- **Auto-scroll** — sticks the stream to the bottom. It tells the truth: scrolling up to read a message turns it off by itself, coming back down turns it on again. Turning it back on by hand jumps to the bottom immediately. The stick holds while content grows — syntax highlighting, images, a Mermaid diagram all change the height well after the first render.
- **Follow live** — the current turn unfolds its tools and its reasoning, past turns fold theirs. This is independent of scrolling: one may want the detail without chasing the end.

Opening a session always opens **at its end**, even if you had stopped following the previous one.

### Agent tracks

If the session started sub-agents, a track bar appears: the main thread, then one tab per run. Each track has its own stream; the main thread then shows what is left of it once the agents are taken out.

How a track opens follows what it is: a **live** track opens at the bottom, on the continuation you are waiting for; a **finished** track opens at the top, because a run is read from the start.

A session whose main file has disappeared keeps its sub-agent tracks: the main thread is then empty, and the screen says so explicitly rather than showing “no message”.

## The right-hand column

Past 1,280 px wide, a third column appears; below that, the context folds into a drawer — an accepted fallback, not a leftover: the list already takes 300 px, and trimming further would make tool output unreadable.

**Tasks** — the work plan rebuilt from the `TaskCreate` / `TaskUpdate` calls in the transcript. In the stream, each update is an isolated move; here the sequence is put back together. The counter follows **the current plan**, never the session total: a session that carried one plan to its end then opened another would otherwise show a figure mixing two stories. The card is absent if the session keeps no list.

**Context window / Resources** — two readings of the same project in one card, because you look at one _or_ the other. Context opens on the **per-turn view, most recent first**: facing a live stream, the last turn is what you are after. The project's resource inventory, for its part, is only requested once its tab is open.

Unlike the replay, this column does **not** show cost: placing a session within the corpus requires reading everything again, which has no place in a screen you watch continuously. A session's diagnosis is read in the replay.

Any link from the context or the plan jumps to the target turn, **switching back if needed to the track that holds it**.

## What I can, and cannot, do

I **observe** sessions, I do not drive them. Sending a message, or answering the permission request in progress, happens in the terminal that started `claude`. (To work _from_ AURA, that is the **Workshop**, which owns its own sessions.)

When a session is waiting, a banner says so. I show the action being asked for **when it can be identified** — the last tool call left without a result — with its command or its path. A folder-access request, on the other hand, is put before any tool call: it does not appear on the file side, and the banner says so rather than inventing.

### Always allow

The only grip on the future. The button offers a rule **inferred from the pending action** — for a shell command, the first two words before the first option, for example `Bash(npm test:*)` — which you can correct before going further.

The rule is added to `permissions.allow` in `settings.json`, starting again from the content on disk so the diff stays minimal. A rule already present is refused rather than duplicated. The write follows the usual contract: diff previewed, then applied.

**This does not unblock the request on screen** — it is still waiting for your answer in the terminal. It is the next ones that will go through without a question.

## Afterwards

A finished session leaves this list. You find it again in its project, where its **replay** stays readable — the same timeline, without the live part.
