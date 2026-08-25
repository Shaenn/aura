// File-backed store for the UI preferences (`GET/PUT /api/preferences`).
//
// Everything the front used to keep in the browser's localStorage now lives here
// (`.local/preferences.json`), so a machine's settings travel with its install
// and nothing is stored in the browser. The client owns the shape; this endpoint
// just persists whatever JSON object it sends (full replace).
//
// C'est la seule écriture du front, et elle le reste : une préférence nouvelle
// s'ajoute à l'objet, elle ne se donne pas sa propre route. La lecture vit dans
// `../preferences.ts`, le BFF en ayant besoin de son côté.

import { writeFile, mkdir } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import { t } from '../i18n/index.ts'
import { LOCAL_DIR } from '../paths'
import { PREFERENCES_PATH, readPreferences } from '../preferences.ts'

export function registerPreferences(app: FastifyInstance): void {
  app.get('/api/preferences', () => readPreferences())

  app.put('/api/preferences', async (req, reply) => {
    const body = req.body
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: t('errors.invalidPreferences') })
    }
    await mkdir(LOCAL_DIR, { recursive: true })
    await writeFile(PREFERENCES_PATH, JSON.stringify(body, null, 2), 'utf8')
    return reply.code(204).send()
  })
}
