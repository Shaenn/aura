---
id: passerelle
title: Gateway
icon: forum
order: 105
routes: []
---

Driving the **Workshop** from a messaging app, when you are away from this machine. You write to a bot, I open a session or pass your message to the one already working, and I hand you back its answer.

This is the only part of AURA that leaves this machine, and **it exists only if you configure it**. With no token it does not start, calls nothing, and nothing changes. That is the default state, and it stays that way.

## What it does not open

I still listen on the loopback interface only. The Gateway **opens no port**: I go and fetch messages from Telegram, Telegram never comes knocking here. No hole is punched in the firewall, no address is exposed, and nothing that guards the API changes.

That is why this shape rather than a tunnel or an opening onto the network: an exposed interface would need authentication to defend, where an outbound request needs none.

## What it costs you

Three things, better weighed before than after.

- **A secret comes in.** Everywhere else I hold none. The bot token lives in `server/.env`, which is not versioned, and none of my routes is able to hand it back.
- **I call an external service.** Your messages travel through Telegram's servers, like any other conversation held there.
- **The power granted is that of remote access.** Whoever writes in an allowed conversation can open a session, have it run a command and approve a write on this machine. The list of allowed conversations is therefore not a convenience: it is the lock.

I refuse to start if that list is missing. An oversight must not open the machine to the first comer.

## Turning it on

1. Create a bot with `@BotFather` on Telegram, which gives you a token.
2. Get your conversation's id — a number; a group's is negative.
3. Fill in `server/.env`:

```
AURA_TELEGRAM_TOKEN=the-BotFather-token
AURA_TELEGRAM_CHATS=your-id
```

4. Restart the service **fully**. That file is read at startup and is not re-read live: a new variable only takes effect on the next launch.

A line in my log confirms the opening and how many conversations are allowed. If the token is refused, I say so and stop there rather than retrying forever — the rest of AURA keeps working.

`AURA_TELEGRAM_MODE` sets the permission mode of sessions opened from afar. `default` unless told otherwise: every sensitive tool asks you.

## What you can tell me

### Browsing, without starting anything

`/projets` opens a **navigation screen**: one button per project. Click, and that same message rewrites itself to show the project's **tree** — `.claude/ 59`, `workflow/ 15`, then the files at the root. You walk down folder by folder; a file opens its contents.

A single message for the whole trip, with **◀ Parent folder** at every level. Deliberately so: a conversation has no back button, and stacking one list per click would leave a queue of dead states behind you to scroll past.

Eighty files in a row cannot be read. Grouping them by category would have been one answer — but an invented one, when **the paths already carry a structure**: the Project page's "categories" _are_ the folders of `.claude`. Following the tree therefore shows the project as it is actually arranged, rather than a parallel classification to memorise.

Every folder shows how many files it holds **at any depth**. And a folder whose only child is another folder is merged with it — `rules/back/application` opens in a single click, instead of three screens that would ask no question.

The commands remain available when you already know where you are going:

| Message       | What I do                                            |
| ------------- | ---------------------------------------------------- |
| `/projets`    | The navigation screen                                |
| `/projet <n>` | A project's root, directly                           |
| `/voir <n>`   | A file's contents, by its rank in the project's list |

This is **the same inventory as the Project page** — no more, no less. The same guards therefore apply word for word: a file I refuse to open on screen I refuse here too, and secrets (`.env`, credentials, keys) are offered nowhere.

None of this opens a session: no process, no tokens spent, an immediate answer. A project's root also carries an **▶ Open the Workshop here** button, saving you the command.

One last point, since it will be noticed: these screens live in my memory, not on disk. After the service restarts, the buttons on an older message no longer point anywhere — I say so rather than sitting there doing nothing.

### What becomes of a Markdown file

I **translate** it into a structured document, not decorated text: headings at their level, lists, quotes, code blocks highlighted for the declared language, clickable links, and **real tables, with their borders and their header row**.

A word on tables, because they decide whether a specification is readable at all. Rendered as monospaced text, a table falls apart as soon as it exceeds a phone's width: the columns wrap and the alignment — its whole reason for being — is gone. Hence the richer message format, which draws them properly.

Two caveats, from observation rather than documentation:

- a **checkbox** (`- [ ]`, `- [x]`) is not drawn by current clients, even though the format provides for it. So I write `☑︎` or `☐︎` into the text: otherwise a task list would lose the state of every line with nothing to signal it;
- anything that is **not** Markdown — a `settings.json`, a settings file — goes out monospaced and untransformed. Seeing bullets and emphasis in it would invent a structure that is not there.

If a document defeats the translation, I fall back to simple formatting, then to plain text. An ugly document beats a missing one.

### Long documents

A message is bounded, even a rich one. A longer document therefore arrives **in pages**, with **◀ Previous** and **Next ▶** buttons — the header says where you are (`page 2 of 7`). The bound is generous: most documents fit on a single page.

The cut always falls on a line ending, never mid-word. And a page that stops inside a code block closes it, the next one reopening it: without that, the whole rest of the document would render as code.

The file is re-read for each page. It may therefore have changed between two pages — deliberately so: you are reading the disk, not a copy taken ten minutes ago.

### Working

| Message        | What I do                             |
| -------------- | ------------------------------------- |
| `/atelier <n>` | I open a session on that project      |
| `/sessions`    | I list what is running, in two groups |
| `/stop`        | I interrupt the current turn          |
| `/fin`         | I close this conversation's session   |
| `/aide`        | I repeat the above                    |

One conversation holds **one** session at a time: opening one closes the previous.

`/sessions` answers in two groups, because they are not the same thing. **Opened by AURA**: the ones I own, and the only ones I can talk to. **Opened elsewhere**: the ones you started in a terminal — I see them through their state file, I do not drive them. Merging the two would suggest a message can reach a terminal session, which it cannot.

**Any other message goes to the session as a turn.** That is by far the most frequent case, and it needs no syntax.

### I only open known projects

`/atelier` accepts **only projects Claude Code already knows** — the ones `/projets` lists. Any other folder on the machine matches nothing: there is no rule to get around, only a list you have to be in already.

This is deliberately stricter than the Workshop on screen, where you browse the disk freely. At the screen you see what you pick; from afar you do not — and a mistyped path would open a session somewhere else with nothing to flag it.

The number, the full path, the project name and its slug all work.

A command I do not know is reported back to you rather than sent to the agent — otherwise a typo would look like a breakdown.

A message from a conversation that is not allowed gets **no reply**. That is deliberate: replying would confirm that this bot exists and what it is for.

## Approving a tool from afar

When the agent wants a tool the mode does not let through, I send you a message with two buttons, **Allow** and **Deny**. Your answer unblocks the turn at once.

The Workshop's deadline applies here too: **with no answer within fifteen minutes the request is denied**, never the reverse. A command started before you left will not stay suspended forever.

A multiple-choice question reaches you the same way, as buttons. If it holds several questions, I tell you rather than answering it halfway: that form needs the screen, and it is waiting for you in the Workshop.

## While it is working

A turn can run for ten minutes without a single byte arriving. So, for as long as it lasts, I show a **bubble saying what I am doing and since when** — `Read, Grep — 1m 12s`. The same labels as on screen: one session read from two places must not tell two stories.

That bubble is not a message. It does not stay in the thread, cannot be re-read, and disappears as soon as the answer arrives. That is what sets it apart from a stream: it occupies one place, always the same, instead of stacking up.

It stops the moment the ball is in your court — end of turn, permission request, question. Letting it beat while I wait on you would suggest I am still working.

Two caveats I would rather state: the bubble needs a **private conversation** and a **mobile** client. On the web, or in a group, it does not show. What remains then is the "typing…" in the header, which says less but works everywhere.

## What I do not send you

**The agent's answer at the end of a turn, and the requests awaiting a decision.** Nothing else.

Not the tokens as they are written, not the detail of what a tool read or wrote. A messaging app is not a timeline: pouring a stream into it would make it unreadable and drown what needs an answer. The full thread is in the Workshop, and the **Replay** keeps it.

The answer itself is a document, and I render it as one — the same tables, headings and lists as for a file. It is what you read most often here; it would be the last place to leave raw Markdown.

A very long answer is cut rather than lost — truncated text can be read, a failed send cannot be seen. The cut is generous: five times what an ordinary message takes.

## The two bounds, and what protects you

The **six sessions** ceiling applies here as elsewhere: I say so in the conversation rather than failing without a word.

The **thirty minute** collection does not apply to a session driven from here. As long as the conversation holds it, I am watching it — and a watched session is never collected. You can leave work half-done and pick it up in the evening.

A session does **not** survive a restart of the service, however. Write to me after one and I will tell you no session is open; `/atelier` opens a new one, and the previous work stays on disk.

## What this does not replace

The Workshop shows what a messaging app cannot: the exact path a tool targets, a question's mockups, the context window, the commands left running in the background. The Gateway is for starting, watching and unblocking — not for working blind.

Sessions opened from afar are sessions like any other: they show up in the Workshop, they replay, and they count in **Usage** as in **Diagnostics**.
