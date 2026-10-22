// Les invariants, éprouvés sur le vrai corpus de la machine.
//
// Les fixtures disent ce que le modèle *doit* faire ; elles ne disent rien de ce
// que les vraies sessions contiennent. C'est pourtant là qu'était la régression
// des sous-agents : une fenêtre de 9 000 tokens repliée dans une de 131 000, sur
// 159 sessions, et aucune fixture ne l'aurait vue puisqu'aucune ne l'a décrite.
//
// Ce fichier ne fige rien et n'assemble aucune donnée : il ouvre `~/.claude` s'il
// existe, en lit un échantillon, et vérifie des propriétés qui doivent tenir quel
// que soit le contenu. Sur une machine sans corpus, il se saute — c'est un filet,
// pas une porte.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eachImage, parseTranscript } from '../server/transcript.ts'
import { CONTEXT_CATEGORIES, type SessionContext } from '../shared/context.ts'

const PROJECTS = join(homedir(), '.claude', 'projects')
const HAS_CORPUS = existsSync(PROJECTS)

/** Assez pour que les propriétés mordent. */
const SAMPLE = 60

/**
 * Ce que l'échantillon a le droit de peser, sous-agents compris.
 *
 * Un plafond en sessions ne borne rien : le corpus d'une machine ne fait que
 * grossir, et les sessions à sous-agents — celles qu'on prend d'abord — sont les
 * plus lourdes, si bien que le fichier a fini par dépasser ses deux minutes. Un
 * budget en octets garde le coût constant quoi qu'il arrive au disque.
 */
const BUDGET_BYTES = 250 * 1024 * 1024

/** Au-delà, une seule session mangerait le budget de dix autres. */
const MAX_SESSION_BYTES = BUDGET_BYTES / 10

/** Une session écrite il y a moins que cela tourne peut-être encore. */
const SETTLED_MS = 2 * 60 * 1000

interface Session {
  name: string
  path: string
  /** Ce transcript a-t-il des sous-agents ? Eux seuls exercent l'isolation. */
  hasSubagents: boolean
  bytes: number
  modifiedAt: number
}

function sizeOf(dir: string): number {
  let bytes = 0
  for (const file of readdirSync(dir)) bytes += statSync(join(dir, file)).size
  return bytes
}

function sample(): Session[] {
  const all: Session[] = []
  for (const project of readdirSync(PROJECTS)) {
    const dir = join(PROJECTS, project)
    if (!statSync(dir).isDirectory()) continue
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.jsonl')) continue
      const id = file.slice(0, -6)
      const path = join(dir, file)
      const subagents = join(dir, id, 'subagents')
      const hasSubagents = existsSync(subagents)
      const stat = statSync(path)
      all.push({
        name: `${project}/${id.slice(0, 8)}`,
        path,
        hasSubagents,
        bytes: stat.size + (hasSubagents ? sizeOf(subagents) : 0),
        modifiedAt: stat.mtimeMs,
      })
    }
  }
  // Les sessions à sous-agents d'abord : ce sont elles qui portent l'invariant
  // le plus fragile, et elles sont minoritaires. Puis les plus récentes : ce
  // sont elles qui portent le format que le CLI écrit aujourd'hui.
  all.sort((a, b) => Number(b.hasSubagents) - Number(a.hasSubagents) || b.modifiedAt - a.modifiedAt)

  // Une session vivante bouge sous le test : une ligne lue à moitié n'est pas
  // une régression.
  const settled = Date.now() - SETTLED_MS
  const out: Session[] = []
  let spent = 0
  for (const s of all) {
    if (out.length === SAMPLE) break
    if (s.modifiedAt > settled || s.bytes > MAX_SESSION_BYTES || spent + s.bytes > BUDGET_BYTES) continue
    out.push(s)
    spent += s.bytes
  }
  return out
}

/**
 * Chaque test lit les mêmes sessions : les parser une fois pour tous. L'identifiant
 * fait partie de la clé parce qu'il change ce que le parseur rattache — deux tests
 * passent `''` exprès.
 */
const parsed = new Map<string, ReturnType<typeof parseTranscript>>()
function parse(path: string, id: string): ReturnType<typeof parseTranscript> {
  const key = `${path}\0${id}`
  let p = parsed.get(key)
  if (!p) parsed.set(key, (p = parseTranscript(path, id)))
  return p
}

/** Les lignes d'un fichier, lues une fois quel que soit le nombre d'images qu'il porte. */
const linesOf = new Map<string, string[]>()
function lines(file: string): string[] {
  let l = linesOf.get(file)
  if (!l) linesOf.set(file, (l = readFileSync(file, 'utf8').split('\n')))
  return l
}

function attributedAt(c: SessionContext, i: number): number {
  return CONTEXT_CATEGORIES.reduce((sum, cat) => sum + c.turns[i]!.byCategory[cat], 0)
}

/**
 * Le délai laissé à un test qui lit le vrai disque.
 *
 * Les cinq secondes de vitest ont été écrites pour des fixtures ; ici le premier
 * test qui touche une session la parse depuis le vrai disque. Le budget en octets
 * borne ce coût — quelques secondes — et ce délai n'est qu'une marge : s'il est
 * atteint, c'est que le parseur a ralenti, pas que le corpus a grossi.
 */
const TIMEOUT_MS = 120_000

describe.skipIf(!HAS_CORPUS)('invariants sur ~/.claude', { timeout: TIMEOUT_MS }, () => {
  const sessions = HAS_CORPUS ? sample() : []

  it('trouve des sessions à examiner', () => {
    expect(sessions.length).toBeGreaterThan(0)
  })

  it("n'attribue jamais plus que la fenêtre exacte", async () => {
    for (const s of sessions) {
      const { context } = await parse(s.path, '')
      context.turns.forEach((turn, i) => {
        if (!turn.total) return
        // Une estimation qui dépasse son ancre ne dit plus rien : `unattributed`
        // serait négatif, et le panneau dessinerait une barre à l'envers.
        expect(attributedAt(context, i), `${s.name} tour ${i}`).toBeLessThanOrEqual(turn.total)
      })
    }
  })

  it('déduit un socle plausible dès que le premier tour est ancré', async () => {
    for (const s of sessions) {
      const { context } = await parse(s.path, '')
      const first = context.turns[0]
      if (!first?.total) continue
      // Le prompt système et les schémas d'outils de Claude Code. Mesuré sur 488
      // sessions : médiane 26 441, p10 17 863, p90 32 156. Ces bornes sont larges
      // exprès — elles attrapent un socle tombé à zéro ou parti à la dérive, pas
      // une évolution du prompt d'Anthropic.
      expect(context.baseline, `${s.name}`).toBeGreaterThan(5_000)
      expect(context.baseline, `${s.name}`).toBeLessThan(80_000)
    }
  })

  it('adresse chaque image assez précisément pour la relire', async () => {
    let seen = 0
    for (const s of sessions) {
      const id = s.path.split(/[\\/]/).at(-1)!.slice(0, -6)
      const { events } = await parse(s.path, id)
      for (const ev of events) {
        for (const b of ev.blocks) {
          for (const img of b.images ?? b.result?.images ?? []) {
            seen++
            // L'adresse est tout ce que le front reçoit : sans `uuid`, la ligne
            // est introuvable ; sans le rang, l'image l'est dans sa ligne.
            expect(img.uuid, s.name).toMatch(/^[A-Za-z0-9-]{1,64}$/)
            expect(img.index, s.name).toBeGreaterThanOrEqual(0)
            expect(img.mediaType, s.name).toMatch(/^image\//)
            expect(img.bytes, s.name).toBeGreaterThan(0)

            // Et elle doit désigner les octets, pas seulement exister : on relit
            // le fichier comme le fera le BFF, en repartant de l'adresse seule.
            const file = img.agentId ? join(dirname(s.path), id, 'subagents', `agent-${img.agentId}.jsonl`) : s.path
            const row = lines(file)
              .filter((l) => l.includes(`"uuid":"${img.uuid}"`))
              .map((l) => JSON.parse(l) as Record<string, unknown>)
              .find((r) => r.uuid === img.uuid)
            expect(row, `${s.name} ligne ${img.uuid}`).toBeDefined()

            let data = ''
            eachImage((row!.message as { content?: unknown }).content, (source, _tool, at) => {
              if (at === img.index && typeof source.data === 'string') data = source.data
            })
            expect(data.length, `${s.name} image ${img.uuid}#${img.index}`).toBeGreaterThan(0)
          }
        }
      }
    }
    // Le corpus en contient (captures Playwright, `Read` de PNG) ; zéro voudrait
    // dire que l'extraction ne trouve plus rien, pas qu'il n'y a rien à trouver.
    expect(seen, 'aucune image dans l’échantillon').toBeGreaterThan(0)
  })

  /**
   * Le contrat sur lequel repose le découpage du flux en pistes.
   *
   * Il ne peut se vérifier que sur de vraies sessions : ce sont elles qui portent
   * les cas qu'aucune fixture ne décrit — un sidecar qui n'est pas un sous-agent,
   * un run interrompu, un `status` de notification qu'on n'a jamais vu. Si un
   * `agentId` du flux n'avait pas son run, ses tours n'apparaîtraient dans aucune
   * piste et rien à l'écran ne le dirait.
   */
  it('annonce un run pour chaque agent que le flux porte, et pas un de plus', async () => {
    const withSub = sessions.filter((s) => s.hasSubagents)
    expect(withSub.length, 'aucune session à sous-agents dans l’échantillon').toBeGreaterThan(0)

    let runs = 0
    for (const s of withSub) {
      const id = s.path.split(/[\\/]/).at(-1)!.slice(0, -6)
      const { subagents, events } = await parse(s.path, id)
      runs += subagents.length

      const inStream = new Set(events.flatMap((e) => (e.agentId ? [e.agentId] : [])))
      expect([...inStream].sort(), s.name).toEqual(subagents.map((r) => r.agentId).sort())

      const announced = subagents.reduce((n, r) => n + r.events, 0)
      expect(announced, s.name).toBe(events.filter((e) => e.agentId).length)

      for (const run of subagents) {
        expect(run.events, `${s.name} ${run.agentId}`).toBeGreaterThan(0)
        expect(run.lastActivityAt, `${s.name} ${run.agentId}`).toBeGreaterThanOrEqual(run.startedAt)
        expect(['running', 'completed', 'failed', 'unknown'], s.name).toContain(run.status)
        // Une fin datée est une fin avérée, et réciproquement.
        const terminal = run.status === 'completed' || run.status === 'failed'
        expect(run.endedAt !== undefined, `${s.name} ${run.agentId}`).toBe(terminal)
      }
    }
    expect(runs, 'aucun run dans l’échantillon').toBeGreaterThan(0)
  })

  it('ne replie jamais la fenêtre d’un sous-agent dans celle de son parent', async () => {
    const withSub = sessions.filter((s) => s.hasSubagents)
    expect(withSub.length, 'aucune session à sous-agents dans l’échantillon').toBeGreaterThan(0)

    for (const s of withSub) {
      const { context } = await parse(s.path, s.path.split(/[\\/]/).at(-1)!.slice(0, -6))
      // Une fenêtre grandit, tour après tour, jusqu'à ce qu'une compaction la
      // vide — et une compaction ouvre une phase. Un effondrement *au sein* d'une
      // phase n'a donc qu'une explication : deux fenêtres se sont mélangées.
      const byPhase = new Map<number, number[]>()
      for (const t of context.turns) {
        if (!t.total) continue
        ;(byPhase.get(t.phase) ?? byPhase.set(t.phase, []).get(t.phase)!).push(t.total)
      }
      for (const [phase, totals] of byPhase) {
        for (let i = 1; i < totals.length; i++) {
          expect(totals[i], `${s.name} phase ${phase} tour ${i}`).toBeGreaterThan(totals[i - 1]! * 0.7)
        }
      }
    }
  })
})
