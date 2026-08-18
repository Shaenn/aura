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

One conversation holds **one** session at a time.

| Message             | What I do                                   |
| ------------------- | ------------------------------------------- |
| `/atelier <folder>` | I open a session on that folder             |
| `/sessions`         | I list what is running, whatever started it |
| `/stop`             | I interrupt the current turn                |
| `/fin`              | I close this conversation's session         |
| `/aide`             | I repeat the above                          |

**Any other message goes to the session as a turn.** That is by far the most frequent case, and it needs no syntax.

A command I do not know is reported back to you rather than sent to the agent — otherwise a typo would look like a breakdown.

A message from a conversation that is not allowed gets **no reply**. That is deliberate: replying would confirm that this bot exists and what it is for.

## Approving a tool from afar

When the agent wants a tool the mode does not let through, I send you a message with two buttons, **Allow** and **Deny**. Your answer unblocks the turn at once.

The Workshop's deadline applies here too: **with no answer within fifteen minutes the request is denied**, never the reverse. A command started before you left will not stay suspended forever.

A multiple-choice question reaches you the same way, as buttons. If it holds several questions, I tell you rather than answering it halfway: that form needs the screen, and it is waiting for you in the Workshop.

## What I do not send you

**The agent's answer at the end of a turn, and the requests awaiting a decision.** Nothing else.

Not the tokens as they are written, not the activity line, not the detail of the tools used. A messaging app is not a timeline: pouring a token stream into it would make it unreadable and drown what needs an answer. The full thread is in the Workshop, and the **Replay** keeps it.

A very long answer is cut rather than lost — truncated text can be read, a failed send cannot be seen.

## The two bounds, and what protects you

The **six sessions** ceiling applies here as elsewhere: I say so in the conversation rather than failing without a word.

The **thirty minute** collection does not apply to a session driven from here. As long as the conversation holds it, I am watching it — and a watched session is never collected. You can leave work half-done and pick it up in the evening.

A session does **not** survive a restart of the service, however. Write to me after one and I will tell you no session is open; `/atelier` opens a new one, and the previous work stays on disk.

## What this does not replace

The Workshop shows what a messaging app cannot: the exact path a tool targets, a question's mockups, the context window, the commands left running in the background. The Gateway is for starting, watching and unblocking — not for working blind.

Sessions opened from afar are sessions like any other: they show up in the Workshop, they replay, and they count in **Usage** as in **Diagnostics**.
