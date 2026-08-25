// Reconstruct what filled the context window, turn by turn.
//
// The transcript carries the raw material in rows `parseTranscript` used to drop
// on the floor: `type: "attachment"` rows hold the *text* of everything the
// harness injected — the CLAUDE.md layers it read, the skill listing, the files
// pulled in by an @-mention or an edit. Tool outputs and thinking blocks come
// from the messages themselves.
//
// Anchoring, and why it matters:
//
//   Every assistant response states the exact size of the context it was given
//   (`input + cacheRead + cacheCreate`). We use that as the turn's `total` and
//   estimate only how it splits. The estimate is `chars / 4` — no Anthropic
//   tokenizer runs offline — so the categories never quite add up, and the
//   remainder (the system prompt and the tool schemas, which the transcript does
//   not record) is surfaced as `unattributed` rather than smeared over the
//   categories to make the chart look tidy.

import { basename } from 'node:path'
import {
  CONTEXT_CATEGORIES,
  estimateTokens,
  type Compaction,
  type ContextCategory,
  type ContextEntry,
  type ContextInjection,
  type SessionContext,
  type TurnContext,
} from '../shared/context.ts'
import { t } from './i18n/index.ts'
import { str, num } from './json.ts'

export type { Compaction, SessionContext }
export { estimateTokens }

/** An injection before the accumulator stamps it with its turn and phase. */
type AttachmentInjection = Omit<ContextInjection, 'turnIndex' | 'phase'>

/**
 * What one (turn, category) accumulated before it becomes a row.
 *
 * `input`/`output` and `thinking`/`text` are slices of `tokens`, not additions to
 * it. `byTool` is keyed by tool name so a turn with twelve `Read`s reads as one
 * line — the count is kept, the twelve rows are not.
 */
interface Cell {
  tokens: number
  count: number
  input: number
  output: number
  thinking: number
  text: number
  byTool: Map<string, { tokens: number; count: number; isError: boolean }>
}

function newCell(): Cell {
  return { tokens: 0, count: 0, input: 0, output: 0, thinking: 0, text: 0, byTool: new Map() }
}

const DEFAULT_LIMIT = 200_000
const LONG_LIMIT = 1_000_000

/**
 * Window size for a session, deduced from what it actually did.
 *
 * The obvious approach — read the model id — does not work. A session running on
 * a 1M-context model records `message.model` as plain `claude-opus-4-8`, with
 * the `[1m]` suffix stripped; verified on a real transcript whose context ran to
 * 333k tokens and whose harness compacted at 295k, all under that bare id.
 *
 * So we infer from evidence instead: any observed context larger than the small
 * window proves the large one. `observedMax` is the biggest context we saw —
 * a turn's exact total, or the exact `preTokens` the harness compacted from.
 * The `[1m]` check stays as a secondary signal in case the suffix ever survives.
 *
 * Evidence alone arrives late, though: a young session has not yet outgrown the
 * small window, so a live session followed from the Sessions page would be drawn
 * against 200k and jump to 1M mid-flight. `configuredLong` closes that gap — the
 * suffix survives in settings, where the model was picked. See `claude/model.ts`.
 */
export function contextLimitFor(models: Iterable<string>, observedMax = 0, configuredLong = false): number {
  if (observedMax > DEFAULT_LIMIT) return LONG_LIMIT
  if (configuredLong) return LONG_LIMIT
  for (const m of models) if (m.includes('[1m]')) return LONG_LIMIT
  return DEFAULT_LIMIT
}

function zeroed(): Record<ContextCategory, number> {
  const out = {} as Record<ContextCategory, number>
  for (const c of CONTEXT_CATEGORIES) out[c] = 0
  return out
}

/** A short, human label for a path — the full path lives in `injection.path`. */
function label(path: string): string {
  return basename(path.replace(/[\\/]+$/, '')) || path
}

/**
 * A label for a memory injection that says *what it is*, not just its file name.
 *
 * A bare basename hides two things a reader needs. Every `CLAUDE.md` renders
 * identically — you cannot tell the project's from a subdirectory's. And a rule
 * loaded on a glob match from `.claude/rules/` looks like any stray file, so it
 * reads as absent even when it is right there. Keep the `rules/…` prefix for a
 * rule, and the parent directory for everything else.
 */
function memoryLabel(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const rule = /(?:^|\/)\.claude\/rules\/(.+)$/i.exec(norm)
  if (rule?.[1]) return `rules/${rule[1]}`
  const parts = norm.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || path
}

/**
 * Anchor a turn on the exact context size the harness recorded.
 *
 * `unattributed` is clamped at zero. The estimate can overshoot the anchor —
 * `chars / 4` runs long on code, and a file read twice is counted twice — and a
 * negative remainder carries no information while rendering as an inverted bar.
 */
export function settleTurn(turn: TurnContext, total: number): void {
  let attributed = 0
  for (const c of CONTEXT_CATEGORIES) attributed += turn.byCategory[c]
  turn.total = total
  turn.unattributed = Math.max(0, total - attributed)
}

/** The text of a `string[]` field, as it was concatenated into the window. */
function joinStrings(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.filter((v): v is string => typeof v === 'string').join('\n')
}

/**
 * One `ContextEntry` per named line of a catalogue.
 *
 * A skill listing reads `- create-skill: Create a skill…`; an agent listing the
 * same. The name is up to the first colon; the token cost is the whole entry,
 * description included, since that is what the catalogue actually spends. A
 * description that wraps over several lines is folded back onto its entry rather
 * than counted apart — a continuation is not a new item. Text before the first
 * `- name:` line is the listing's own preamble, kept under one heading so its
 * tokens are still accounted for.
 */
function catalogueEntries(lines: string[]): { entries: ContextEntry[]; count: number } {
  const entries: ContextEntry[] = []
  let named = 0
  let current: ContextEntry | null = null

  for (const line of lines) {
    const tokens = estimateTokens(line)
    if (!tokens) continue
    const m = /^\s*-\s*([^:]+):/.exec(line)
    if (m?.[1]) {
      named++
      current = { label: m[1].trim(), tokens }
      entries.push(current)
    } else if (current) {
      current.tokens += tokens // continuation of the entry above
    } else {
      current = { label: t('context.preamble'), tokens }
      entries.push(current)
    }
  }
  return { entries, count: named }
}

/** The file body an attachment carries under `content.file.content`. */
function nestedFileText(value: unknown): { text: string; path: string } {
  const a = value as Record<string, unknown>
  const content = a.content as Record<string, unknown> | undefined
  const file = content?.file as Record<string, unknown> | undefined
  return { text: str(file?.content), path: str(a.filename, str(file?.filePath)) }
}

/**
 * Turn an `attachment` row's payload into an injection, or `null` when nothing
 * it carries reached the model.
 *
 * Claude Code emits many distinct `attachment.type`s. The
 * rule for admitting one is narrow on purpose: **we count only text the row
 * itself holds.** Where the harness composed a sentence from structured fields
 * and kept only the fields, any figure we produced would be of our own making.
 * `plan_mode`, `auto_mode`, `date_change`, `command_permissions`,
 * `compact_file_reference` and `opened_file_in_ide` are such rows — they carry a
 * path or a flag, never the reminder built from it. Their tokens stay in
 * `unattributed`, which is the honest place for them.
 *
 * `hook_success` is skipped for a different reason: its `stdout` embeds the very
 * `additionalContext` that the paired `hook_additional_context` row also carries.
 * The two always come together. Counting both would double the same text.
 */
export function classifyAttachment(value: unknown): AttachmentInjection | null {
  if (!value || typeof value !== 'object') return null
  const a = value as Record<string, unknown>

  switch (str(a.type)) {
    // ── Contenu de la session ────────────────────────────────────────────────
    case 'nested_memory': {
      const content = a.content as Record<string, unknown> | undefined
      const text = str(content?.content)
      if (!text) return null
      const path = str(a.path)
      return {
        category: 'memory',
        // Une règle chargée par glob (`.claude/rules/…`) arrive ici comme une
        // mémoire ; sans un label qui la nomme, elle se confond avec un CLAUDE.md.
        label: memoryLabel(path),
        path,
        tokens: estimateTokens(text),
        dedupeKey: `memory:${path}`,
      }
    }
    // Le *catalogue* des skills, injecté une fois au démarrage : le menu de ce que
    // le modèle peut invoquer, pas une invocation. `invoked_skills` porte, lui, le
    // corps d'un skill réellement lancé.
    case 'skill_listing': {
      const text = str(a.content)
      if (!text) return null
      const { entries } = catalogueEntries(text.split('\n'))
      // La comparaison porte sur le libellé traduit, pas sur le mot français :
      // ce `label` sort de `catalogueEntries`, qui le pose déjà dans la langue
      // de la requête. Le figer ici ferait compter le préambule comme un skill
      // dès que l'interface n'est plus en français.
      const count = num(a.skillCount) || entries.filter((e) => e.label !== t('context.preamble')).length
      return {
        category: 'skills',
        label: count ? `Catalogue — ${count} skills disponibles` : 'Catalogue de skills',
        tokens: estimateTokens(text),
        entries,
      }
    }
    // Le corps du skill, pas seulement son nom dans la liste.
    case 'invoked_skills': {
      const skills = Array.isArray(a.skills) ? (a.skills as Record<string, unknown>[]) : []
      const text = skills.map((s) => str(s.content)).join('\n')
      if (!text) return null
      const names = skills.map((s) => str(s.name)).filter(Boolean)
      return {
        category: 'skills',
        label: names.length ? t('context.skillNamed', { names: names.join(', ') }) : t('context.skillInvoked'),
        tokens: estimateTokens(text),
        dedupeKey: `skill:${names.join(',')}`,
      }
    }
    case 'file': {
      const { text, path } = nestedFileText(a)
      if (!text) return null
      return {
        category: 'files',
        label: label(path),
        path,
        tokens: estimateTokens(text),
        dedupeKey: `file:${path}`,
      }
    }
    // Le harness redit qu'un fichier est déjà lu — et en rejoint le contenu. La
    // clé de dédoublonnage est celle de `file` : si ce chemin est déjà entré dans
    // la fenêtre, il n'y entre pas deux fois.
    case 'already_read_file': {
      const { text, path } = nestedFileText(a)
      if (!text) return null
      return {
        category: 'files',
        label: label(path),
        path,
        tokens: estimateTokens(text),
        dedupeKey: `file:${path}`,
      }
    }
    // Un extrait neuf à chaque édition : aucune clé, ou l'on perdrait les suivants.
    case 'edited_text_file': {
      const text = str(a.snippet)
      if (!text) return null
      const path = str(a.filename)
      return { category: 'files', label: label(path), path, tokens: estimateTokens(text) }
    }
    case 'plan_file_reference': {
      const text = str(a.planContent)
      if (!text) return null
      const path = str(a.planFilePath)
      return {
        category: 'files',
        label: label(path),
        path,
        tokens: estimateTokens(text),
        dedupeKey: `file:${path}`,
      }
    }
    case 'directory': {
      const text = str(a.content)
      if (!text) return null
      const path = str(a.path)
      return {
        category: 'files',
        label: str(a.displayPath, label(path)),
        path,
        tokens: estimateTokens(text),
      }
    }

    // ── Machinerie du harness ────────────────────────────────────────────────
    // Le catalogue des sous-agents disponibles — un menu, chargé au démarrage.
    case 'agent_listing_delta': {
      const lines = Array.isArray(a.addedLines) ? (a.addedLines as string[]) : []
      const text = joinStrings(a.addedLines)
      if (!text) return null
      const { entries, count } = catalogueEntries(lines)
      const n = (Array.isArray(a.addedTypes) ? a.addedTypes.length : 0) || count
      return {
        category: 'harness',
        label: `Catalogue — ${n} agents disponibles`,
        tokens: estimateTokens(text),
        entries,
      }
    }
    // Les schémas des outils différés ne sont pas ici — seulement leurs noms, qui
    // sont bien dans la fenêtre. Les schémas, eux, restent dans le socle.
    case 'deferred_tools_delta': {
      const text = joinStrings(a.addedLines)
      if (!text) return null
      const n = Array.isArray(a.addedNames) ? a.addedNames.length : 0
      return {
        category: 'harness',
        label: t('context.deferredTools', { count: n }),
        tokens: estimateTokens(text),
      }
    }
    case 'mcp_instructions_delta': {
      const text = joinStrings(a.addedBlocks)
      if (!text) return null
      const names = Array.isArray(a.addedNames) ? (a.addedNames as string[]) : []
      return {
        category: 'harness',
        label: names.length ? `MCP : ${names.join(', ')}` : 'Instructions MCP',
        tokens: estimateTokens(text),
      }
    }
    case 'hook_additional_context': {
      const text = joinStrings(a.content)
      if (!text) return null
      return {
        category: 'harness',
        label: `Hook ${str(a.hookName, '?')}`,
        tokens: estimateTokens(text),
      }
    }
    case 'hook_non_blocking_error': {
      const text = str(a.stderr)
      if (!text) return null
      return {
        category: 'harness',
        label: `Hook ${str(a.hookName, '?')} — erreur`,
        tokens: estimateTokens(text),
      }
    }
    case 'hook_blocking_error': {
      const err = a.blockingError as Record<string, unknown> | undefined
      const text = str(err?.blockingError)
      if (!text) return null
      return {
        category: 'harness',
        label: t('context.hookBlocked', { name: str(a.hookName, '?') }),
        tokens: estimateTokens(text),
      }
    }
    // La notification qu'une tâche ou un sous-agent renvoie au fil principal.
    case 'queued_command': {
      const text = str(a.prompt)
      if (!text) return null
      return {
        category: 'harness',
        label: str(a.commandMode, 'Commande en file'),
        tokens: estimateTokens(text),
      }
    }
    case 'context_tip': {
      const tip = a.tip as Record<string, unknown> | undefined
      const text = str(tip?.tip)
      if (!text) return null
      return { category: 'harness', label: 'Conseil', tokens: estimateTokens(text) }
    }
    // Ces deux-là ne gardent que des champs structurés ; le harness en compose un
    // texte que le transcript n'écrit pas. Le JSON des champs en est le plus
    // proche relevé — un ordre de grandeur, comme tout ce qui porte un « ~ ».
    case 'task_reminder': {
      const items = Array.isArray(a.content) ? a.content : []
      if (!items.length) return null
      return {
        category: 'harness',
        label: t('context.todoReminder', { count: items.length }),
        tokens: estimateTokens(JSON.stringify(items)),
      }
    }
    case 'diagnostics': {
      const files = Array.isArray(a.files) ? a.files : []
      if (!files.length) return null
      return {
        category: 'harness',
        label: `Diagnostics (${files.length})`,
        tokens: estimateTokens(JSON.stringify(files)),
      }
    }

    default:
      return null
  }
}

/** The `compactMetadata` of a `compact_boundary` row, or `null` if unusable. */
export function readCompaction(row: Record<string, unknown>, timestamp: number): Compaction | null {
  const meta = row.compactMetadata as Record<string, unknown> | undefined
  if (!meta) return null
  return {
    uuid: str(row.uuid),
    timestamp,
    trigger: str(meta.trigger) === 'auto' ? 'auto' : 'manual',
    preTokens: num(meta.preTokens),
    postTokens: num(meta.postTokens),
    durationMs: num(meta.durationMs),
  }
}

/**
 * Folds a transcript's rows into a `SessionContext`, in one forward pass.
 *
 * Feed it, in transcript order, every injection and every assistant turn; call
 * `compact()` when a boundary is crossed. Nothing here re-reads the file — the
 * caller is already walking it.
 */
export class ContextAccumulator {
  /** Cumulative estimates since the last compaction. */
  private running = zeroed()
  private readonly turns: TurnContext[] = []
  private readonly compactions: Compaction[] = []
  private readonly injections: ContextInjection[] = []
  /** Compaction segment we are in; a compaction empties the window. */
  private phase = 0
  /** `dedupeKey`s already admitted into the current phase's window. */
  private seenKeys = new Set<string>()
  /**
   * Text produced *during* a turn, gathered per (turn, category) so the panel can
   * show one row — "3 outils au tour 12" — instead of a hundred fragments.
   *
   * `input` / `output` are filled for the `tools` category only, and are two
   * slices of `tokens`, not additions to it.
   */
  private readonly perTurn = new Map<string, Cell>()

  private cell(category: ContextCategory, turnIndex: number): Cell {
    const key = `${this.phase}\0${turnIndex}\0${category}`
    const found = this.perTurn.get(key) ?? newCell()
    this.perTurn.set(key, found)
    return found
  }

  /** The turn a not-yet-begun injection will first weigh on. */
  private get nextTurnIndex(): number {
    return this.turns.length
  }

  /**
   * An attachment: the harness pushed this text in before the coming turn.
   *
   * A keyed injection that has already entered this phase's window is dropped,
   * not added twice. The harness re-*references* a CLAUDE.md layer or a read file
   * far more often than it re-*sends* it, and counting each mention would inflate
   * the categories past the exact anchor they are measured against.
   */
  add(injection: Omit<ContextInjection, 'turnIndex' | 'phase'>): void {
    if (injection.dedupeKey) {
      if (this.seenKeys.has(injection.dedupeKey)) return
      this.seenKeys.add(injection.dedupeKey)
    }
    this.running[injection.category] += injection.tokens
    this.injections.push({ ...injection, turnIndex: this.nextTurnIndex, phase: this.phase })
  }

  /**
   * Text carried by the messages themselves — a tool's output, Claude's own
   * thinking, what the user typed. Folded per turn rather than pushed one row at
   * a time: a turn with forty tool calls should read as one line, not forty.
   */
  addText(category: ContextCategory, text: string, turnIndex: number): void {
    if (!text) return
    this.running[category] += estimateTokens(text)

    const cell = this.cell(category, turnIndex)
    cell.tokens += estimateTokens(text)
    cell.count++
  }

  /**
   * One tool call, both directions.
   *
   * A tool's *input* is context too — the model is billed for the file it asks
   * `Write` to create just as surely as for the file `Read` hands back. Counting
   * only the output was the single largest omission of this accumulator: it left
   * millions of tokens unattributed on a busy install, most of them from `Edit`
   * and `Write`.
   */
  addToolCall(
    turnIndex: number,
    name: string,
    input: string,
    output: string,
    isError = false,
    /**
     * Les tokens visuels des images rendues par l'outil.
     *
     * Ils ne se déduisent pas du texte du résultat — une capture d'écran vaut
     * environ 1 500 tokens et ne laisse pas un caractère derrière elle. Sans ce
     * complément, une session de pilotage navigateur voyait des dizaines de
     * milliers de tokens disparaître de l'attribution.
     */
    imageTokens = 0,
  ): void {
    const inTokens = estimateTokens(input)
    const outTokens = estimateTokens(output) + imageTokens
    if (!inTokens && !outTokens) return

    this.running.tools += inTokens + outTokens
    const cell = this.cell('tools', turnIndex)
    cell.tokens += inTokens + outTokens
    cell.input += inTokens
    cell.output += outTokens
    cell.count++

    const key = name || 'Outil'
    const tool = cell.byTool.get(key) ?? { tokens: 0, count: 0, isError: false }
    tool.tokens += inTokens + outTokens
    tool.count++
    // One failed call among ten marks the row: the reader should look.
    tool.isError ||= isError
    cell.byTool.set(key, tool)
  }

  /**
   * What a response produced: its reasoning, then its answer.
   *
   * Both land in the next turn's window, so both belong to one category. They are
   * kept apart because only one of them shrinks when you ask for less thinking.
   */
  addThinking(turnIndex: number, kind: 'thinking' | 'text', text: string): void {
    const tokens = estimateTokens(text)
    if (!tokens) return

    this.running.thinking += tokens
    const cell = this.cell('thinking', turnIndex)
    cell.tokens += tokens
    cell.count++
    cell[kind] += tokens
  }

  /** Index of the turn currently being produced, for `addText`. */
  currentTurnIndex(): number {
    return Math.max(0, this.turns.length - 1)
  }

  /**
   * Snapshot the window as it stood *entering* one assistant response.
   *
   * Called on the response's first row, because that is the context the model
   * was handed — its own thinking and text are output, and only weigh on the
   * next turn. The exact `total` is not known until every row of the response
   * has been folded together, so the caller settles it afterwards with
   * `settleTurn`; until then the returned object reads as zero.
   */
  beginTurn(uuid: string, timestamp: number): TurnContext {
    const turn: TurnContext = {
      turnIndex: this.turns.length,
      phase: this.phase,
      uuid,
      timestamp,
      total: 0,
      byCategory: { ...this.running },
      unattributed: 0,
    }
    this.turns.push(turn)
    return turn
  }

  /**
   * The window was actually emptied — start the running totals over.
   *
   * The key set goes with them: a CLAUDE.md re-injected into the fresh window is
   * paid for a second time, and must be counted a second time.
   */
  compact(compaction: Compaction): void {
    this.compactions.push(compaction)
    this.running = zeroed()
    this.seenKeys = new Set()
    this.phase++
  }

  /** One row per (turn, category) of message-borne text, largest first downstream. */
  private flushPerTurn(): void {
    for (const [key, cell] of this.perTurn) {
      const [rawPhase, rawTurn, category] = key.split('\0') as [string, string, ContextCategory]
      const turnIndex = Number(rawTurn)
      const human = turnIndex + 1 // Turns are 1-based for the reader.

      let text: string
      if (category === 'tools') {
        text = `${cell.count} ${cell.count > 1 ? 'appels d’outil' : 'appel d’outil'} au tour ${human}`
      } else if (category === 'thinking') {
        text = t('context.turnReasoning', { turn: human })
      } else {
        text = `Tour ${human} — votre message`
      }

      this.injections.push({
        category,
        label: text,
        tokens: cell.tokens,
        turnIndex,
        phase: Number(rawPhase),
        ...(category === 'tools'
          ? {
              toolCount: cell.count,
              inputTokens: cell.input,
              outputTokens: cell.output,
              tools: [...cell.byTool].map(([name, t]) => ({ name, ...t })).sort((a, b) => b.tokens - a.tokens),
            }
          : {}),
        ...(category === 'thinking' ? { thinkingTokens: cell.thinking, textTokens: cell.text } : {}),
      })
    }
    this.perTurn.clear()
  }

  /**
   * What the harness put in the window before the session said anything.
   *
   * Only the very first response can answer this: its window holds the system
   * prompt, the tool schemas, and whatever we injected ahead of it — nothing
   * else has happened yet. Subtract what we injected and the remainder is the
   * harness's own overhead, exact to the accuracy of that one subtraction.
   *
   * Any later turn would fold in the conversation so far, so there is no fallback
   * worth having. An unanchored first turn yields `0`, which the panel reads as
   * "unknown" and does not draw.
   */
  private measureBaseline(): number {
    const first = this.turns[0]
    if (!first || first.total <= 0) return 0
    let injected = 0
    for (const c of CONTEXT_CATEGORIES) injected += first.byCategory[c]
    return Math.max(0, first.total - injected)
  }

  result(models: Iterable<string>, configuredLong = false): SessionContext {
    this.flushPerTurn()

    let observedMax = 0
    for (const t of this.turns) if (t.total > observedMax) observedMax = t.total
    // A compaction proves the window reached `preTokens`, even if no single turn
    // we anchored did — the harness saw a fuller window than any row records.
    for (const c of this.compactions) if (c.preTokens > observedMax) observedMax = c.preTokens

    return {
      limit: contextLimitFor(models, observedMax, configuredLong),
      baseline: this.measureBaseline(),
      turns: this.turns,
      compactions: this.compactions,
      injections: this.injections,
    }
  }
}
