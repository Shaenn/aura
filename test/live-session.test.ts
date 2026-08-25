// Ce qui fait qu'une session compte encore comme vivante.
//
// La page de stream ne déduit pas l'activité d'un transcript : elle lit les
// fichiers de `~/.claude/sessions`, qu'un CLI écrit en démarrant. Mais lui seul
// les efface, et seulement s'il sort de lui-même. Un processus tué — ou coupé au
// milieu d'un tour, ce que fait désormais l'arrêt d'une session d'Atelier —
// laisse le sien derrière lui.
//
// Sans le filtre figé ici, ce fichier restait une session en activité à l'écran
// pour toujours. C'est exactement le fantôme observé : trois fichiers sur le
// disque, un seul processus réel.

import { describe, expect, it } from 'vitest'
import { alive } from '../server/maintenance.ts'

describe('alive', () => {
  it('reconnaît un processus qui tourne', () => {
    expect(alive(process.pid)).toBe(true)
  })

  it('écarte un PID qui ne désigne plus rien', () => {
    // Au-delà du maximum de Windows comme de Linux : aucun processus ne peut
    // porter ce numéro, donc le cas est stable et n'attend la mort de personne.
    expect(alive(2 ** 31 - 1)).toBe(false)
  })

  it('garde une entrée sans PID plutôt que de la faire disparaître', () => {
    // On ne peut rien conclure : mieux vaut une session de trop qu'un écran qui
    // efface en silence ce qu'il ne sait pas expliquer.
    expect(alive(undefined)).toBe(true)
    expect(alive(0)).toBe(true)
  })
})
