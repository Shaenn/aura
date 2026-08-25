// Observability & maintenance endpoints (`/api/system/*`): storage sizes + purge,
// sessions, plans (list/read/delete), and the orderly shutdown.

import type { FastifyInstance } from 'fastify'
import type { KillProcessBody } from '../../shared/processes.ts'
import { listSessions as listRunners } from '../agent/registry.ts'
import { publicMessage } from '../errors.ts'
import { t } from '../i18n/index.ts'
import { str } from '../json.ts'
import { getStorage, purgeArea, listSessions, listPlans, readPlan, deletePlan } from '../maintenance'
import { isLoopback } from '../net.ts'
import { killTree, listClaudeProcesses } from '../processes.ts'

export function registerMaintenance(app: FastifyInstance): void {
  app.get('/api/system/storage', () => getStorage())

  app.post('/api/system/purge', async (req, reply) => {
    const body = (req.body ?? {}) as { area?: string }
    if (!body.area) return reply.code(400).send({ error: t('errors.paramRequired', { name: 'area' }) })
    try {
      await purgeArea(body.area)
      return { ok: true }
    } catch (e) {
      return reply.code(400).send({ error: publicMessage(e) })
    }
  })

  app.get('/api/system/sessions', async () => ({ sessions: await listSessions() }))

  // ── Processus ──────────────────────────────────────────────────────────────
  //
  // La seule surface qui regarde hors de `~/.claude`. Elle existe parce que le
  // disque ne dit pas tout : un daemon et un hôte de pseudo-terminal n'écrivent
  // aucun fichier de session, et ce sont eux qui survivent aux sessions.

  app.get('/api/system/processes', () => listClaudeProcesses())

  /**
   * Terminer un processus Claude, et sa descendance si on le demande.
   *
   * Quatre gardes, et il les faut toutes :
   *
   * 1. La boucle locale seule, comme l'extinction — le serveur écoute le réseau
   *    local, et terminer des processus n'est pas un pouvoir à laisser en libre
   *    accès à qui voit la machine.
   * 2. La cible doit figurer dans une énumération faite **à l'instant**. C'est ce
   *    qui garantit qu'on ne tue qu'un processus Claude vivant, et cela ferme au
   *    passage la fenêtre du PID recyclé : un identifiant relu d'un écran
   *    périmé ne désigne plus rien d'énumérable.
   * 3. Jamais AURA elle-même. Le serveur ne se tue pas, il s'éteint — et
   *    `/api/system/shutdown` est là pour ça, qui coupe proprement les sessions
   *    de l'Atelier au passage.
   * 4. L'ordre de coupe appartient à `killOrder`, pas à l'appelant.
   */
  app.post('/api/system/processes/kill', async (req, reply) => {
    if (!isLoopback(req.ip)) return reply.code(403).send({ error: t('errors.accessDenied') })

    const body = (req.body ?? {}) as KillProcessBody
    const pid = Number(body.pid)
    if (!Number.isInteger(pid) || pid <= 0) {
      return reply.code(400).send({ error: t('errors.paramRequired', { name: 'pid' }) })
    }
    if (pid === process.pid) return reply.code(400).send({ error: t('errors.cannotKillSelf') })

    const { processes } = await listClaudeProcesses()
    const target = processes.find((p) => p.pid === pid)
    if (!target) return reply.code(404).send({ error: t('errors.processNotFound') })

    return { killed: killTree(pid, body.descendants === true, processes) }
  })

  app.get('/api/system/plans', async () => ({ plans: await listPlans() }))

  app.get('/api/system/plan', async (req, reply) => {
    const name = str((req.query as Record<string, unknown>).name)
    if (!name) return reply.code(400).send({ error: t('errors.paramRequired', { name: 'name' }) })
    try {
      return { name, content: await readPlan(name) }
    } catch {
      return reply.code(404).send({ error: t('errors.planNotFound') })
    }
  })

  app.post('/api/system/plan/delete', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string }
    if (!body.name) return reply.code(400).send({ error: t('errors.paramRequired', { name: 'name' }) })
    try {
      await deletePlan(body.name)
      return { ok: true }
    } catch (e) {
      return reply.code(400).send({ error: publicMessage(e) })
    }
  })

  // L'extinction ordonnée, pour les scripts d'arrêt.
  //
  // Sous Windows, aucun signal ne se transmet de l'extérieur : `Stop-Process` y
  // est un `TerminateProcess`, et le `SIGTERM` de Node n'y est qu'un autre nom
  // pour le même geste. Le crochet `onClose` — donc l'arrêt des sessions de
  // l'Atelier et des threads de lecture — ne s'exécuterait jamais. Un processus
  // `claude` par session resterait derrière, invisible et comptant toujours sur
  // le quota. HTTP est le seul canal qui atteigne encore le serveur : il sert
  // ici à lui demander de partir de lui-même.
  app.post('/api/system/shutdown', (req, reply) => {
    // Le serveur n'écoute plus que la boucle locale : cette garde ne trie donc
    // plus rien, et elle reste — elle porte l'intention, et elle sera le premier
    // filet si l'écoute venait à s'ouvrir. Ce qui protège vraiment cette route,
    // c'est `guard.ts` : un `POST` sans corps depuis un onglet ouvert arrivait
    // bien de `127.0.0.1`, et `isLoopback` le laissait passer.
    if (!isLoopback(req.ip)) return reply.code(403).send({ error: t('errors.accessDenied') })

    // Fermer coupe les sockets ouvertes, celle-ci comprise : on n'entame
    // l'extinction qu'une fois la réponse effectivement partie, sinon
    // l'appelant ne saurait jamais si sa demande a été entendue.
    reply.raw.once('finish', () => {
      void app.close().finally(() => process.exit(0))
    })
    return reply.send({ ok: true, sessions: listRunners().length })
  })
}
