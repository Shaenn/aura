// Les deux bornes du parc de sessions.
//
// Une session de l'Atelier est un processus `claude` entier. Rien ne limitait ni
// leur nombre ni leur durée de vie : le registre créait à la demande, et sa
// promesse — une session survit à la fermeture de son onglet — n'avait pas de
// terme. Une session ouverte puis abandonnée tenait donc son processus jusqu'à
// l'extinction du serveur, et rien n'empêchait d'en empiler dix.
//
// Ce qui compte ici : que le plafond refuse, que le balayeur ramasse ce que plus
// personne ne regarde, et surtout qu'il ne ramasse *que* cela — un tour de vingt
// minutes et un onglet ouvert sont deux raisons de vivre.
//
// Aucun test n'envoie de tour : le runner ne lance son processus qu'au premier
// `send()`, et ces bornes se vérifient toutes avant.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { atCapacity, countSessions, createRunner, IDLE_TTL_MS, MAX_SESSIONS, stopAll, sweep } from '../server/agent/registry.ts'

const CWD = import.meta.dirname

const open = (): ReturnType<typeof createRunner> => createRunner({ cwd: CWD })

/** Fait passer le temps sans rien exécuter : seule l'horloge de `touchedAt` compte. */
const laisserPasser = (ms: number): void => {
  vi.setSystemTime(Date.now() + ms)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  stopAll()
  vi.useRealTimers()
})

describe('plafond du parc', () => {
  it('accepte jusqu’au plafond, et pas une de plus', () => {
    expect(atCapacity()).toBe(false)

    for (let i = 0; i < MAX_SESSIONS; i++) open()

    expect(countSessions()).toBe(MAX_SESSIONS)
    expect(atCapacity()).toBe(true)
  })

  it('rouvre dès qu’une place se libère — c’est un plafond, pas un verrou', () => {
    const premiers = Array.from({ length: MAX_SESSIONS }, open)
    expect(atCapacity()).toBe(true)

    // Ce que fait la route `DELETE` : le registre oublie, le runner se coupe.
    stopAll()

    expect(atCapacity()).toBe(false)
    expect(premiers).toHaveLength(MAX_SESSIONS)
  })
})

describe('balayeur d’inactivité', () => {
  it('ramasse la session que personne ne regarde plus', () => {
    const abandonnée = open()

    laisserPasser(IDLE_TTL_MS + 1)

    expect(sweep()).toEqual([abandonnée.session.runId])
    expect(countSessions()).toBe(0)
  })

  it('garde celle qu’un onglet regarde, si vieille soit-elle', () => {
    // Le flux protège sans réserve, et c'est assumé : un onglet d'arrière-plan
    // garde sa socket ouverte alors que le navigateur a gelé la page, et couper
    // la session de quelqu'un qui revient d'un autre onglet coûterait plus cher
    // que la place occupée — que `MAX_SESSIONS` borne, et qu'un geste libère.
    const regardée = open()
    regardée.subscribe(() => {})

    laisserPasser(IDLE_TTL_MS * 100)

    expect(sweep()).toEqual([])
    expect(countSessions()).toBe(1)
  })

  it('garde celle qui travaille : un tour long n’est pas un abandon', () => {
    const occupée = open()
    // Le statut qu'un `send()` poserait, sans lancer le processus qu'il lancerait.
    occupée.session.status = 'working'

    laisserPasser(IDLE_TTL_MS + 1)

    expect(sweep()).toEqual([])
    expect(countSessions()).toBe(1)
  })

  it('repart de zéro quand le dernier onglet se ferme, pas quand il s’est ouvert', () => {
    const runner = open()
    const partir = runner.subscribe(() => {})

    // Une heure passée sous les yeux de quelqu'un : l'abonnement seul la protège.
    laisserPasser(IDLE_TTL_MS * 2)
    partir()

    // Le départ vient de remettre l'horloge à l'heure : rien à ramasser encore.
    expect(sweep()).toEqual([])

    laisserPasser(IDLE_TTL_MS + 1)
    expect(sweep()).toEqual([runner.session.runId])
  })

  it('ne touche pas à celle dont le délai n’est pas écoulé', () => {
    open()

    laisserPasser(IDLE_TTL_MS - 1000)

    expect(sweep()).toEqual([])
    expect(countSessions()).toBe(1)
  })
})
