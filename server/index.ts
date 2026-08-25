// BFF (Backend-for-Frontend) Fastify server for AURA.
//
// Two jobs:
//  1. Give the SPA a guarded filesystem API over the managed ~/.claude directory
//     (list / read / propose / apply) — see routes/claude.ts. The browser can't
//     touch the disk; every mutation is two-phase and backed up.
//  2. In production, serve the built Quasar SPA from this same process — one
//     deployable unit. In dev, Quasar serves the front on :9788 and proxies
//     /api here, so the static block below stays inert.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { stopAll } from './agent/registry.ts'
import { loadEnv } from './env'
import { publicMessage } from './errors.ts'
import { registerGuard } from './guard.ts'
import { enterLocale, localeFromHeader } from './i18n/index.ts'
import { stopPool } from './parse-pool.ts'
import { arretePasserelle, demarrePasserelle } from './passerelle/index.ts'
import { APP_DIR, IS_BUNDLE } from './paths'
import { registerAgent } from './routes/agent.ts'
import { registerBackups } from './routes/backups'
import { registerClaude } from './routes/claude'
import { registerDiagnostics } from './routes/diagnostics.ts'
import { registerEvents } from './routes/events.ts'
import { registerMaintenance } from './routes/maintenance'
import { registerMcp } from './routes/mcp'
import { registerPreferences } from './routes/preferences'
import { registerProjects } from './routes/projects'
import { registerUsage } from './routes/usage.ts'

async function main(): Promise<void> {
  const env = loadEnv()
  const app = Fastify({ logger: true, bodyLimit: 8 * 1024 * 1024 })

  app.log.info(`Dossier .claude géré : ${env.claudeDir}`)

  // La langue de la réponse suit celle de la requête, et rien d'autre. Le
  // contexte est ouvert au plus tôt — avant toute route — et tenu jusqu'au bout
  // de la pile : `t()` le lit sans que rien, entre les deux, ait à connaître HTTP.
  app.addHook('onRequest', (req, _reply, done) => {
    enterLocale(localeFromHeader(req.headers['accept-language']))
    done()
  })

  // Puis qui appelle, avant toute route : voir guard.ts. L'ordre compte — la
  // garde répond dans la langue que le crochet ci-dessus vient d'établir.
  registerGuard(app)

  // Ce qu'une exception non rattrapée a le droit de dire. Sans cela, Fastify
  // sert le message brut de Node — chemin absolu compris, donc le nom du compte
  // Windows. Le détail va au journal, le client reçoit un constat. Voir errors.ts.
  app.setErrorHandler((err: unknown, _req, reply) => {
    app.log.error(err)
    // Le statut que Fastify a posé lui-même — 400 sur un corps illisible, 415
    // sur un type inattendu — vaut mieux qu'un 500 uniforme : il dit à l'appelant
    // si la faute est de son côté.
    const status = (err as { statusCode?: number }).statusCode
    void reply.code(status && status >= 400 ? status : 500).send({ error: publicMessage(err) })
  })

  // File-backed UI preferences (replaces the browser's localStorage).
  registerPreferences(app)

  // The core: guarded read/write access to the managed .claude directory.
  registerClaude(app)

  // Read/purge the safety backups (restore reuses the claude propose/apply flow).
  registerBackups(app)

  // Read-only MCP inventory (connected + file-configured servers).
  registerMcp(app)

  // Observability & maintenance (storage/purge, sessions, projects, plans).
  registerMaintenance(app)

  // First-class Projects: per-project .claude inventory + transcript replay (read-only).
  registerProjects(app)

  // Token usage & estimated cost across every transcript (read-only).
  registerUsage(app)

  // Cost diagnostics: what the usage figures mean, and what to do about them.
  registerDiagnostics(app)

  // Push notifications of changes under ~/.claude, so the SPA needn't poll.
  registerEvents(app)

  // L'Atelier : les sessions qu'AURA lance et possède, par opposition à celles
  // qu'il se contente d'observer.
  registerAgent(app)

  // La Passerelle : piloter l'Atelier depuis une messagerie. Inerte tant
  // qu'aucun jeton n'est configuré — c'est le cas par défaut, et il le reste.
  // Elle n'ouvre aucun port : son long-polling est sortant, et elle appelle le
  // registre directement plutôt que de passer par l'API.
  demarrePasserelle({
    info: (m) => app.log.info(m),
    warn: (m) => app.log.warn(m),
  })

  // Un processus `claude` par session survivrait au serveur sans cela — et un
  // thread de lecture de transcript avec eux.
  app.addHook('onClose', () => {
    arretePasserelle()
    stopAll()
    stopPool()
  })

  // Encore faut-il que ce crochet s'exécute.
  //
  // Rien ne fermait Fastify : ni Ctrl+C, ni le `SIGTERM` que `node --watch`
  // envoie à chaque sauvegarde de fichier. Le serveur disparaissait donc en
  // laissant ses sessions derrière lui, et en développement cela se répétait à
  // chaque édition. `once` : un second signal doit pouvoir tuer sans discuter,
  // plutôt que de relancer une extinction déjà en cours.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().finally(() => process.exit(0))
    })
  }

  // Production SPA hosting: activated by the presence of the build.
  const spaDir = [join(APP_DIR, 'spa'), join(APP_DIR, 'dist', 'spa')].find((d) => existsSync(join(d, 'index.html')))
  if (spaDir) {
    await app.register(fastifyStatic, { root: spaDir })
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) {
        void reply.code(404).send({ error: 'Not found' })
        return
      }
      void reply.sendFile('index.html') // SPA fallback for client-side routes
    })
  }

  // La boucle locale, et rien d'autre — écrit en dur, sans variable pour en
  // sortir. Le serveur a écouté `0.0.0.0` pour qu'un téléphone du salon puisse
  // ouvrir l'interface ; mais aucune authentification ne venait avec, et le même
  // Wi-Fi porte aussi bien un poste inconnu. Une option d'ouverture au réseau
  // est une option que quelqu'un active, et qu'il faut alors défendre.
  //
  // `127.0.0.1` et non `localhost` : le nom se résout d'abord en `::1`, que rien
  // n'écoute ici, et le navigateur attend ~300 ms avant de se rabattre sur IPv4
  // — à chaque requête, soit quinze fois le temps de réponse du BFF.
  const url = `http://127.0.0.1:${env.port}`
  try {
    await app.listen({ port: env.port, host: '127.0.0.1' })
  } catch (err) {
    if (IS_BUNDLE && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      openBrowser(url)
      process.exit(0)
    }
    throw err
  }
  if (IS_BUNDLE) openBrowser(url)
}

/** Best-effort: open the default browser (Windows / Linux; no-op on error). */
function openBrowser(url: string): void {
  let cmd: string
  let args: string[]
  if (process.platform === 'win32') {
    cmd = 'cmd'
    args = ['/c', 'start', '', url]
  } else {
    cmd = 'xdg-open'
    args = [url]
  }
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
  } catch {
    /* opening the browser is a convenience, not a requirement */
  }
}

main().catch((err: unknown) => {
  // Le dernier recours du BFF : à ce point, ni le journal Fastify ni les routes
  // n’existent, et la console est le seul endroit où le message peut sortir.
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
