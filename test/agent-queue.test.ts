// La file d'entrée de l'Atelier, et ce qu'elle fait d'un consommateur parti.
//
// Le cas qui a motivé ces tests : une session qui meurt puis repart ouvre un
// second `for await` sur la même file. Le premier, suspendu sur sa promesse,
// restait inscrit comme destinataire — le prompt de la relance lui était remis,
// dans un générateur que plus personne ne tirait. Le message ne partait jamais
// et la session restait « au travail » pour toujours.

import { describe, expect, it } from 'vitest'
import { AsyncQueue } from '../server/agent/queue.ts'

/** Laisse tourner la boucle d'événements : les `await` en vol se posent. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** Consomme la file en arrière-plan et note ce qui lui parvient. */
function drain<T>(queue: AsyncQueue<T>): { seen: T[]; done: Promise<void> } {
  const seen: T[] = []
  const done = (async () => {
    for await (const item of queue) seen.push(item)
  })()
  return { seen, done }
}

describe('la file d’entrée', () => {
  it('remet ce qui était déjà là, puis ce qui arrive', async () => {
    const queue = new AsyncQueue<string>()
    queue.push('un')
    const { seen } = drain(queue)
    await tick()
    queue.push('deux')
    await tick()
    expect(seen).toEqual(['un', 'deux'])
  })

  it('rend la main au consommateur quand la file se ferme', async () => {
    const queue = new AsyncQueue<string>()
    const { seen, done } = drain(queue)
    await tick()
    queue.close()
    await done
    expect(seen).toEqual([])
  })

  it('ne remet plus rien à un consommateur abandonné', async () => {
    const queue = new AsyncQueue<string>()
    const premier = drain(queue)
    await tick()

    // La boucle du SDK est morte : elle ne referme pas forcément l'itérateur
    // qu'elle tenait, c'est le runner qui le déclare parti.
    queue.abandon()
    await premier.done

    queue.push('après la mort')
    await tick()
    expect(premier.seen).toEqual([])
  })

  it('remet au consommateur suivant le message poussé avant lui', async () => {
    const queue = new AsyncQueue<string>()
    const premier = drain(queue)
    await tick()
    queue.abandon()
    await premier.done

    // L'ordre est celui de `send()` : on pousse le prompt, puis on relance la
    // boucle. C'est exactement là que le message se perdait.
    queue.push('le tour de la reprise')
    const second = drain(queue)
    await tick()

    expect(premier.seen).toEqual([])
    expect(second.seen).toEqual(['le tour de la reprise'])
  })

  it('reste ouverte après un abandon, là où `close` la ferme', async () => {
    const queue = new AsyncQueue<string>()
    const premier = drain(queue)
    await tick()
    queue.abandon()
    await premier.done

    queue.push('encore vivante')
    const second = drain(queue)
    await tick()
    expect(second.seen).toEqual(['encore vivante'])
  })

  it('n’accepte plus rien une fois fermée', async () => {
    const queue = new AsyncQueue<string>()
    queue.close()
    queue.push('trop tard')
    const { seen, done } = drain(queue)
    await done
    expect(seen).toEqual([])
  })
})
