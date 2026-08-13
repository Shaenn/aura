---
id: atelier
title: Workshop
icon: construction
order: 100
routes: [atelier]
---

Working with the agent **from AURA**, without a terminal. This is the only screen where I start Claude myself: elsewhere I observe sessions the CLI owns, here **I own the session**.

The consequence is the screen's promise: every tool the agent wants to use goes through you, in a banner, with the target path or command in plain sight.

## Opening a session

### What is already running

If sessions are open, they sit at the top of the screen — **across all folders**, with their state and their age. One click goes back into one: nothing is recreated, I reattach to the stream, and its first message hands me the whole state.

This list is the only way back. A session has one address only, its `run` in the URL: close the tab without keeping the link and it would keep running with no way to reach it. The cross stops it, which frees its slot — see the ceiling below.

### The working folder

It is the only required field, and the easiest to get wrong — the agent goes astray when the folder is not the one it thinks. Three ways to name it:

- **the three most recent projects** known to Claude Code, newest first. A project whose real path could not be read back is set aside: offering a folder that does not exist would fail the session on its first tool;
- **Browse…**, which opens the **system** folder picker. The browser cannot provide that service — it gives a handle, never an absolute path — but the local service runs on this machine. The picker opens on the folder already chosen, otherwise on the **parent** of the last project, where projects sit side by side. It can go behind the window, and the screen says so. The button disappears for good if the server's platform cannot open it;
- **the field**, which accepts a pasted path, in forward slashes as well as backslashes.

### Resuming rather than starting over

As soon as a folder is chosen, the **five most recent sessions** for that folder are offered. A folder often carries work already begun, and reopening it empty would mean re-explaining what the previous session already knows.

Resuming happens **in place**: the SDK reloads the history and writes the new turns into the **same** transcript. There is no file to merge, no identifier to reconcile — it is the same session, breathing again. And since its identifier is known in advance, the side panels fill from the moment it opens instead of waiting for the first turn.

Past five, it becomes a directory: the **Project** page already keeps that better.

### Model and permissions

Two rows of chips, set back: their defaults are almost always right, and putting them forward would make you deliberate before opening. Each chip carries one word — an icon for the permission modes — and **the explanation is in its tooltip**.

Both **start from your settings**. The model has a `Settings` chip whose tooltip names the model it applies rather than saying “inherited”, which would force you to go and look elsewhere. The permission mode is **pre-selected from the one in `settings.json`**, and its tooltip says so: a Workshop session has no reason to be more cautious than the rest of your installation.

Four permission modes are offered, **all the ones that keep a human in the loop**:

| Mode        | What reaches the banner                                   |
| ----------- | --------------------------------------------------------- |
| `Ask`       | Everything risky                                          |
| `Automatic` | A classifier settles the ordinary; the ambiguous comes up |
| `Edits`     | File edits go through alone, the rest comes up            |
| `Plan`      | Nothing is run — the agent thinks                         |

`bypassPermissions` and `dontAsk` are **deliberately absent**: they take the human out of the loop, each from one end — the first lets everything through, the second denies everything not pre-authorised, and neither ever shows a banner. The Workshop would be no more than a less convenient terminal. They stay available in `settings.json`, for whoever really wants them.

That is also the only case where the pre-selection departs from your settings: if `permissions.defaultMode` is one of those two modes, the session opens in `Ask`.

### Opening starts nothing

A session opens **empty** and waits. The service creates the runner but **only calls the SDK at the last moment**: on the first message, or on the first `/` or `@` typed — both menus need it to answer. A session opened and never addressed costs nothing.

## The running session

### The bar

The state (`Ready`, `Working`, `Waiting for you`, `Finished`, `Stopped on error`), the **folder's name** — its full path is in the tooltip, an absolute path would fill the bar without telling whoever chose it anything —, the `resumed` badge where applicable, then:

- **the model in use**, read-only. It changes with `/model`, as in the terminal: two controls for one setting would contradict each other on screen the moment either was used. The chip states what the SDK actually uses, and stays muted until the SDK has confirmed it — before the first turn it only announces what is _planned_;
- **the permission mode, changeable mid-session.** One discovers while working that a looser mode would save ten round trips; reopening a session for that would lose the very context that led to the observation. The four modes sit side by side, and the one in effect is visible without opening anything. The change goes through the server, which pushes the updated session back — the screen never asserts a setting that is not in effect;
- **Auto-scroll** and **Follow live**, exactly as on the sessions screen;
- **Full replay**, as soon as the SDK identifier is known (that is, after the first turn);
- **Stop**.

### The activity line

Between the thread and the input, a line says **what is happening this second** — and it is information no transcript carries: `Request in flight`, `Thinking` (with the reasoning tokens rolling by), `Writing`, `Compacting the context`, `Retrying` after an API error, or the names of the tools in flight with their stopwatch.

Without it, a session at work looks like a stuck session: those moments produce no transcript event. The counter runs browser-side from a start instant, which avoids one network frame per second; updates that move a single figure are grouped by quarter of a second, a phase change leaves immediately.

### Allowing a tool

When the agent wants to use a tool the mode does not let through, a card appears **above the input**: it is what blocks the agent, so it is the only thing to do.

It shows **the path or the command first, in full, over as many lines as it takes** — allowing without seeing where you are writing is the only real danger of this screen, and a model sometimes aims at a folder it guessed before correcting itself on the next turn. An expander gives the complete call, as it is.

Three answers:

- **Allow** — this time only;
- **Always allow** — additionally applies the rule **the SDK** proposes to cover exactly this case. It cannot be guessed: the SDK is the one that knows which rule matches;
- **Deny** — the agent is told and carries on differently.

A counter shows how long the request has been waiting, because it **expires**. Without an answer after a quarter of an hour, it is **denied by default** — never the other way round. That deadline does not exist to hurry you: it exists so that a tab closed at the wrong moment does not leave a process suspended forever, invisible and alive.

Answering a request already settled — by another tab, by the deadline — is not an error: the banner simply disappears.

### Answering a question

When the agent puts a multiple-choice question, **a dialog opens**. Each option shows its label, its explanation, and **its mockup** when it carries one — often ASCII, and precisely what one is meant to compare before choosing.

The dialog rather than the footer: a question with three mockups is two screens tall, and asked in the thread it would bury the conversation that led to it — at the very moment one needs to re-read it to answer. **It closes** (cross or `Esc`), leaving only a one-line reminder above the input; the reminder reopens it, and **nothing is lost**: neither the choice already made, nor the step one had reached.

One call can carry up to four questions. They are then presented **one per step**, each header serving as its step title — you move on when the current question has its answer, you go back freely, and submitting sends them all at once. A single question is shown without steps.

Technically, I **take the place** of the CLI's question tool, which needs a terminal interface to work. That detour is not a refinement: without it, the agent does not receive an unanswered question, it receives **“the user did not answer”** — and carries on with its own assumption. The answer is re-injected in the exact form the harness produces, so that **the session replay reads it like any other question**.

### Speaking, interrupting, stopping

The input has focus from the moment it opens. **Interrupt** appears only during a turn — a greyed-out button the rest of the time would take the place of a possible action. A message sent during a turn is queued and handled next.

**Stop** first asks the CLI to exit on its own, and only kills it after five seconds. This is not politeness: by leaving cleanly, it **removes its own session file** — the one the **Active sessions** screen uses to infer that a session is running. A killed process leaves a ghost behind.

### Pasting an image

A screenshot pastes straight into the field, as many as one message needs. The thumbnails sit above the input, in the order they will go — images precede the text in the message sent, so the instruction reads after what it comments on.

This is the one place in AURA where bytes travel in the clear: the clipboard gives no file on disk, only bytes, and nobody but the browser has them. An image over five megabytes is **refused as it is pasted**, before sending: that is the API's limit, and letting it go anyway would reveal the failure after the wait.

Each thumbnail carries its format and its weight. Once the image is sent, its card in the thread adds its **dimensions and its cost in visual tokens** — the dimensions are what make that cost, and a full-page capture often weighs more than a long written instruction.

Claude Code then writes those images into its own transcript: they reappear in **Replay**, like the ones a tool produces.

### `@` to name a file

An at sign opens the working folder's tree, **anywhere in the message and as many times as you like**. The search takes a name, a fragment of a path, or an extension on its own — `ts`, `cs`, `xaml` — and the letters of a name in order beyond three characters.

What it shows is a tree, one folder segment per line, sorted like a file explorer: folders then files, alphabetically. Each folder folds at the chevron or with ← and →, and **can be chosen** like a file — naming `@src/components/` designates a scope of work, which a file does not. The selection lands straight on the best answer, which alphabetical order cannot point to.

What I offer is **bounded to the working folder**, and there is no way to take me out of it: I am not given a path, I start from the session's own. The scope is the repository's — what `.gitignore` sets aside is not offered, no more than the files I would refuse to read elsewhere (`.env`, credentials, keys). A file outside the project can still be named: it is typed by hand, unassisted.

### `/` for commands

A forward slash **at the head of a message** opens the session's commands: Claude Code's own, the project's, yours, and your Skills. The list comes from the CLI itself, the only source that gathers them all, and refreshes if it changes along the way — a Skill discovered in a subfolder, for instance.

They run as they do in the terminal. Two are worth knowing before typing them:

- **`/compact`** summarises the conversation to free up context. The transcript does not change: a boundary is written into it, and the thread shows it.
- **`/clear`** starts over empty. This is not a compaction: Claude Code **opens another transcript**, and will not write another line into the previous one. The thread empties as it does in the terminal, a line announces the break, and the address switches to the new session — that is the one **Replay** will open from now on. What came before is not lost: the old transcript stays on disk, and the **Project** page finds it again.

## The thread: two sources stitched together

This is the subtlest mechanism of the screen, and it explains what you see.

The **SDK stream** arrives token by token, but it is thinner than the file the SDK writes: no hooks, no compactions, no attachments, no slash-command output, no task notifications, no sub-agent turns. Nor does it carry the identifiers the rest of the screen hangs on.

The **transcript on disk** carries all of that — but it is only complete at the end of a turn.

So I show you **the past as the disk holds it, extended by the current turn as the stream gives it**. The seam sits at a human-turn boundary, the only marker common to both sources, and it moves **only between two actions**: moving it mid-turn would put a response still being written on the disk side and make what is being written vanish from the screen.

The file is nevertheless read again **during** the action, every two and a half seconds, so the derived panels — context, tasks, tracks — see the answers coming instead of discovering them in one block. And if the file has not caught up with the live stream by the end of an action, I ask again until it does.

The **sub-agent tracks** exist only on disk: they therefore appear at the end of the turn that started them.

## The right-hand column

Past 1,280 px, a column; below that, the context folds into a drawer in the bar.

**Tasks / Background** — one card for what the session has under way, and one tab per subject that has something to say. A tab does not appear while its subject is empty, and the whole card disappears when both are. The chevron folds it down to its tab bar alone, giving the height back to the context: the counters stay readable there — how far the plan has got, how many commands are still in flight — so you close it without losing what you were watching. Two separate cards left the context only a third of the column, when it is the one of the three carrying a long read.

**Tasks** — the work plan, read from the live stream: every `TaskUpdate` is a tool call the live stream already carries, and waiting for the end of the turn would show progress late.

**Background** — what became of the commands launched in the background. A `pnpm dev:all` leaves the activity line after two seconds — the call has handed back control — and yet holds a port for an hour; nothing on screen said so. The card only appears once the session has launched something: running commands on top, finished ones folded below, and one click unfolds the output, read back in slices from where you left off.

While alive, a line mostly reports **silence**: past fifteen seconds without a written line, I show how long it has been. That is the only sign telling a sentinel waiting patiently from a sentinel whose condition will never come — an `until` loop writes not one byte. Once finished, the exit code is what counts, or the word **stopped** if the command was cut short.

One blind spot remains: a command killed **outside the session** — from Maintenance, or from the system — is announced to me by nobody. Its line stays alive, and its growing silence is what will tell you.

**Context window / Resources** — the context is rebuilt by re-reading the transcript: it therefore exists **only after the first turn**, and the tab says so until then. The project's resource inventory is only requested once its tab is open.

## The address, and what survives

The URL carries two identifiers, and that is not redundancy:

- **`run`** is the live session on the AURA side. It lets you come back into it and continue the conversation — but **it does not survive a restart of the service**: the registry lives in memory, deliberately, because it holds pending promises that do not serialise.
- **`session`** is the SDK identifier, written to disk with the transcript. It survives everything — but it is not fixed: a `/clear` opens another transcript, and the address follows. The previous one stays on disk, under its own identifier.

When an address points at a session that is no longer there, the screen **says so** instead of opening blank as if the link had never pointed at anything — and offers what is left: **Resume** the conversation where it stopped, or open its **Replay**.

A session survives closing the tab: it belongs to the service, not to the page. Two tabs can watch the same work, and what one answers, the other sees.

### Two limits

Each session holds a whole `claude` process. Two limits frame that, and they do different work.

**Six sessions at once.** Beyond that I refuse to open another, and I say so under the button. The refusal lifts with one gesture: closing a session frees its slot at once. That is the limit protecting the machine.

**Thirty minutes with nobody.** A session no tab is watching and that is not working is collected after half an hour without a gesture from you. What is collected is never lost: the transcript is on disk, and **Resume** reopens on it.

An open tab protects it **without reservation**, even in the background, even all night. That is deliberate: cutting the session of someone coming back from another tab would cost more than the held slot — and that slot shows at the top of the screen, where one click frees it. A working session is never collected either, however long its turn.

## Where to find this work again

Workshop sessions write their transcript **in the same format as the CLI**, in the project matching their working folder. So they appear on the **Project** page, replay like the others, and count in **Usage** as well as in the **Diagnostic**.
