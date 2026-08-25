// Ce que le parseur doit savoir dire d'un run de sous-agent.
//
// La fixture `tracks` porte un run par branche de `runStatus`, plus les deux
// pièges qui ont dicté la forme du calcul : une réponse écrite sur trois lignes
// (qui ne doit compter qu'une fois) et un run imbriqué démarré avant un run
// racine (que le tri par `spawnDepth` du disque mettrait en dernier).
//
// Comme les autres fixtures de ce dossier, elle est écrite à la main : un
// transcript réel porte le code et les chemins de son auteur, et ce dépôt est
// poussé. Ne pas l'étendre pour un autre besoin sans relire ce fichier — les
// nombres attendus y sont en clair, et c'est voulu.

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseTranscript } from '../server/transcript.ts'
import type { SubagentRunSummary } from '../shared/transcript.ts'

const fixture = fileURLToPath(new URL('./fixtures/tracks.jsonl', import.meta.url))

const load = () => parseTranscript(fixture, 'tracks')

const runOf = (runs: SubagentRunSummary[], agentId: string): SubagentRunSummary => {
  const run = runs.find((r) => r.agentId === agentId)
  if (!run) throw new Error(`run ${agentId} absent`)
  return run
}

describe('statut d’un run — ce que le transcript atteste, et rien de plus', () => {
  it('un agent synchrone dont le rapport est revenu est terminé', async () => {
    const { subagents } = await load()
    expect(runOf(subagents, 'sync1').status).toBe('completed')
  })

  it('un agent lancé en asynchrone est terminé par sa notification de tâche', async () => {
    const { subagents } = await load()
    expect(runOf(subagents, 'async1').status).toBe('completed')
  })

  it('un agent lancé en asynchrone reste en vol tant qu’aucune notification ne le clôt', async () => {
    const { subagents } = await load()
    expect(runOf(subagents, 'async2').status).toBe('running')
  })

  it('un appel `Agent` sans résultat est un agent qui tourne encore', async () => {
    const { subagents } = await load()
    expect(runOf(subagents, 'flight').status).toBe('running')
  })

  it('un appel `Agent` en erreur est un run en échec', async () => {
    const { subagents } = await load()
    expect(runOf(subagents, 'failed1').status).toBe('failed')
  })

  it('un sidecar que rien ne rattache à un appel a un statut inconnu, et pas de type', async () => {
    const { subagents } = await load()
    const orphan = runOf(subagents, 'orphan')
    expect(orphan.status).toBe('unknown')
    expect(orphan.agentType).toBeUndefined()
  })

  /**
   * Le test qui interdit d'« améliorer » le statut par un délai.
   *
   * `async2` s'est tu à 10:02:40 et la session a continué jusqu'à 10:07 : une
   * heuristique de silence le déclarerait fini. Il ne l'est pas — rien ne le dit
   * — et sa fin ne doit donc pas être datée.
   */
  it('ne déduit jamais une fin du silence qui suit', async () => {
    const { subagents, stats } = await load()
    const async2 = runOf(subagents, 'async2')
    expect(async2.lastActivityAt).toBeLessThan(stats.endedAt)
    expect(async2.status).toBe('running')
    expect(async2.endedAt).toBeUndefined()
  })

  it('ne date la fin que des runs terminés, et alors sur leur dernière ligne', async () => {
    const { subagents } = await load()
    for (const run of subagents) {
      const terminal = run.status === 'completed' || run.status === 'failed'
      if (terminal) expect(run.endedAt).toBe(run.lastActivityAt)
      else expect(run.endedAt).toBeUndefined()
    }
  })
})

describe('comptes d’un run', () => {
  /**
   * Une réponse écrite sur trois lignes est un tour, et ses tokens sont ceux de
   * son relevé le plus avancé — pas la somme des trois instantanés. `sync1` a
   * deux réponses : `msg_s1` sur trois lignes (100 en entrée, 40 en sortie au
   * plus haut) et `msg_s2` sur une (200 / 20).
   */
  it('compte une réponse multi-lignes pour un tour et ses tokens une fois', async () => {
    const { subagents } = await load()
    const sync1 = runOf(subagents, 'sync1')
    expect(sync1.turns).toBe(2)
    expect(sync1.tokens).toEqual({ input: 300, output: 60, cacheRead: 0, cacheCreate: 0 })
  })

  it('tient des comptes distincts pour deux runs du même agent', async () => {
    const { subagents } = await load()
    expect(runOf(subagents, 'async1').tokens.input).toBe(60)
    expect(runOf(subagents, 'async2').tokens.input).toBe(70)
  })

  /**
   * L'invariant dont dépend tout le partitionnement en pistes : ce que les runs
   * annoncent est exactement ce que le flux porte. S'il se rompait, un événement
   * pourrait n'apparaître dans aucune vue.
   */
  it('annonce exactement les événements que le flux porte', async () => {
    const { subagents, events } = await load()
    const announced = subagents.reduce((n, r) => n + r.events, 0)
    expect(announced).toBe(events.filter((e) => e.agentId).length)

    const seen = new Set(events.flatMap((e) => (e.agentId ? [e.agentId] : [])))
    expect([...seen].sort()).toEqual(subagents.map((r) => r.agentId).sort())
  })

  it('laisse le fil principal à ses propres tours', async () => {
    const { events } = await load()
    expect(events.filter((e) => !e.agentId)).toHaveLength(8)
  })
})

describe('la liste des runs', () => {
  it('se lit dans l’ordre du temps, quelle que soit la profondeur', async () => {
    const { subagents } = await load()
    expect(subagents.map((r) => r.agentId)).toEqual(['sync1', 'nested', 'async1', 'async2', 'failed1', 'flight', 'orphan'])
    // `nested` est un agent lancé par un agent : le disque le range en dernier,
    // le temps le range deuxième. C'est le temps qui commande ici.
    expect(runOf(subagents, 'nested').spawnDepth).toBe(2)
  })

  it('garde le lien vers l’appel qui a lancé le run', async () => {
    const { subagents } = await load()
    expect(runOf(subagents, 'sync1').toolUseId).toBe('toolu_a1')
    expect(runOf(subagents, 'sync1').description).toBe('Explorer le code')
    // Un agent lancé par un agent s'apparie à l'appel fait *dans* un sidecar.
    expect(runOf(subagents, 'nested').toolUseId).toBe('toolu_nested')
  })

  /** Un sidecar de pure télémétrie n'a aucun tour : une piste vide au clic. */
  it('n’ouvre pas de piste pour un run dont aucune ligne n’a survécu', async () => {
    const { subagents } = await load()
    expect(subagents.some((r) => r.agentId === 'ghost')).toBe(false)
    expect(subagents.every((r) => r.events > 0)).toBe(true)
  })

  it('reste vide quand la session n’a lancé aucun agent', async () => {
    const basic = fileURLToPath(new URL('./fixtures/basic.jsonl', import.meta.url))
    const { subagents } = await parseTranscript(basic, 'basic')
    expect(subagents).toEqual([])
  })
})

/**
 * L'autre forme de la notification de fin, et sa propre fixture.
 *
 * Un agent qui rend la main pendant que la session travaille n'écrit pas de
 * ligne `user` : sa notification passe par la file des messages et ressort en
 * `attachment.queued_command`. Le parseur ne lisait que la première forme, et
 * ces runs-là restaient « au travail » pour toujours — rapport rendu, carte
 * animée, aucune coche à la piste. Moitié du corpus.
 *
 * Fixture à part plutôt qu'un huitième run dans `tracks` : celle-ci porte des
 * comptes en clair qu'un ajout ferait tous bouger.
 */
describe('une notification arrivée par la file des messages', () => {
  const load = () => parseTranscript(fileURLToPath(new URL('./fixtures/notif-queued.jsonl', import.meta.url)), 'notif-queued')

  it('termine le run qu’elle nomme', async () => {
    const { subagents } = await load()
    const q1 = runOf(subagents, 'q1')
    expect(q1.status).toBe('completed')
    expect(q1.endedAt).toBe(q1.lastActivityAt)
  })

  it('rend le rapport de l’agent sur le fil principal', async () => {
    const { events } = await load()
    const report = events.find((e) => e.origin === 'task-notification')
    expect(report?.blocks).toEqual([
      expect.objectContaining({
        kind: 'task_notification',
        taskId: 'q1',
        status: 'completed',
        text: 'Voici la cartographie complète.',
      }),
    ])
    // Le rapport parle du fil principal : il ne doit pas atterrir dans la piste.
    expect(report?.agentId).toBeUndefined()
  })
})
