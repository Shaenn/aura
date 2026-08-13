---
id: replay
title: Session replay
icon: play_circle
order: 96
routes: [session]
---

The full re-reading of a Claude Code session, rebuilt from its transcript. This screen is an **observer**: it does not resume the conversation and changes nothing.

Two columns: the conversation on the left, what it cost and filled on the right.

## The header

The session title — the one it carries, or its first message otherwise. The `named` badge tells a title **typed by you** from a generated one. Below: the git branch, the models used, the start date, and a mention of sub-agents if there are any.

Six indicators, each with its tooltip:

| Indicator | What it counts                                 |
| --------- | ---------------------------------------------- |
| Turns     | Your messages **/** Claude's responses         |
| Tools     | The total of tool calls over the session       |
| Tokens ↓  | The context sent to the model, cache excluded  |
| Tokens ↑  | The generated text                             |
| Cache     | The tokens read back from the context cache    |
| Duration  | The gap between the first and the last message |

## The tracks

If the session started sub-agents, a track bar sits above the stream: the main thread, then one tab per run. That split is not cosmetic — **a two-hundred-turn run inserted where it was called drowns the main thread's work**, and a session being replayed is precisely the one you read end to end without having lived the live version.

The main thread then shows what is left of it once the agents are taken out, and **the `Agent` call card** becomes the place where what the sub-agent did is read, with a link to its track.

The track is written into the URL: it is an address, the one you share to show what an agent did. An unknown track falls back on the main thread rather than opening an empty stream.

The bar follows scrolling as one piece: changing track in the middle of a three-hundred-turn session does not require going back up.

## The timeline

Turns follow one another in order. Each response from Claude is a collapsible card whose header gives the model, a summary of its content, the tokens generated, the duration and the time — plus **two context figures**: the size of the window at the end of the card, and what the card added to it.

`Expand all` / `Collapse all` reach **every fold** at once: turns, tool calls, results, reasoning, reports.

### The tool calls

Every call is **collapsed by default** — and its body is not merely hidden, it is **not mounted**: syntax highlighting and Markdown rendering are the whole cost of the timeline, and a long session holds hundreds of calls nobody will open.

The collapsed header carries an icon specific to the tool, a summary saying _what_ was done (which file, how many lines, which command), an estimate of the tokens added to the context, and a state doubled by a word — colour never carries the information alone.

The body uses a view **specific to the tool**: a diff for an edit, a list of paths for a file search, the results of a `Grep`, the answer of a language server, a sub-agent's report, a web search read as a search… A tool never met before falls back on a generic view, which honestly shows what it has rather than nothing. When a tool produced an **image**, it comes before the text: the image is the result.

### The reasoning

Claude Code does not write Claude's reasoning to disk: the block reaches the transcript with its signature alone, the text stripped. I show it for what it is — `Thinking — not kept in the transcript`, with no fold, since there is nothing to unfold. The block keeps its worth: it says **where** Claude reasoned, and the context panel counts what that reasoning cost.

A model served by a local backend — Claude Code pointed elsewhere through `ANTHROPIC_BASE_URL` — emits no such block at all. Models of the MiniMax, Qwen or DeepSeek families open their answer with their reasoning, between `<think>` and `</think>`. I separate it out as I read, and present it like Claude's: folded, its first words as a preview, Markdown rendered on unfolding. With one difference that matters — here the text is there.

A tag left open, on a turn cut short, is not split: I keep the text whole rather than cut it in the wrong place.

### What appears between turns

These elements never fold into a card: **their place in the stream is what explains them.**

- **hook firings**, around the tool call concerned — shown even when the card is collapsed, since a hook that injects context or blocks a turn explains what follows;
- **compactions**, with what they took away;
- **entering and leaving plan mode**, and the rejected plan that says it was rejected and why;
- **questions put** to the user and the option chosen;
- **messages received from a teammate**, rendered as received messages and not attributed to the human;
- **typed commands** and the manual a skill pours into the window.

Hooks that ran **without returning anything or reporting an error** do not each deserve a line: they are counted and grouped at the end of the stream, by command.

### The turn milestones

At the start of each response, a `Turn N` milestone with the exact growth of the window at that turn. It is the anchor for the `@N` links of the context panel — that is what makes turn 148 findable in a card holding dozens.

When something entered **silently** in that turn — a re-injected file, a loaded rule — the milestone unfolds over it.

### Rendering

The Markdown of messages is rendered: highlighted code (some thirty languages, PowerShell included) and **Mermaid** diagrams drawn, redrawn when the theme changes. External links open in a new tab; relative links stay in the document.

## The right-hand column

Three panels, of which **only one is open at a time** — or none. This is not a free saving of space: open together, they were given 90, 250 and 170 pixels, that is three stacked scrollbars and a context cut down to two of its categories. Collapsed, a panel **keeps its title and its figure**: you fold the detail, never the measurement. Folding everything gives the transcript the full height of the screen.

Context is open on arrival: it is the longest of the three, and the question one asks while re-reading a session is most often “what is filling the window?”.

### Tasks

The work plan replayed from the `TaskCreate` / `TaskUpdate` calls. It says in ten lines what three hundred turns were after, and each task links back to the turn where it began. This is where it serves most: facing a live stream one knows what one is looking at, facing a transcript from three months ago, no.

The counter follows **the current plan**, not the session total. A session that keeps no list has no panel.

### Context window

The figure at the top is **exact**: the context sent to the model on the last turn of the phase, against the model's limit. A curve shows how the filling rose over the whole session, compactions included.

A **phase** is a segment between two compactions — a compaction empties the window. The selector appears only from the second one.

Four views of the same content:

- **By category** — what eats the window, by nature. Seven categories: memory, skills, files, tools, reasoning, your messages, and **harness** (the tool and agent lists, the MCP instructions, the task reminders, the hook outputs — the machinery Claude Code injects itself). Categories made of paths — memories, rules — are read as a folder tree.
- **By size** — the raw ranking, all types together.
- **Flat** — denormalised: a 40 k `Read` no longer hides behind its aggregate.
- **By turn** — exact growth turn by turn, estimated detail.

Unfolding a tools row **names the tools**, heaviest first — “12 tool calls at turn 7” does not tell a 5 k `Read` from twelve penny `Bash` calls. Unfolding a response separates **reasoning** from **answer**: only the first shortens by asking for less thinking.

A point of method, stated on the panel itself: the total and the growth are **measured**, the per-category breakdown is **estimated** (≈ 4 characters per token, for lack of an offline tokenizer). The two are never reconciled by scaling the estimates — a breakdown massaged to add up would look reliable and be wrong. What the categories do not explain is named “unattributed” and left as it is: on this corpus, they account for about a quarter of the window.

A session with no usage reading — synthetic model, interrupted session — has no context to show, and the panel says so.

### Session diagnostic

The session total, **broken into four items** that add up, with their share. The panel loads in the background, without holding back the conversation: placing a session requires re-reading the whole corpus.

Then **where it stands** in your corpus: for each measure, a rule with two markers — the corpus median and this session. The fill carries the **rank**, not the value, because the amounts spread over three orders of magnitude.

Finally the **findings** the diagnostic rules make about it, with a link to the corpus diagnostic. No finding is a result in itself, and the screen says so.

The tone is deliberate: **an expensive session is not a fault.** The costliest of a corpus may show 99% cache — it is not inefficient, it is long. The screen informs, it does not grade. As everywhere, amounts are at API rates, and a `≥` means a model has no known rate.

## Freshness

The transcript is read again when the service reports the file has moved — a session still open therefore fills in before your eyes, without the loading skeleton wiping what you are reading. A fingerprint avoids rebuilding an identical timeline when nothing changed, and two close notifications do not chase each other: a single read is in flight, replayed once at the end if the file moved again.
