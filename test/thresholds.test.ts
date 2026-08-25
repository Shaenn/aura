// La calibration des seuils.
//
// Deux moitiés indépendantes. Les percentiles et la mécanique `max(parc,
// garde-fou)` se démontrent sur des tableaux nus, sans corpus : ce sont elles qui
// portent la logique, et elles doivent tenir sur n'importe quelle machine. Le
// reste vérifie que, branchée sur le vrai parc, la calibration ne désigne ni tout
// le monde ni personne.

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSignals, type SessionSignal } from '../server/diagnostics/signals.ts'
import {
  MIN_SAMPLE,
  METRIC_NAMES,
  calibrate,
  calibrateFrom,
  exceeds,
  percentile,
  valueOf,
  type MetricMeta,
} from '../server/diagnostics/thresholds.ts'

const HAS_CORPUS = existsSync(join(homedir(), '.claude', 'projects'))
const TIMEOUT = 300_000

const HIGH: MetricMeta = {
  label: 'test',
  help: 'test',
  guardBasis: 'test',
  unit: 'usd',
  direction: 'high',
  rank: 0.9,
  guard: 0,
}
const LOW: MetricMeta = {
  label: 'test',
  help: 'test',
  guardBasis: 'test',
  unit: 'ratio',
  direction: 'low',
  rank: 0.1,
  guard: 1,
}

/** `n` valeurs 1..n — un parc parfaitement étalé, aux percentiles connus. */
const spread = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1)

describe('percentiles', () => {
  it('rend les bornes aux rangs extrêmes', () => {
    expect(percentile([1, 2, 3, 4], 0)).toBe(1)
    expect(percentile([1, 2, 3, 4], 1)).toBe(4)
  })

  it('interpole entre deux statistiques d’ordre', () => {
    // Rang 0.5 sur [10, 20, 30] tombe pile sur 20 ; 0.25 à mi-chemin de 10 et 20.
    expect(percentile([10, 20, 30], 0.5)).toBe(20)
    expect(percentile([10, 20, 30], 0.25)).toBe(15)
  })

  it('survit au tableau vide et au singleton', () => {
    expect(percentile([], 0.9)).toBe(0)
    expect(percentile([42], 0.9)).toBe(42)
  })
})

describe('calibration', () => {
  it('retient le percentile quand le parc est étalé', () => {
    const c = calibrateFrom('m', HIGH, spread(100))
    expect(c.calibrated).toBe(true)
    expect(c.bound).toBe('percentile')
    expect(c.value).toBeCloseTo(90.1, 1)
    // Un P90 désigne le décile supérieur, ni plus ni moins.
    expect(c.hits).toBe(10)
  })

  it('retient le garde-fou quand le parc est sain', () => {
    // Cent sessions à quelques centimes : le décile le moins bon ne vaut rien.
    const c = calibrateFrom(
      'm',
      { ...HIGH, guard: 5 },
      spread(100).map((v) => v / 100),
    )
    expect(c.bound).toBe('guard')
    expect(c.value).toBe(5)
    expect(c.hits).toBe(0)
  })

  it('ne laisse jamais un garde-fou créer une alerte', () => {
    // La propriété qui rend les constantes écrites à la main tolérables : monter
    // le garde-fou ne peut que réduire le nombre de sessions désignées.
    const values = spread(100)
    let previous = Infinity
    for (const guard of [0, 50, 90, 95, 200]) {
      const hits = calibrateFrom('m', { ...HIGH, guard }, values).hits
      expect(hits).toBeLessThanOrEqual(previous)
      previous = hits
    }
    expect(previous).toBe(0)
  })

  it('refuse de calibrer sous l’échantillon minimum', () => {
    const c = calibrateFrom('m', { ...HIGH, guard: 5 }, spread(MIN_SAMPLE - 1))
    expect(c.calibrated).toBe(false)
    expect(c.percentile).toBeNull()
    // Le garde-fou parle seul : c'est la position prudente.
    expect(c.value).toBe(5)
    expect(c.bound).toBe('guard')
  })

  it('calibre à l’envers un signal où plus bas est pire', () => {
    // Un parc entre 0,01 et 1,00 : le décile le plus bas est bien en dessous du
    // plafond, donc c'est lui qui décide.
    const c = calibrateFrom(
      'm',
      { ...LOW, guard: 0.9 },
      spread(100).map((v) => v / 100),
    )
    expect(c.bound).toBe('percentile')
    expect(c.value).toBeLessThan(0.2)
    // Le décile inférieur, symétrique des 10 du cas « plus haut est pire ».
    expect(c.hits).toBe(10)

    // Le même parc, mais un plafond très bas : il ne peut que faire taire.
    expect(
      calibrateFrom(
        'm',
        { ...LOW, guard: 0.005 },
        spread(100).map((v) => v / 100),
      ).hits,
    ).toBe(0)
  })

  it('chiffre ce que le garde-fou fait taire', () => {
    // Un parc 1..100 dont chaque session coûte un dollar : le P90 vaut 90,1, un
    // plancher à 95 tue donc la bande ]90,1 ; 95] — les valeurs 91 à 95.
    const values = spread(100)
    const c = calibrateFrom(
      'm',
      { ...HIGH, guard: 95 },
      values,
      undefined,
      values.map(() => 1),
    )
    expect(c.bound).toBe('guard')
    // `orphans` reste nul ici : le savoir demande les autres signaux, que ce
    // niveau ne connaît pas — c'est `calibrate` qui le remplit.
    expect(c.silenced).toEqual({ sessions: 5, cost: 5, orphans: null })
    expect(c.hits).toBe(5)
    expect(c.hitsCost).toBe(5)

    // Quand le parc décide, il n'y a rien à taire.
    expect(
      calibrateFrom(
        'm',
        HIGH,
        values,
        undefined,
        values.map(() => 1),
      ).silenced,
    ).toBeNull()

    // Sans coûts fournis, on publie `null` plutôt qu'un zéro qui se lirait
    // « ne coûte rien ».
    const nu = calibrateFrom('m', { ...HIGH, guard: 95 }, values)
    expect(nu.hitsCost).toBeNull()
    expect(nu.silenced).toEqual({ sessions: 5, cost: null, orphans: null })
  })

  it('rend inerte un plafond posé au-dessus du percentile inversé', () => {
    // Le piège qui a laissé `turnsPerPrompt` avec un garde-fou de 8 pendant que
    // son P10 valait 3,5 : sur un signal inversé le seuil est un `min`, donc un
    // plancher *au-dessus* du percentile ne s'applique jamais — il ressemble à un
    // réglage et n'en est pas un. Pour agir, il doit passer en dessous.
    const values = spread(100).map((v) => v / 100)
    const inerte = calibrateFrom('m', { ...LOW, guard: 0.9 }, values)
    const nu = calibrateFrom('m', { ...LOW, guard: 1 }, values)
    expect(inerte.value).toBe(nu.value)
    expect(inerte.hits).toBe(nu.hits)
    expect(inerte.bound).toBe('percentile')

    // Le même plafond passé sous le percentile : là, il fait taire.
    const actif = calibrateFrom('m', { ...LOW, guard: 0.05 }, values)
    expect(actif.bound).toBe('guard')
    expect(actif.hits).toBeLessThan(inerte.hits)
  })

  it('laisse un seuil imposé primer sur tout', () => {
    const c = calibrateFrom('m', { ...HIGH, guard: 5 }, spread(100), 42)
    expect(c.value).toBe(42)
    expect(c.hits).toBe(58)
    // On publie quand même ce qu'on aurait proposé.
    expect(c.percentile).toBeCloseTo(90.1, 1)
  })

  it('ne compte pas comme un signal une session qui ne le porte pas', () => {
    // Un parc uniforme n'a pas de décile coupable : personne ne dépasse.
    const c = calibrateFrom(
      'm',
      HIGH,
      Array.from({ length: 50 }, () => 7),
    )
    expect(c.hits).toBe(0)
    expect(c.quantiles.p50).toBe(7)
  })
})

describe.skipIf(!HAS_CORPUS)('calibration sur le vrai parc', () => {
  let signals: SessionSignal[] = []

  it(
    'calibre chaque signal',
    async () => {
      ;({ signals } = await getSignals())
      const t = calibrate(signals)
      expect(Object.keys(t.metrics).sort()).toEqual([...METRIC_NAMES].sort())
      for (const name of METRIC_NAMES) {
        const c = t.metrics[name]
        expect(c.value).toBeGreaterThan(0)
        expect(c.hits).toBeLessThanOrEqual(c.sampleSize)
        // Un signal calibré désigne au plus le décile ; jamais la moitié du parc.
        if (c.calibrated) expect(c.hits).toBeLessThanOrEqual(Math.ceil(c.sampleSize / 2))
      }
    },
    TIMEOUT,
  )

  it('accorde `exceeds` avec le compte de `hits`', () => {
    const t = calibrate(signals)
    for (const name of METRIC_NAMES) {
      const c = t.metrics[name]
      const counted = signals.filter((s) => exceeds(c, valueOf(name, s))).length
      expect(counted).toBe(c.hits)
    }
  })

  it('n’échantillonne pas une session d’analyse sur un ratio qu’elle n’a pas', () => {
    // Une session qui n'a rien modifié n'a pas de « explorations par
    // modification ». Lui en donner un — infini, ou zéro — ferait dire au seuil
    // ce que la session ne prétendait pas faire.
    const sansProduction = signals.filter((s) => s.families.productionCalls === 0)
    const t = calibrate(signals)
    expect(t.metrics.explorationRatio.sampleSize).toBeLessThanOrEqual(signals.length - sansProduction.length)
    expect(Number.isFinite(t.metrics.explorationRatio.quantiles.max)).toBe(true)

    // Le signal à l'envers : son seuil est *sous* la médiane du parc, sans quoi
    // il désignerait la moitié des sessions.
    const perPrompt = t.metrics.turnsPerPrompt
    expect(perPrompt.direction).toBe('low')
    expect(perPrompt.value).toBeLessThanOrEqual(perPrompt.quantiles.p50)
  })

  it('n’échantillonne que les sessions qui portent le signal', () => {
    const t = calibrate(signals)
    // Les compactions sont rares : leur échantillon doit être bien plus petit que
    // le parc, sinon les 500 sessions sans compaction sont comptées comme des
    // zéros et le seuil s'effondre.
    expect(t.metrics.compactionWaste.sampleSize).toBeLessThan(signals.length / 2)
    expect(t.metrics.compactionWaste.quantiles.min).toBeGreaterThan(0)
  })
})
