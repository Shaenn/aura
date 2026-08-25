// Le transcript lu hors du thread principal.
//
// Ce que ces tests tiennent : le passage par un thread ne doit rien changer au
// document servi. Le pool est une optimisation de *où* le travail a lieu, jamais
// de ce qu'il produit — si les octets diffèrent d'un chemin à l'autre, le rejeu
// affiche autre chose selon la charge de la machine, ce qui serait pire que lent.
//
// Le chemin réellement pris ici dépend du chargeur : sous `tsx` (le serveur) le
// thread démarre, sous `vitest` il ne sait pas résoudre les imports sans
// extension du BFF et le pool se replie sur une lecture en process. Les
// assertions valent dans les deux cas — c'est précisément ce qu'on veut d'un
// repli.

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { serialiseInPool, poolState } from '../server/parse-pool.ts'
import { readTranscriptCached } from '../server/transcript-cache.ts'
import { serialiseTranscript } from '../server/transcript-worker.ts'
import { parseTranscript } from '../server/transcript.ts'

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))
const abs = join(fixtures, 'withsub.jsonl')
const id = 'withsub'

describe('lecture de transcript hors boucle', () => {
  it('sérialise exactement ce que le parse produit', async () => {
    const expected = JSON.stringify(await parseTranscript(abs, id))
    const bytes = await serialiseTranscript(abs, id)
    expect(Buffer.from(bytes).toString('utf8')).toBe(expected)
  })

  it('rend les mêmes octets quel que soit le chemin emprunté', async () => {
    const direct = await serialiseTranscript(abs, id)
    const pooled = await serialiseInPool(abs, id)
    expect(Buffer.from(pooled).equals(Buffer.from(direct))).toBe(true)
  })

  it('rend un `Buffer`, seule forme que Fastify écrit telle quelle', async () => {
    // Un `Uint8Array` nu passerait pour un objet ordinaire et serait sérialisé
    // en JSON — un tableau de nombres à la place du transcript.
    const { body } = await readTranscriptCached(abs, id)
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(() => JSON.parse(body.toString('utf8'))).not.toThrow()
  })

  it('remonte l’échec d’un transcript absent, sans le confondre avec une panne de thread', async () => {
    await expect(serialiseInPool(join(fixtures, 'nexistepas.jsonl'), 'nexistepas')).rejects.toThrow()
    // Un fichier manquant ne condamne pas le pool : c'est le transcript qui a
    // échoué, pas le mécanisme.
    expect(poolState().size).toBeGreaterThan(0)
  })
})
