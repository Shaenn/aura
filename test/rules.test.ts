// Les règles de diagnostic.
//
// Deux moitiés, comme pour les seuils. Sur relevés fabriqués, on démontre ce
// qu'aucun corpus ne garantit : qu'une règle se tait quand elle doit se taire,
// que la gravité suit le dépassement, qu'un identifiant survit à un changement de
// mesure. Sur le vrai parc, on vérifie qu'elle ne noie pas l'utilisateur.

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detect, RULE_NAMES, type Finding } from '../server/diagnostics/rules.ts'
import { getSignals, type SessionSignal } from '../server/diagnostics/signals.ts'
import { calibrate } from '../server/diagnostics/thresholds.ts'
import { CONTEXT_CATEGORIES, type ContextCategory } from '../shared/context.ts'

const HAS_CORPUS = existsSync(join(homedir(), '.claude', 'projects'))
const TIMEOUT = 300_000

// ── Relevés fabriqués ────────────────────────────────────────────────────────

function zeroCategories(): Record<ContextCategory, number> {
  const out = {} as Record<ContextCategory, number>
  for (const c of CONTEXT_CATEGORIES) out[c] = 0
  return out
}

/** Un relevé neutre : aucune règle ne doit rien y trouver. */
function signal(index: number, over: Partial<SessionSignal> = {}): SessionSignal {
  return {
    sessionId: `session-${String(index).padStart(4, '0')}-aaaaaaaa`,
    project: 'projet',
    branch: 'main',
    firstTs: '2026-01-01T00:00:00.000Z',
    lastTs: '2026-01-01T01:00:00.000Z',
    firstDay: '2026-01-01',
    turns: 20,
    subagentTurns: 0,
    sidechainTurns: 0,
    tokens: { input: 1_000, output: 1_000, cacheRead: 100_000, cacheCreate: 1_000 },
    cost: 0.5,
    cacheHitRatio: 0.98,
    cacheReadCost: 0.05,
    cacheCreateCost: 0.01,
    inputCost: 0.01,
    models: [],
    unpricedModels: [],
    peakContext: 50_000,
    firstTurnContext: 26_000,
    compactions: [],
    subagents: [],
    tools: [],
    toolErrors: 0,
    imageTokens: 0,
    byCategory: zeroCategories(),
    topInjections: [],
    // Une session neutre travaille sainement : elle construit autant qu'elle
    // cherche, prend ses tâches d'un bloc, et n'a rien relu.
    families: {
      explorationCalls: 12,
      explorationErrors: 0,
      explorationTokens: 20_000,
      productionCalls: 12,
      productionErrors: 0,
      productionTokens: 5_000,
    },
    userTurns: 1,
    interruptions: 0,
    rereadCalls: 0,
    rereadTokens: 0,
    contextLimit: 200_000,
    files: 1,
    ...over,
  }
}

/** Un parc sain, assez grand pour que les percentiles se calculent. */
function healthy(n = 60): SessionSignal[] {
  return Array.from({ length: n }, (_, i) => signal(i))
}

describe('orphelines', () => {
  it('sépare ce qu’un garde-fou tait de ce qu’il fait disparaître', () => {
    // Un parc qui relit un peu — il faut 30 porteurs pour qu'un percentile
    // existe — plus deux sessions qui relisent beaucoup. La première ne fait que
    // cela ; la seconde coûte aussi très cher, donc `sessionCost` la désignera de
    // toute façon. Toutes deux se logent dans la bande que le garde-fou de
    // `rereadTokens` (20 000) tait au-dessus du P90 du parc (1 000).
    const signals = Array.from({ length: 60 }, (_, i) => signal(i, { rereadTokens: 1_000 }))
    signals.push(signal(900, { rereadTokens: 15_000 }))
    signals.push(signal(901, { rereadTokens: 15_000, cost: 400, cacheReadCost: 300 }))

    const silenced = calibrate(signals).metrics.rereadTokens.silenced
    expect(silenced?.sessions).toBe(2)
    // Une seule disparaît vraiment : l'autre reste visible sous « coût ».
    expect(silenced?.orphans?.sessions).toBe(1)
    expect(silenced?.orphans?.cost).toBeCloseTo(0.5, 5)
  })
})

describe('règles', () => {
  it('ne dit rien d’un parc sain', () => {
    const signals = healthy()
    expect(detect(signals, calibrate(signals))).toEqual([])
  })

  it('désigne la session qui sort du lot, et elle seule', () => {
    const signals = healthy()
    signals.push(signal(999, { cost: 120, cacheReadCost: 110 }))

    const findings = detect(signals, calibrate(signals))
    const relu = findings.filter((f) => f.rule === 'historique-relu')
    expect(relu).toHaveLength(1)
    expect(relu[0]?.target).toBe(signals[signals.length - 1]?.sessionId)
    expect(relu[0]?.impact.usd).toBe(110)
    expect(relu[0]?.impact.kind).toBe('measured')
  })

  it('gradue la sévérité sur le dépassement, sans constante par règle', () => {
    function at(cost: number): Finding | undefined {
      const signals = healthy()
      signals.push(signal(999, { cost: cost + 1, cacheReadCost: cost }))
      return detect(signals, calibrate(signals)).find((f) => f.rule === 'historique-relu')
    }
    // Le parc sain plafonne à 0,05 $, donc le garde-fou (3 $) décide du seuil.
    expect(at(3.2)?.severity).toBe('info')
    expect(at(4.5)?.severity).toBe('warn')
    expect(at(9)?.severity).toBe('critical')
  })

  it('garde le même identifiant quand la mesure change', () => {
    const one = detect([...healthy(), signal(999, { cost: 50, cacheReadCost: 40 })], calibrate(healthy())).find((f) => f.rule === 'historique-relu')
    const two = detect([...healthy(), signal(999, { cost: 90, cacheReadCost: 80 })], calibrate(healthy())).find((f) => f.rule === 'historique-relu')

    expect(one?.id).toBe(two?.id)
    expect(one?.impact.usd).not.toBe(two?.impact.usd)
  })

  it('tait un constat mis en liste d’exclusion', () => {
    const signals = [...healthy(), signal(999, { cost: 120, cacheReadCost: 110 })]
    const thresholds = calibrate(signals)
    const first = detect(signals, thresholds)
    const id = first[0]?.id as string

    const after = detect(signals, thresholds, { ignore: [id] })
    expect(after.some((f) => f.id === id)).toBe(false)
    expect(after).toHaveLength(first.length - 1)
  })

  it('respecte une règle désactivée', () => {
    const signals = [...healthy(), signal(999, { cost: 120, cacheReadCost: 110 })]
    const thresholds = calibrate(signals)
    const after = detect(signals, thresholds, { disabled: ['historique-relu'] })
    expect(after.some((f) => f.rule === 'historique-relu')).toBe(false)
  })

  it('ne convertit jamais des tokens en dollars', () => {
    const signals = healthy()
    signals.push(
      signal(999, {
        byCategory: { ...zeroCategories(), tools: 5_000_000 },
        tools: [
          {
            name: 'Read',
            tokens: 5_000_000,
            inputTokens: 100_000,
            outputTokens: 4_900_000,
            imageTokens: 0,
            calls: 500,
            errors: 0,
          },
        ],
      }),
    )

    const found = detect(signals, calibrate(signals)).find((f) => f.rule === 'outils-gourmands')
    expect(found?.impact.tokens).toBe(5_000_000)
    // Le poids d'un outil dans la fenêtre n'a pas de traduction honnête en
    // dollars : aucune ne doit apparaître.
    expect(found?.impact.usd).toBeUndefined()
    expect(found?.impact.kind).toBe('estimated')
  })

  it('ne signale le socle qu’à partir d’une accumulation', () => {
    // Trois sessions courtes : un accident, pas un motif.
    const few = [...healthy(), ...Array.from({ length: 3 }, (_, i) => signal(900 + i, { turns: 2 }))]
    expect(detect(few, calibrate(few)).some((f) => f.rule === 'socle-gaspille')).toBe(false)

    const many = [...healthy(), ...Array.from({ length: 25 }, (_, i) => signal(900 + i, { turns: 2, firstTurnContext: 60_000 }))]
    const found = detect(many, calibrate(many)).find((f) => f.rule === 'socle-gaspille')
    expect(found?.scope).toBe('global')
    expect(found?.metrics.sessions).toBe(25)
  })

  // ── Les règles de comportement ─────────────────────────────────────────────

  it('désigne une session qui cherche bien plus qu’elle ne construit', () => {
    const signals = healthy()
    signals.push(
      signal(999, {
        families: {
          explorationCalls: 90,
          explorationErrors: 0,
          explorationTokens: 400_000,
          productionCalls: 6,
          productionErrors: 0,
          productionTokens: 8_000,
        },
      }),
    )

    const found = detect(signals, calibrate(signals)).find((f) => f.rule === 'exploration-sans-fin')
    expect(found?.metrics.explorationRatio).toBe(15)
    // Ce qu'a coûté l'exploration en place dans la fenêtre — jamais un dollar.
    expect(found?.impact.tokens).toBe(400_000)
    expect(found?.impact.usd).toBeUndefined()
  })

  /**
   * Le test qui garde la règle à l'endroit.
   *
   * `turnsPerPrompt` est un signal où **plus bas est pire** : une session qui
   * enchaîne 23 tours sur un brief ne doit rien déclencher, une qui en fait 11
   * sur le même parc, si. C'est l'inverse de l'intuition, et c'est exactement
   * pour cela qu'un test le fige : une inversion accidentelle conseillerait le
   * contraire du bon geste sans que rien ne casse.
   */
  it('lit les tours par prompt à l’envers, et jamais dans l’autre sens', () => {
    // Seuil imposé pour se placer là où le corpus le met, sans dépendre du
    // garde-fou : sous 12 tours par prompt, on parle.
    const seuil = { turnsPerPrompt: 12 }

    const beaucoup = [...healthy(), signal(999, { turns: 92, userTurns: 4 })] // 23,0
    expect(detect(beaucoup, calibrate(beaucoup, seuil)).some((f) => f.rule === 'brief-morcele')).toBe(false)

    const morcele = [...healthy(), signal(999, { turns: 44, userTurns: 4 })] // 11,0
    const found = detect(morcele, calibrate(morcele, seuil)).find((f) => f.rule === 'brief-morcele')
    expect(found?.target).toBe('session-0999-aaaaaaaa')
    expect(found?.metrics.turnsPerPrompt).toBe(11)
    // Une manière de travailler n'a pas de facture : aucun chiffre n'est inventé.
    expect(found?.impact.usd).toBeUndefined()
    expect(found?.impact.tokens).toBeUndefined()
    expect(found?.impact.basis.length).toBeGreaterThan(20)
  })

  it('compte les réorientations et les relectures', () => {
    const signals = healthy()
    signals.push(signal(998, { interruptions: 9 }))
    signals.push(signal(997, { rereadCalls: 40, rereadTokens: 900_000 }))

    const findings = detect(signals, calibrate(signals))
    expect(findings.find((f) => f.rule === 'reorientations')?.metrics.interruptions).toBe(9)
    const relu = findings.find((f) => f.rule === 'relectures')
    expect(relu?.impact.tokens).toBe(900_000)
    expect(relu?.impact.kind).toBe('estimated')
  })

  it('rapporte la fenêtre à la limite du modèle, pas à un nombre en dur', () => {
    const signals = healthy()
    // La même fenêtre, deux limites : à 200 k elle est pleine, à 1 M elle ne
    // l'est pas. Sans `contextLimit`, la règle dirait la même chose des deux.
    signals.push(signal(996, { peakContext: 190_000, contextLimit: 200_000 }))
    signals.push(signal(995, { peakContext: 190_000, contextLimit: 1_000_000 }))

    const found = detect(signals, calibrate(signals)).filter((f) => f.rule === 'fenetre-proche-limite')
    expect(found).toHaveLength(1)
    expect(found[0]?.target).toBe('session-0996-aaaaaaaa')
    expect(found[0]?.metrics.contextFill).toBeCloseTo(0.95, 2)
  })

  it('se tait sur le rythme quand on ne le lui donne pas', () => {
    const signals = healthy()
    const findings = detect(signals, calibrate(signals))
    expect(findings.some((f) => f.rule === 'rythme-5h')).toBe(false)
    expect(findings.some((f) => f.rule === 'sessions-paralleles')).toBe(false)
  })

  it('classe les dollars avant les tokens, et les graves avant tout', () => {
    const signals = healthy()
    signals.push(signal(900, { cost: 30, cacheReadCost: 25 }))
    signals.push(
      signal(901, {
        byCategory: { ...zeroCategories(), tools: 9_000_000 },
        tools: [
          {
            name: 'Read',
            tokens: 9_000_000,
            inputTokens: 0,
            outputTokens: 9_000_000,
            imageTokens: 0,
            calls: 10,
            errors: 0,
          },
        ],
      }),
    )

    const findings = detect(signals, calibrate(signals))
    const ranks = { info: 0, warn: 1, critical: 2 }
    for (let i = 1; i < findings.length; i++) {
      const a = findings[i - 1] as Finding
      const b = findings[i] as Finding
      expect(ranks[a.severity]).toBeGreaterThanOrEqual(ranks[b.severity])
      if (a.severity === b.severity && b.impact.usd !== undefined) {
        expect(a.impact.usd).toBeDefined()
      }
    }
  })
})

describe.skipIf(!HAS_CORPUS)('règles sur le vrai parc', () => {
  it(
    'reste lisible : aucune règle ne noie l’utilisateur',
    async () => {
      const { signals } = await getSignals()
      const findings = detect(signals, calibrate(signals))

      expect(findings.length).toBeGreaterThan(0)
      const byRule = new Map<string, number>()
      for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1)

      for (const [rule, n] of byRule) {
        // Une règle qui désigne plus d'un cinquième du parc ne désigne plus rien.
        expect(n, `${rule} : ${n} constats`).toBeLessThanOrEqual(signals.length / 5)
      }
      // Toute règle déclenchée est une règle connue.
      for (const rule of byRule.keys()) expect(RULE_NAMES).toContain(rule)
    },
    TIMEOUT,
  )

  it(
    'accompagne chaque constat de sa provenance',
    async () => {
      const { signals } = await getSignals()
      for (const f of detect(signals, calibrate(signals))) {
        expect(f.impact.basis.length).toBeGreaterThan(20)
        // Un chiffre, quand il existe, est strictement positif — un `0` se lirait
        // « gratuit » alors qu'il signifie « pas de tarif connu ». Et il peut
        // manquer : « cette tâche a été donnée en morceaux » ne se chiffre pas,
        // et lui coller le coût de la session lui attribuerait une facture
        // qu'elle n'a pas causée.
        if (f.impact.usd !== undefined) expect(f.impact.usd).toBeGreaterThan(0)
        if (f.impact.tokens !== undefined) expect(f.impact.tokens).toBeGreaterThan(0)
        // Une session désignée doit être atteignable : projet + identifiant.
        if (f.scope === 'session') {
          expect(f.project).not.toBe('')
          expect(f.target).not.toBe('')
        }
      }
    },
    TIMEOUT,
  )
})
