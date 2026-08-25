# Installing AURA

**English** · [Français](INSTALL.md)

AURA is a **local** application: it runs on **your machine**, depends on no external service and
holds no secret. It drives the **`~/.claude`** folder of your Claude Code installation.

AURA is developed and tested on **Windows**, exclusively. The commands below assume that
system.

## Requirements

- **Node.js 24** installed on the machine.
- **pnpm** ≥ 11 (`npm i -g pnpm`).
- **Claude Code** installed and run at least once, with an existing **`~/.claude`** folder
  (on Windows: `C:\Users\<you>\.claude`). That folder is what AURA reads and changes.

## Installation

1. **Get the sources** (git clone, or a copy of the project folder).

2. **Install the dependencies** at the root of the project:

   ```bash
   pnpm install
   ```

## Running

### In development (front + server, hot reload)

```bash
pnpm dev:all
```

- Application: <http://localhost:9788> (opened automatically)
- Server (BFF): <http://localhost:8788>

The console window stays open: **it is the server**. Closing it stops AURA.

### In local “production” (a single process)

```bash
pnpm build      # generates the static build of the SPA
pnpm start      # serves the app + the API on http://localhost:8788
```

## Configuration (optional)

No secret is required. Two optional environment variables:

- `PORT` — the server's listening port (default `8788`).
- `AURA_CLAUDE_DIR` — overrides the managed `.claude` folder (default `~/.claude`; handy for
  testing on a sandbox copy).

They can be set in the environment or in `server/.env` (git-ignored), read by `--env-file`.

## Troubleshooting

- **The browser does not open**: go manually to <http://localhost:9788> (dev) or
  <http://localhost:8788> (prod).
- **The port is already in use**: an instance is probably already running, or change `PORT`.
- **“`.claude` folder not found”**: run Claude Code once to create it, or point
  `AURA_CLAUDE_DIR` at the right folder.

## Choosing the language

The interface runs in French and English. The language is switched from the button in the status
bar, top right, and is remembered — it is stored on the server with your theme preference, not in
the browser.

It follows you everywhere: screens, server messages, diagnostic findings, the built-in manual, and
the number formats.
