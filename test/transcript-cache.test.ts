// Ce dont dépend l'état d'un transcript parsé.
//
// Le piège que ces tests tiennent : un sous-agent écrit ses tours dans son
// sidecar pendant qu'il travaille, sans que le fichier de session bouge. Une
// empreinte prise sur le seul fichier de session fait alors resservir le parse
// précédent, et le stream reste figé jusqu'au rapport de l'agent.
//
// Les fixtures sont recopiées dans un dossier temporaire : ces tests écrivent,
// et `test/fixtures/` est versionné.

import { mkdtemp, mkdir, copyFile, appendFile, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readTranscriptCached, type CachedTranscript } from '../server/transcript-cache.ts'
import type { ParsedTranscript } from '../shared/transcript.ts'

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))

let dir = ''

/** Une copie jetable de la fixture `withsub`, sidecar compris. */
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'aura-cache-'))
  await copyFile(join(fixtures, 'withsub.jsonl'), join(dir, 'withsub.jsonl'))
  const sub = join(dir, 'withsub', 'subagents')
  await mkdir(sub, { recursive: true })
  for (const f of ['agent-abc123.jsonl', 'agent-abc123.meta.json']) {
    await copyFile(join(fixtures, 'withsub', 'subagents', f), join(sub, f))
  }
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function read() {
  return readTranscriptCached(join(dir, 'withsub.jsonl'), 'withsub')
}

/**
 * Le transcript, relu depuis les octets que le cache retient.
 *
 * Le cache ne garde plus un graphe d'objets : le parse a lieu dans un thread à
 * part, qui rend le document déjà sérialisé. Un test qui veut regarder dedans le
 * désérialise — c'est le seul endroit du dépôt qui en a besoin.
 */
function parsed(c: CachedTranscript): ParsedTranscript {
  return JSON.parse(c.body.toString('utf8')) as ParsedTranscript
}

/**
 * Vieillir un fichier d'une seconde.
 *
 * L'empreinte tient la `mtime` *et* la taille ; un test qui n'ajoute rien doit
 * donc bouger l'une pour prouver que l'autre ne suffisait pas — et les deux
 * écritures d'un test tombent sinon dans la même milliseconde.
 */
async function age(path: string): Promise<void> {
  const when = new Date(Date.now() - 1000)
  await utimes(path, when, when)
}

describe('cache de transcript', () => {
  it('ressert le même parse tant que rien n’a bougé', async () => {
    const first = await read()
    const second = await read()
    expect(second).toBe(first) // la même instance, pas seulement la même valeur
  })

  it('reparse quand un sidecar de sous-agent grandit, session inchangée', async () => {
    const before = await read()
    const sidecar = join(dir, 'withsub', 'subagents', 'agent-abc123.jsonl')
    await appendFile(
      sidecar,
      JSON.stringify({
        type: 'assistant',
        uuid: 'sa-late',
        timestamp: '2026-01-01T10:09:00.000Z',
        message: {
          id: 'msg-late',
          role: 'assistant',
          content: [{ type: 'text', text: 'encore un tour' }],
        },
      }) + '\n',
    )

    const after = await read()
    expect(after).not.toBe(before)
    expect(after.etag).not.toBe(before.etag)
    expect(parsed(after).events.length).toBeGreaterThan(parsed(before).events.length)
  })

  it('reparse quand un sidecar est réécrit sans changer de taille', async () => {
    const before = await read()
    await age(join(dir, 'withsub', 'subagents', 'agent-abc123.jsonl'))

    const after = await read()
    expect(after).not.toBe(before)
  })

  it('reparse quand un nouveau sous-agent démarre', async () => {
    const before = await read()
    const sub = join(dir, 'withsub', 'subagents')
    await copyFile(join(sub, 'agent-abc123.jsonl'), join(sub, 'agent-def456.jsonl'))

    const after = await read()
    expect(after.etag).not.toBe(before.etag)
  })

  it('condense l’empreinte : l’`ETag` ne grandit pas avec le nombre d’agents', async () => {
    const sub = join(dir, 'withsub', 'subagents')
    const before = await read()
    for (let i = 0; i < 8; i++) {
      await copyFile(join(sub, 'agent-abc123.jsonl'), join(sub, `agent-clone${i}.jsonl`))
    }
    const after = await read()
    expect(after.etag).not.toBe(before.etag)
    expect(after.etag).toHaveLength(before.etag.length)
  })
})
