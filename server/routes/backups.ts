// HTTP surface for the safety backups (`/api/backups/*`). Read + purge only;
// restore goes through the normal /api/claude/propose+apply flow.

import type { FastifyInstance } from 'fastify'
import { listBackups, readBackup, purgeBackup, purgeAllBackups } from '../backups'
import { t } from '../i18n/index.ts'
import { str } from '../json.ts'

export function registerBackups(app: FastifyInstance): void {
  /** All backed-up files across snapshots. */
  app.get('/api/backups', async () => ({ entries: await listBackups() }))

  /** Read one backup's content (for the restore preview). */
  app.get('/api/backups/content', async (req, reply) => {
    const q = req.query as Record<string, unknown>
    const stamp = str(q.stamp)
    const path = str(q.path)
    if (!stamp || !path) return reply.code(400).send({ error: t('errors.paramsRequired', { first: 'stamp', second: 'path' }) })
    try {
      return { content: await readBackup(stamp, path) }
    } catch {
      return reply.code(404).send({ error: t('errors.backupNotFound') })
    }
  })

  /**
   * Purge un instantané (`stamp`) ou la totalité (`all: true`).
   *
   * Les deux se demandent ; aucun ne se déduit. Un corps vide effaçait
   * auparavant toutes les sauvegardes — or un `POST` sans corps est ce qu'une
   * page tierce sait envoyer sans rien demander au navigateur, et c'est aussi
   * ce qu'on envoie par mégarde. La seule chose qui permette de revenir en
   * arrière ne disparaît pas sur un silence.
   */
  app.post('/api/backups/purge', async (req, reply) => {
    const body = (req.body ?? {}) as { stamp?: unknown; all?: unknown }
    if (body.all === true) {
      await purgeAllBackups()
      return { ok: true }
    }
    const stamp = str(body.stamp)
    if (!stamp) return reply.code(400).send({ error: t('errors.purgeTargetRequired') })
    try {
      await purgeBackup(stamp)
    } catch {
      return reply.code(404).send({ error: t('errors.backupNotFound') })
    }
    return { ok: true }
  })
}
