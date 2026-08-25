// Ce que l'accumulateur de contexte doit tenir, sur des transcripts figés.
//
// Les fixtures de `test/fixtures/` sont écrites à la main, jamais extraites d'une
// vraie session : un transcript réel porte le code, les chemins et parfois les
// secrets de son auteur, et ce dépôt est poussé. Leurs formes reproduisent celles
// relevées sur le corpus (`attachment.type`, appariement `tool_use`/`tool_result`,
// `compact_boundary`, sidecars de sous-agents) ; leurs contenus sont du
// remplissage de longueur choisie, ce qui suffit : `estimateTokens` ne regarde
// que la longueur.
//
// Les nombres attendus sont écrits en clair. S'ils changent, c'est que le modèle
// a changé — et il faut alors relire ce fichier, pas l'ajuster.

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contextLimitFor } from '../server/context.ts'
import { t } from '../server/i18n/index.ts'
import { parseTranscript } from '../server/transcript.ts'
import { CONTEXT_CATEGORIES, turnDeltas, type TurnContext } from '../shared/context.ts'
import { cardContext } from '../src/components/replay/contextRows.ts'

const fixture = (name: string): string => fileURLToPath(new URL(`./fixtures/${name}.jsonl`, import.meta.url))

const attributed = (turn: TurnContext): number => CONTEXT_CATEGORIES.reduce((sum, c) => sum + turn.byCategory[c], 0)

describe('basic — un tour, un Read, un Edit', () => {
  it('ancre chaque tour sur la fenêtre exacte que le harness a relevée', async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    expect(context.turns.map((t) => t.total)).toEqual([30_000, 35_000, 38_600])
  })

  it('déduit le socle du premier tour, et de lui seul', async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    const first = context.turns[0]!

    // 30 000 de fenêtre, moins le CLAUDE.md (100), la liste de skills (200) et le
    // message tapé (10) : ce que le harness y avait mis avant que rien n'arrive.
    expect(context.baseline).toBe(29_690)
    expect(context.baseline).toBe(first.total - attributed(first))
  })

  it("compte l'entrée d'un outil autant que sa sortie", async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    const tools = context.injections.filter((i) => i.category === 'tools')
    expect(tools).toHaveLength(2)

    // Un Read : presque rien à l'aller, tout au retour.
    expect(tools[0]).toMatchObject({ toolCount: 1, inputTokens: 6, outputTokens: 1000 })
    // Un Edit : l'inverse exact. Avant que les entrées soient comptées, cette
    // ligne pesait 5 tokens — la seule taille de son accusé de réception.
    expect(tools[1]).toMatchObject({ toolCount: 1, inputTokens: 314, outputTokens: 5 })
    expect(tools[1]!.inputTokens!).toBeGreaterThan(tools[1]!.outputTokens!)
  })

  it("n'estime jamais plus que la fenêtre exacte", async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    for (const turn of context.turns) {
      expect(attributed(turn)).toBeLessThanOrEqual(turn.total)
      expect(turn.unattributed).toBe(turn.total - attributed(turn))
    }
  })

  it('nomme les outils d’un tour, du plus lourd au plus léger', async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    const tools = context.injections.filter((i) => i.category === 'tools')
    // « 1 appel d'outil au tour 7 » ne dit pas lequel ; le détail, si.
    expect(tools[0]!.tools).toEqual([{ name: 'Read', tokens: 1006, count: 1, isError: false }])
    expect(tools[1]!.tools).toEqual([{ name: 'Edit', tokens: 319, count: 1, isError: false }])
  })

  it('sépare le raisonnement de la réponse', async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    const thinking = context.injections.filter((i) => i.category === 'thinking')
    // Le premier tour ne porte que du raisonnement ; le dernier, que du texte.
    // Seul le premier se raccourcit en demandant moins de réflexion.
    expect(thinking[0]).toMatchObject({ thinkingTokens: 50, textTokens: 0 })
    expect(thinking.at(-1)).toMatchObject({ thinkingTokens: 0, textTokens: 30 })
  })
})

describe('compacted — une compaction vide la fenêtre', () => {
  it('relève la compaction telle que le harness l’a écrite', async () => {
    const { context } = await parseTranscript(fixture('compacted'), 'compacted')
    expect(context.compactions).toHaveLength(1)
    expect(context.compactions[0]).toMatchObject({
      trigger: 'manual',
      preTokens: 38_600,
      postTokens: 9_000,
    })
  })

  it('repart de zéro après la frontière, sans oublier le socle', async () => {
    const { context } = await parseTranscript(fixture('compacted'), 'compacted')
    const after = context.turns.at(-1)!

    expect(after.phase).toBe(1)
    // Rien n'a encore été réinjecté : tout ce que la fenêtre contient est le
    // prompt système, les schémas d'outils et le résumé que le harness renvoie.
    expect(attributed(after)).toBe(0)
    expect(after.unattributed).toBe(9_000)

    // Le prompt système ne disparaît pas à la compaction : le socle est celui de
    // la session, pas celui de la phase.
    expect(context.baseline).toBe(29_690)
  })
})

describe('turnDeltas — ce que chaque tour ajoute, exact', () => {
  it('mesure la croissance depuis le socle au premier tour, puis de tour à tour', async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    const deltas = turnDeltas(context, 0)
    expect(deltas.map((d) => d.total)).toEqual([30_000, 35_000, 38_600])
    // Le premier tour ne part pas de zéro : sa croissance se mesure depuis le
    // socle (29 690), sinon il s'attribuerait toute la fenêtre de démarrage.
    expect(deltas[0]!.delta).toBe(30_000 - 29_690)
    expect(deltas[1]!.delta).toBe(5_000)
    expect(deltas[2]!.delta).toBe(3_600)
  })

  it('repart de la taille post-compaction, pas du socle, après une phase', async () => {
    const { context } = await parseTranscript(fixture('compacted'), 'compacted')
    const after = turnDeltas(context, 1)
    // La phase 1 s'ouvre à 12 000 (postTokens) ; son unique tour y est à 9 000.
    // Le premier tour d'une phase se mesure depuis ce point, pas depuis le socle.
    expect(context.compactions[0]!.postTokens).toBe(9_000)
    expect(after[0]!.delta).toBe(9_000 - 9_000)
  })

  it('reste dans l’ordre des tours, jamais trié par taille', async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    const idx = turnDeltas(context, 0).map((d) => d.turnIndex)
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  })
})

describe('cardContext — le contexte d’une carte du fil', () => {
  it('agrège la carte : bornes, fenêtre, croissance totale', async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    // La carte couvre les tours 0 à 2 (turnIndex 0..2).
    const card = cardContext(context, [0, 1, 2])!
    expect(card.turnStart).toBe(0)
    expect(card.turnEnd).toBe(2)
    expect(card.window).toBe(38_600) // fenêtre au dernier tour
    // Croissance = 310 (depuis le socle) + 5000 + 3600.
    expect(card.delta).toBe(310 + 5_000 + 3_600)
  })

  it('donne le détail par tour, indexé par l’uuid de la réponse', async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    const card = cardContext(context, [0, 1, 2])!
    const first = context.turns[0]!
    const detail = card.byUuid[first.uuid]!
    expect(detail.turnIndex).toBe(0)
    // Le détail ne montre que l'invisible : mémoire, skills, fichiers, harnais —
    // jamais un outil ou un raisonnement, déjà rendus dans le corps de la carte.
    expect(detail.rows.every((r) => r.category !== 'tools' && r.category !== 'thinking')).toBe(true)
    // Au tour 0 de `basic`, le CLAUDE.md et le catalogue de skills sont entrés.
    expect(detail.rows.some((r) => r.category === 'memory')).toBe(true)
    expect(detail.rows.every((r) => r.uuid === undefined)).toBe(true) // on est déjà sur la carte
  })

  it('renvoie null quand aucun tour ne correspond', async () => {
    const { context } = await parseTranscript(fixture('basic'), 'basic')
    expect(cardContext(context, [999])).toBeNull()
    expect(cardContext(context, [])).toBeNull()
  })
})

describe('mémoire — CLAUDE.md et règles chargées par glob', () => {
  it('capte une règle de .claude/rules, et la nomme comme telle', async () => {
    const { context } = await parseTranscript(fixture('rules'), 'rules')
    const memory = context.injections.filter((i) => i.category === 'memory')
    // Une règle chargée par glob arrive comme une mémoire ; sans label parlant
    // elle se confondait avec un CLAUDE.md et passait pour absente.
    const labels = memory.map((i) => i.label)
    expect(labels).toContain('front/CLAUDE.md')
    expect(labels).toContain('rules/front/permissions.md')
    // Elle porte bien du contenu compté, pas une simple référence.
    const rule = memory.find((i) => i.label.startsWith('rules/'))!
    expect(rule.tokens).toBeGreaterThan(0)
  })
})

describe('coût — prix catalogue de l’API', () => {
  it('chiffre une session sur un modèle tarifé', async () => {
    const { stats } = await parseTranscript(fixture('basic'), 'basic')
    // opus-4-8 : 5 $/M entrée, 25 $/M sortie, 0,5 $/M cache-read, 6,25 $/M
    // cache-write. Sommé par réponse, à son propre modèle.
    expect(stats.costUsd).toBeCloseTo(0.07275, 5)
    expect(stats.costPartial).toBe(false)
  })

  it("n'invente aucun prix pour un modèle qu'on ne tarife pas", async () => {
    const { stats } = await parseTranscript(fixture('unpriced'), 'unpriced')
    // `<synthetic>` n'a pas de tarif : rien n'est chiffré, et le drapeau le dit.
    expect(stats.costUsd).toBe(0)
    expect(stats.costPartial).toBe(true)
  })
})

describe('catalogue — le listing des skills disponibles', () => {
  it('nomme chaque skill et le dit chargé au démarrage, pas invoqué', async () => {
    const { context } = await parseTranscript(fixture('catalogue'), 'catalogue')
    const skills = context.injections.find((i) => i.category === 'skills')!
    // Le libellé doit dire « catalogue » : c'est un menu, pas une consommation.
    expect(skills.label).toContain('Catalogue')
    expect(skills.entries?.map((e) => e.label)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('replie une description multi-ligne sur son skill, sans ligne fantôme', async () => {
    const { context } = await parseTranscript(fixture('catalogue'), 'catalogue')
    const skills = context.injections.find((i) => i.category === 'skills')!
    // `beta` a une continuation : elle compte pour beta, pas pour un « préambule ».
    //
    // L'assertion porte sur le libellé traduit, et non sur le mot français : le
    // serveur rend ses textes dans la langue réglée dans l'interface, si bien
    // qu'un `préambule` en dur ferait passer ce test selon la préférence de qui
    // le lance.
    const entries = skills.entries ?? []
    expect(entries.some((e) => e.label === t('context.preamble'))).toBe(false)
    const beta = entries.find((e) => e.label === 'beta')!
    const alpha = entries.find((e) => e.label === 'alpha')!
    expect(beta.tokens).toBeGreaterThan(alpha.tokens) // grossi par sa continuation
  })
})

describe('tools — plusieurs appels dans un tour', () => {
  it('regroupe par nom, garde le compte, propage l’erreur', async () => {
    const { context } = await parseTranscript(fixture('tools'), 'tools')
    const tools = context.injections.find((i) => i.category === 'tools')!
    expect(tools.toolCount).toBe(3)
    // Deux Bash fondus en une ligne — dont un a échoué, ce que la ligne dit —, un
    // Grep à part, l'ensemble du plus lourd au plus léger.
    expect(tools.tools).toEqual([
      { name: 'Bash', tokens: 148, count: 2, isError: true },
      { name: 'Grep', tokens: 54, count: 1, isError: false },
    ])
  })
})

describe('attachments — ce que le harness pousse dans la fenêtre', () => {
  const load = () => parseTranscript(fixture('attachments'), 'attachments')
  const sum = (c: Awaited<ReturnType<typeof load>>['context'], cat: string, phase = 0): number =>
    c.injections.filter((i) => i.category === cat && i.phase === phase).reduce((s, i) => s + i.tokens, 0)

  it('ne compte qu’une fois un CLAUDE.md référencé deux fois', async () => {
    const { context } = await load()
    // Deux lignes `nested_memory` pour le même chemin. Le harness le redit ; il
    // ne le renvoie pas.
    expect(sum(context, 'memory')).toBe(100)
  })

  it('le recompte après une compaction, qui a vidé la fenêtre', async () => {
    const { context } = await load()
    expect(context.compactions).toHaveLength(1)
    // Réinjecté dans une fenêtre neuve : payé une seconde fois.
    expect(sum(context, 'memory', 1)).toBe(100)
  })

  it('absorbe `already_read_file` dans le `file` du même chemin', async () => {
    const { context } = await load()
    // 200 pour le fichier lu, puis 100 + 100 pour ses deux extraits d'édition :
    // un snippet est du texte neuf à chaque fois, il ne se dédoublonne pas.
    expect(sum(context, 'files')).toBe(400)
  })

  it('ne compte pas deux fois le contexte qu’un hook injecte', async () => {
    const { context } = await load()
    // `hook_success.stdout` réécrit l'`additionalContext` que
    // `hook_additional_context` porte déjà. 42 paires dans le corpus.
    const hooks = context.injections.filter((i) => i.label.startsWith('Hook '))
    expect(hooks).toHaveLength(1)
    expect(hooks[0]!.tokens).toBe(300)
  })

  it('range la machinerie du harness à part du contenu', async () => {
    const { context } = await load()
    // 300 (hook) + 500 (notification de tâche) + 25 (noms des outils différés).
    expect(sum(context, 'harness')).toBe(825)
  })

  it('compte le corps d’un skill invoqué, pas seulement son nom', async () => {
    const { context } = await load()
    expect(sum(context, 'skills')).toBe(400)
  })

  it("n'invente rien pour les lignes qui ne portent aucun texte", async () => {
    const { context } = await load()
    // `plan_mode` ne garde qu'un chemin et un booléen : le rappel que le harness
    // en compose n'est écrit nulle part. Il reste dans `unattributed`.
    expect(context.injections.some((i) => i.label.includes('plan'))).toBe(false)
    expect(context.baseline).toBe(38_265)
  })
})

describe('withsub — un sous-agent tourne dans sa propre fenêtre', () => {
  it("n'ouvre aucun tour dans la fenêtre du parent", async () => {
    const { context } = await parseTranscript(fixture('withsub'), 'withsub')
    // Trois réponses dans le fichier principal ; le sous-agent en a une de plus,
    // qui ne regarde que lui.
    expect(context.turns).toHaveLength(3)
  })

  it('ne fait jamais s’effondrer la fenêtre du parent', async () => {
    const { context } = await parseTranscript(fixture('withsub'), 'withsub')
    const totals = context.turns.map((t) => t.total)
    // La fenêtre d'un sous-agent est petite. Repliée dans celle du parent, elle
    // s'y voyait comme un décrochement, sur la quasi-totalité des sessions.
    for (let i = 1; i < totals.length; i++) expect(totals[i]!).toBeGreaterThan(totals[i - 1]!)
  })

  it("n'injecte pas les attachements du sous-agent dans le parent", async () => {
    const { context } = await parseTranscript(fixture('withsub'), 'withsub')
    const memory = context.injections.filter((i) => i.category === 'memory').reduce((sum, i) => sum + i.tokens, 0)
    // Le seul CLAUDE.md de la session vaut 100 tokens. Celui du sous-agent en
    // vaut 500, et n'est jamais entré ici.
    expect(memory).toBe(100)
  })

  it("compte l'appel Agent lui-même, des deux côtés", async () => {
    const { context } = await parseTranscript(fixture('withsub'), 'withsub')
    // Ce que le parent paie pour un sous-agent : la consigne qu'il lui donne et
    // le rapport qu'il en reçoit. Rien d'autre ne traverse.
    const agent = context.injections.filter((i) => i.category === 'tools').at(-1)!
    expect(agent).toMatchObject({ inputTokens: 116, outputTokens: 10 })
  })

  it('montre tout de même le sous-agent dans la timeline', async () => {
    const t = await parseTranscript(fixture('withsub'), 'withsub')
    // L'exclure du contexte n'est pas l'effacer : le lecteur veut voir ce qu'il
    // a fait.
    expect(t.hasSidechain).toBe(true)
    expect(t.events.filter((e) => e.isSidechain)).toHaveLength(2)
  })
})

describe('taille de la fenêtre', () => {
  it("conclut à la grande fenêtre dès qu'un contexte l'a dépassée", () => {
    expect(contextLimitFor(['claude-opus-5'], 333_000)).toBe(1_000_000)
    expect(contextLimitFor(['claude-opus-5'], 120_000)).toBe(200_000)
  })

  it('lit le suffixe `[1m]` quand il survit dans l’id de modèle', () => {
    expect(contextLimitFor(['claude-opus-5[1m]'], 12_000)).toBe(1_000_000)
  })

  it("croit le modèle configuré avant que la session ne l'ait prouvé", () => {
    // Le cas du direct : la session vient de démarrer, aucune preuve encore, et
    // pourtant sa fenêtre est bien celle du modèle choisi dans les settings.
    expect(contextLimitFor(['claude-opus-5'], 12_000, true)).toBe(1_000_000)
    expect(contextLimitFor(['claude-opus-5'], 12_000, false)).toBe(200_000)
  })
})
