// La bulle éphémère montrée pendant qu'un tour travaille.
//
// Deux choses se testent ici et nulle part ailleurs : ce que la ligne dit d'une
// activité, et le rythme auquel elle est réémise. Le rythme n'est pas un détail
// — un brouillon expire au bout de trente secondes, et une phase d'outil change
// toutes les deux ou trois. Entre les deux, il y a une décision.

import { describe, expect, it, vi } from 'vitest'
import { BATTEMENT_MS, Battement, ligne, PAS_MINIMAL_MS } from '../server/passerelle/activite.ts'
import { IDLE_ACTIVITY, type AgentActivity } from '../shared/agent.ts'

const T0 = 1_700_000_000_000

function activite(partiel: Partial<AgentActivity>): AgentActivity {
  return {
    ...IDLE_ACTIVITY,
    turnStartedAt: T0,
    ...partiel,
  }
}

describe('ligne', () => {
  it('ne dit rien au repos', () => {
    expect(ligne(IDLE_ACTIVITY, T0)).toBeNull()
  })

  it('nomme la phase quand elle n’a pas d’outil', () => {
    expect(ligne(activite({ phase: 'thinking' }), T0)).toBe('Réflexion')
  })

  it('se tait sur la durée pendant les premières secondes', () => {
    // Un chrono qui démarre à « 1 s » n'apprend rien et attire l'œil sur le seul
    // moment où il n'y a rien à s'expliquer.
    expect(ligne(activite({ phase: 'writing' }), T0 + 3_000)).toBe('Rédaction')
    expect(ligne(activite({ phase: 'writing' }), T0 + 12_000)).toBe('Rédaction — 12 s')
  })

  it('compte la durée du tour, pas celle de la phase', () => {
    // `since` bouge à chaque phase ; `turnStartedAt` répond à « depuis combien
    // de temps ça mouline », qui est la question qu'on se pose vraiment.
    const a = activite({ phase: 'requesting', since: T0 + 90_000 })
    expect(ligne(a, T0 + 95_000)).toBe('Requête en cours — 1 min 35 s')
  })

  it('se nomme de ses outils, et compte au-delà de deux', () => {
    function outil(name: string) {
      return { id: name, name, startedAt: T0 }
    }
    expect(ligne(activite({ phase: 'tool', tools: [outil('Read')] }), T0)).toBe('Read')
    expect(ligne(activite({ phase: 'tool', tools: [outil('Read'), outil('Bash'), outil('Grep')] }), T0)).toBe('Read, Bash +1')
  })

  it('dit le rang d’une nouvelle tentative', () => {
    const a = activite({
      phase: 'retrying',
      retry: { attempt: 2, maxRetries: 5, delayMs: 4_000 },
    })
    expect(ligne(a, T0)).toBe('Nouvelle tentative 2/5')
  })
})

describe('Battement', () => {
  function monte() {
    const emis: string[] = []
    const saisies: number[] = []
    const battement = new Battement(
      {
        brouillon: (_chat, _draft, texte) => {
          emis.push(texte)
          return Promise.resolve()
        },
        saisie: (chat) => {
          saisies.push(chat)
          return Promise.resolve()
        },
      },
      42,
      7,
    )
    return { emis, saisies, battement }
  }

  it('émet la première activité tout de suite, et signale la saisie', () => {
    const { emis, saisies, battement } = monte()
    battement.montre(activite({ phase: 'thinking' }), T0)
    expect(emis).toEqual(['Réflexion'])
    // Le brouillon ne s'affiche qu'en conversation privée et sur mobile ;
    // l'action de saisie, elle, passe partout. Les deux vont ensemble.
    expect(saisies).toEqual([42])
    battement.arrete()
  })

  it('ne réémet pas un texte inchangé', () => {
    const { emis, battement } = monte()
    const a = activite({ phase: 'writing' })
    battement.montre(a, T0)
    battement.montre(a, T0 + PAS_MINIMAL_MS + 1)
    expect(emis).toEqual(['Rédaction'])
    battement.arrete()
  })

  it('borne le rythme d’un libellé qui change trop vite', () => {
    // Une phase d'outil se remplace toutes les deux ou trois secondes : suivre
    // chaque changement ferait une requête par seconde pour un gain nul.
    const { emis, battement } = monte()
    function outil(name: string) {
      return { id: name, name, startedAt: T0 }
    }
    battement.montre(activite({ phase: 'tool', tools: [outil('Read')] }), T0)
    battement.montre(activite({ phase: 'tool', tools: [outil('Grep')] }), T0 + 200)
    battement.montre(activite({ phase: 'tool', tools: [outil('Bash')] }), T0 + 400)
    expect(emis).toEqual(['Read'])
    battement.arrete()
  })

  it('tient la bulle en vie avant qu’elle n’expire', async () => {
    vi.useFakeTimers()
    try {
      const { emis, battement } = monte()
      battement.montre(activite({ phase: 'thinking' }), T0)
      expect(emis).toHaveLength(1)
      // Trente secondes est l'expiration ; le battement doit tomber avant.
      await vi.advanceTimersByTimeAsync(BATTEMENT_MS + 100)
      expect(emis).toHaveLength(2)
      battement.arrete()
      await vi.advanceTimersByTimeAsync(BATTEMENT_MS * 3)
      expect(emis).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('s’arrête de lui-même quand l’activité retombe au repos', () => {
    const { emis, battement } = monte()
    battement.montre(activite({ phase: 'thinking' }), T0)
    battement.montre(IDLE_ACTIVITY, T0 + 10_000)
    expect(emis).toEqual(['Réflexion'])
  })
})
