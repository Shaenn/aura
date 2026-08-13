# Security

**English** · [Français](SECURITY.md)

AURA reads and writes inside `~/.claude`, the folder where Claude Code keeps your transcripts,
your settings and your credentials. That is sensitive ground, and this document states what the
application guarantees, what it does not, and how to report a flaw.

## The model

AURA is a **local, single-user** tool. There is no account, no password, no external service:
the boundary is the machine itself.

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

## What is not covered

- **The other processes in your session.** Anything running under your account can reach
  `127.0.0.1:8800`, just as anything running under your account can read `~/.claude` directly.
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
