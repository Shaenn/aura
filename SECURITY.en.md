# Security

**English** · [Français](SECURITY.md)

AURA reads and writes inside `~/.claude`, the folder where Claude Code keeps your transcripts,
your settings and your credentials. That is sensitive ground, and this document states what the
application guarantees, what it does not, and how to report a flaw.

## The model

AURA is a **local, single-user** tool. There is no account, no password, no external service:
the boundary is the machine itself. One feature, off by default, moves that boundary — see
_The Gateway_ below.

- The BFF **listens on `127.0.0.1` only**, with no option to open it up. No device on the
  network can reach it.
- Every `/api/*` request is checked against its `Host` header, which closes **DNS rebinding** —
  the attack where a site you visit points its domain at the loopback address to talk to a local
  server through your own browser.
- Every writing request must declare itself same-origin (`Sec-Fetch-Site`), which closes
  **CSRF**: a page open in another tab cannot trigger a write.
- Client-supplied paths are reduced to their **canonical form** before being judged: symlinks
  followed, real case, Windows short names expanded. A denylist hides the private areas
  (`.credentials.json`, `sessions`, `file-history`, caches); an allowlist bounds writes to the
  editable resources.
- Every write is **previewed then confirmed**, backed up before replacement, and refused if the
  file changed on disk in the meantime.
- Internal errors never return an absolute path: the detail stays in the server log.

## The Gateway, and what it changes

One feature alone steps outside this model, and **it exists only if you turn it on**: the
Gateway, which links a messaging app to the Workshop so you can drive a session remotely. With
no token configured it does not start, calls nothing, and everything above stays true word for
word.

What it does not change:

- **It opens no port.** The exchange is outbound — the server goes and fetches messages. The
  BFF still listens on `127.0.0.1` only, and the `Host` and `Sec-Fetch-Site` guards are
  untouched.
- **It does not go through the API.** It calls the session registry in the same process: no
  route is opened, no request needs authenticating.

What it does change, and what you should weigh:

- **A secret now exists.** The bot token lives in `server/.env`, un-versioned. It does not
  travel through the server's shared configuration and no route is able to hand it back.
- **The server calls an external service.** Your messages travel through it.
- **It is remote access to your machine.** Whoever writes in an allowed conversation can open
  a session, have it run a command and approve a write. The allowlist of conversations is the
  only guard against that: it is **required**, the Gateway refuses to start without it, and a
  message from anywhere else gets no reply.
- **The channel's safety becomes yours.** Anyone who gains access to an allowed conversation —
  an unlocked device, a compromised account — gains that same power. AURA cannot tell them
  apart from you.

**Personal use is what the Gateway is made for; professional use is not.** Everything that
passes through — your messages, the agent's answers, the contents of files consulted remotely —
travels through the messaging service's servers, with no end-to-end encryption: a conversation
with a bot offers none. The trade-off holds for personal projects; it does not hold for company
code or client data. A shape without a third party is being looked for — a private network
(Tailscale or equivalent) making the Workshop reachable from a phone without exposing anything,
which would mean adapting the interface to that screen — but it does not exist today, and
nothing in the code tells a personal project from a work one.

Permission requests are still raised, and still deny themselves when unanswered.
`AURA_TELEGRAM_MODE=plan` opens remote sessions in plan mode, where nothing executes.

## What is not covered

- **The other processes in your session.** Anything running under your account can reach
  `127.0.0.1:8788`, just as anything running under your account can read `~/.claude` directly.
  AURA does not claim to defend against that.
- **What Claude Code does.** AURA observes and configures; tool permissions, hooks and MCP
  servers are run by Claude Code, under its own rules.
- **The MCP servers you declare.** AURA writes their configuration; what they do once launched
  is not up to it.

## Reporting a vulnerability

Open a **private security advisory** through the repository's _Security_ tab ("Report a
vulnerability"). That allows a discussion without exposing the flaw before it is fixed.

Failing that, a public issue is still better than silence — but please avoid publishing a
detailed exploitation path while nothing is fixed.

Please state the version, the operating system, and what it takes to reproduce.

## Versions

The project maintains a single line: the `main` branch. A security fix lands there, with no
backport.
