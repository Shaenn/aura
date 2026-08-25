// Parse a Claude Code session transcript (`~/.claude/projects/<slug>/<id>.jsonl`)
// into a normalised, exhaustive event stream for the "replay" viewer.
//
// A transcript is JSONL: one JSON object per line. Lines are heterogeneous —
// user / assistant / system messages, plus harness bookkeeping (file-history
// snapshots, last-prompt markers, ai-title, mode, attachments). We keep the
// signal (everything the user and Claude exchanged) and drop pure noise, while
// pairing every `tool_use` with its matching `tool_result` so the UI can render
// a tool call and its output as a single unit.

import { readFile, stat, readdir } from 'node:fs/promises'
import { t } from './i18n/index.ts'
import { existsSync } from 'node:fs'
import { str, num } from './json.ts'
import { costOf } from './pricing.ts'
import { growth } from './tokens.ts'
import { dirname, join } from 'node:path'
import { ContextAccumulator, classifyAttachment, readCompaction, settleTurn } from './context.ts'
import type { TurnContext } from '../shared/context.ts'
import { configuredLongWindow } from './claude/model.ts'

// ── Normalised model ─────────────────────────────────────────────────────────
//
// Defined once in `shared/` and re-exported here: the SPA renders exactly these
// shapes, so a change must break both typechecks, not just one.

import type {
  Block,
  HookRun,
  ParsedTranscript,
  PlanModeMark,
  SilentHookGroup,
  SilentHooks,
  SubagentRunStatus,
  SubagentRunSummary,
  TitleSource,
  ToolResult,
  TranscriptEvent,
  TranscriptImage,
  TranscriptStats,
  TranscriptSummary,
  Usage,
} from '../shared/transcript.ts'

export type {
  Block,
  HookRun,
  ParsedTranscript,
  PlanModeMark,
  SilentHookGroup,
  SilentHooks,
  SubagentRunStatus,
  SubagentRunSummary,
  TitleSource,
  ToolResult,
  TranscriptEvent,
  TranscriptImage,
  TranscriptStats,
  TranscriptSummary,
  Usage,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Images ───────────────────────────────────────────────────────────────────
//
// Une image arrive en base64 dans la ligne : ~130 Ko pour une capture d'écran,
// et une session qui pilote un navigateur en accumule des dizaines. Les inliner
// dans le transcript parsé le ferait tripler de volume — et ce volume passerait
// aussi par le cache du BFF, à chaque ligne ajoutée. On n'en garde donc que
// l'adresse, et `readProjectTranscriptImage` relit les octets à la demande.

/**
 * Visite les images d'une ligne, dans l'ordre du fichier.
 *
 * Deux emplacements : un bloc `image` de premier niveau (une pièce jointe de
 * l'utilisateur) ou une image dans le `content` d'un `tool_result` (un `Read` de
 * PNG, une capture Playwright). Le rang est compté sur toute la ligne, tous
 * emplacements confondus : c'est lui qui, avec l'`uuid`, adresse l'image, et
 * l'ordre doit donc être le même ici et à la relecture.
 */
export function eachImage(content: unknown, visit: (source: Record<string, unknown>, toolUseId: string, index: number) => void): void {
  if (!Array.isArray(content)) return
  let index = 0
  for (const b of content as Record<string, unknown>[]) {
    if (b.type === 'image') {
      visit(rec(b.source), '', index++)
    } else if (b.type === 'tool_result' && Array.isArray(b.content)) {
      for (const c of b.content as Record<string, unknown>[]) {
        if (c.type === 'image') visit(rec(c.source), str(b.tool_use_id), index++)
      }
    }
  }
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

/** 4 caractères de base64 valent 3 octets ; le `=` final n'en code aucun. */
function decodedBytes(data: string): number {
  const pad = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((data.length * 3) / 4) - pad)
}

/** Décoder le début du base64, sans matérialiser l'image entière. */
function head(data: string, bytes: number): Buffer {
  // Un groupe base64 fait 4 caractères pour 3 octets : couper ailleurs
  // décalerait tout ce qui suit.
  return Buffer.from(data.slice(0, Math.ceil(bytes / 3) * 4), 'base64')
}

/**
 * Les dimensions d'une image, lues dans son en-tête.
 *
 * Elles sont les seules à donner le coût en tokens — le poids du fichier n'en
 * dit rien, une capture d'écran compressant cent fois mieux qu'une photo de
 * même taille. On lit donc l'en-tête, quelques dizaines d'octets, plutôt que de
 * décoder les 130 Ko de la capture.
 *
 * PNG et GIF portent leurs dimensions à position fixe. JPEG les cache dans un
 * segment `SOF`, qu'il faut atteindre en sautant de marqueur en marqueur. WebP
 * n'est pas lu : Claude Code n'en écrit pas, et l'appelant sait rendre l'absence.
 */
export function imageSize(data: string, mediaType: string): { width: number; height: number } | null {
  if (mediaType === 'image/png') {
    const b = head(data, 24)
    // 8 octets de signature, puis le chunk IHDR : longueur, type, largeur, hauteur.
    if (b.length < 24 || b.toString('ascii', 12, 16) !== 'IHDR') return null
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }

  if (mediaType === 'image/gif') {
    const b = head(data, 10)
    if (b.length < 10) return null
    return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  }

  if (mediaType === 'image/jpeg') {
    // Les segments précédant l'image (EXIF, vignette, table de Huffman) peuvent
    // être volumineux ; 64 Ko couvrent les cas réels sans tout décoder.
    const b = head(data, 64 * 1024)
    let i = 2 // après le SOI `FF D8`
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null // désynchronisé : on ne devine pas
      const marker = b[i + 1] ?? 0
      const length = b.readUInt16BE(i + 2)
      // Les SOF0…SOF15 portent les dimensions ; DHT (C4), JPG (C8) et DAC (CC)
      // partagent leur plage sans les porter.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
      }
      i += 2 + length
    }
  }

  return null
}

/**
 * Ce qu'une image coûte au contexte, en tokens visuels.
 *
 * Le modèle ne lit pas des pixels mais des pavés de 28×28 : une image vaut
 * `⌈largeur/28⌉ × ⌈hauteur/28⌉` tokens. Au-delà des limites de son palier elle
 * est réduite avant traitement, ce qui plafonne le coût — d'où les deux bornes,
 * le grand côté et le nombre de tokens.
 *
 * Le repli sur le plafond après réduction est une approximation : le
 * redimensionnement réel vise le plus grand format qui tient dans les deux
 * bornes, et atterrit donc quelques tokens sous le plafond (1 560 plutôt que
 * 1 568 pour une image 16:9 en palier standard). Un demi-pourcent d'écart, sur
 * une estimation déjà annoncée comme telle.
 */
const PATCH = 28

export function visualTokens(width: number, height: number, hiRes: boolean): number {
  const maxEdge = hiRes ? 2576 : 1568
  const maxTokens = hiRes ? 4784 : 1568
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  return Math.min(maxTokens, Math.ceil(w / PATCH) * Math.ceil(h / PATCH))
}

/**
 * La session tourne-t-elle sur un modèle à vision haute résolution ?
 *
 * Claude 4.7 et les suivants lisent jusqu'à 2 576 px sur le grand côté, contre
 * 1 568 avant — soit jusqu'à trois fois plus de tokens pour la même capture. Le
 * palier ne se déduit donc pas de l'image seule, il se déduit du modèle. Une
 * session qui a changé de modèle en route est comptée au palier le plus large :
 * c'est le seul qui ne sous-estime aucune de ses images.
 */
const HI_RES_MODEL = /opus-(4-[789]|[5-9])|sonnet-[5-9]|haiku-[5-9]|fable|mythos/

/** Ce modèle lit-il les images au palier haute résolution ? */
export function isHiResVisionModel(model: string): boolean {
  return HI_RES_MODEL.test(model)
}

/** Le coût total d'un lot d'images, les non chiffrables comptant pour zéro. */
export function imageTokens(images: TranscriptImage[] | undefined): number {
  return (images ?? []).reduce((sum, img) => sum + (img.tokens ?? 0), 0)
}

function hasHiResVision(rows: Record<string, unknown>[]): boolean {
  return rows.some((r) => {
    const model = (r.message as Record<string, unknown> | undefined)?.model
    return typeof model === 'string' && isHiResVisionModel(model)
  })
}

interface RowImages {
  /** Par `tool_use_id` : les images que cet outil a rendues. */
  byTool: Map<string, TranscriptImage[]>
  /** Les images posées directement dans la ligne, dans l'ordre. */
  loose: TranscriptImage[]
}

/** Les adresses des images d'une ligne, rangées par propriétaire. */
function rowImages(row: Record<string, unknown>, hiRes: boolean): RowImages {
  const uuid = str(row.uuid)
  const agentId = str(row.agentId)
  const byTool = new Map<string, TranscriptImage[]>()
  const loose: TranscriptImage[] = []
  if (!uuid) return { byTool, loose } // sans `uuid`, rien ne l'adresse

  eachImage((row.message as Record<string, unknown> | undefined)?.content, (source, toolUseId, index) => {
    const data = str(source.data)
    const mediaType = str(source.media_type, 'image/png')
    const size = data ? imageSize(data, mediaType) : null
    const img: TranscriptImage = {
      uuid,
      index,
      ...(agentId ? { agentId } : {}),
      mediaType,
      bytes: decodedBytes(data),
      ...(size ? { ...size, tokens: visualTokens(size.width, size.height, hiRes) } : {}),
    }
    if (!toolUseId) loose.push(img)
    else byTool.set(toolUseId, [...(byTool.get(toolUseId) ?? []), img])
  })
  return { byTool, loose }
}

/*
 * A self-hosted backend behind ANTHROPIC_BASE_URL emits no `thinking` block:
 * models of the MiniMax / Qwen / DeepSeek family open their answer with their
 * reasoning, wrapped in a <think> prefix. Lifting it out is what earns those
 * transcripts the same folded rendering as Claude's — holding, this time, the
 * text Claude itself no longer keeps.
 */
const INLINE_REASONING = /^\s*<(think|thinking)>([\s\S]*?)<\/\1>/

function splitInlineReasoning(text: string): Block[] {
  const m = INLINE_REASONING.exec(text)
  // An unclosed tag means a truncated turn: nothing reliable to split on.
  if (!m) return [{ kind: 'text', text }]
  const out: Block[] = []
  const reasoning = (m[2] ?? '').trim()
  if (reasoning) out.push({ kind: 'thinking', text: reasoning })
  const rest = text.slice(m[0].length).trim()
  if (rest) out.push({ kind: 'text', text: rest })
  return out
}

/**
 * Coerce a message `content` (string | block[]) into normalised blocks.
 * `inlineReasoning` is for assistant rows only — a user writing <think> in
 * their own prompt means it literally.
 */
function toBlocks(content: unknown, images?: RowImages, inlineReasoning = false): Block[] {
  if (typeof content === 'string') {
    return content.trim() ? [{ kind: 'text', text: content }] : []
  }
  if (!Array.isArray(content)) return []
  const out: Block[] = []
  const loose = [...(images?.loose ?? [])]
  for (const b of content as Record<string, unknown>[]) {
    switch (b.type) {
      case 'text':
        if (typeof b.text === 'string' && b.text.length) {
          out.push(...(inlineReasoning ? splitInlineReasoning(b.text) : [{ kind: 'text', text: b.text } as Block]))
        }
        break
      case 'thinking':
        // Claude Code strips the reasoning text before writing to disk and keeps
        // only the opaque `signature`. There is nothing to render, but the block
        // still tells us Claude reasoned here.
        if (typeof b.thinking === 'string') {
          out.push(b.thinking.length ? { kind: 'thinking', text: b.thinking } : { kind: 'thinking', text: '', redacted: true })
        }
        break
      case 'tool_use':
        out.push({
          kind: 'tool_use',
          id: str(b.id),
          name: str(b.name, 'tool'),
          input: b.input ?? {},
          result: null,
        })
        break
      case 'tool_result': {
        const id = str(b.tool_use_id)
        const shots = images?.byTool.get(id)
        out.push({
          kind: 'tool_result',
          toolUseId: id,
          content: resultToText(b.content),
          isError: Boolean(b.is_error),
          ...(shots?.length ? { images: shots } : {}),
        })
        break
      }
      case 'image': {
        const img = loose.shift()
        out.push({ kind: 'image', ...(img ? { images: [img] } : {}) })
        break
      }
      default:
        break
    }
  }
  return out
}

/**
 * A tool_result `content` may be a string or an array of {type:'text',text}.
 *
 * Une image n'y laisse rien : elle est rendue pour elle-même (voir `rowImages`),
 * et un `[image]` en toutes lettres à côté de la capture ne dirait que ce que la
 * capture montre déjà. Un `Read` de PNG a donc un résultat textuel vide — c'est
 * exact, tout son résultat est l'image.
 */
export function resultToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => str((c as Record<string, unknown>).text))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/** Pull the inner text of a `<tag>…</tag>` from a task-notification blob. */
function xmlTag(src: string, name: string): string | undefined {
  const m = src.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return m?.[1]?.trim()
}

/**
 * A `<task-notification>` blob (emitted when a background sub-agent stops) → a
 * single structured block. The `<result>` is the agent's actual report
 * (markdown); the rest is bookkeeping we keep aside so the UI can tuck it away.
 *
 * La même enveloppe annonce la fin d'un `Bash` lancé en arrière-plan — le
 * `<task-id>` est alors l'identifiant du shell, et le `<summary>` porte son code
 * de sortie. `server/agent/shells.ts` s'en sert pour cela, d'où l'export.
 *
 * Le harnais l'écrit de deux façons selon ce que la session faisait à l'instant
 * où l'agent a rendu la main — ligne `user` injectée si elle attendait,
 * `attachment` dépilé de la file si elle travaillait. Les deux arrivent ici.
 */
export function parseTaskNotification(raw: string): Block {
  return {
    kind: 'task_notification',
    summary: xmlTag(raw, 'summary'),
    status: xmlTag(raw, 'status'),
    note: xmlTag(raw, 'note'),
    outputFile: xmlTag(raw, 'output-file'),
    // `<task-id>` is the sub-agent's `agentId`: the tie from a report back to
    // the run that produced it. `agentType` is filled in once the sidecars are
    // known — see the identity pass at the end of `parseTranscript`.
    taskId: xmlTag(raw, 'task-id'),
    text: xmlTag(raw, 'result') ?? '',
  }
}

// ── Messages reçus d'un équipier ─────────────────────────────────────────────
//
// Quand une équipe travaille, chaque message qu'un agent reçoit lui arrive dans
// une ligne `user` ordinaire, enveloppé d'un `<teammate-message>`. Rien ne
// distingue cette ligne d'un prompt tapé : ni `origin`, ni `isMeta`, ni
// `promptSource` — mesuré sur les 86 lignes du parc, aucune n'en porte un. La
// timeline attribuait donc à l'humain des mots qu'il n'a jamais écrits, balise
// comprise, et le markdown du corps restait en texte brut.
//
// 100 blocs, 61 messages et 39 signaux de service, chez 4 expéditeurs.

const TEAMMATE = /<teammate-message\b([^>]*)>([\s\S]*?)<\/teammate-message>/g
const ATTRIBUTE = /(\w+)="([^"]*)"/g

/**
 * Les signaux que le harnais fait passer par le même canal que la parole. Leur
 * corps est un JSON dont seul le `type` porte du sens pour un lecteur : le reste
 * — horodatage, identifiant de requête, identifiant de panneau tmux — est de la
 * plomberie. Ils sont rendus comme un état, pas comme un message.
 */
const NOTICES = new Set(['idle_notification', 'shutdown_request', 'shutdown_approved', 'teammate_terminated'])

/**
 * Les `<teammate-message>` d'un texte, ou `null` s'il n'en porte pas.
 *
 * Un texte peut en porter plusieurs — 9 fois dans le parc, jusqu'à deux arrêts
 * approuvés d'affilée — et peut aussi porter autre chose autour : ce qui reste
 * une fois les blocs retirés est gardé comme un bloc de texte à sa place.
 */
function teammateBlocks(text: string): Block[] | null {
  const found = [...text.matchAll(TEAMMATE)]
  if (!found.length) return null

  const out: Block[] = []
  let at = 0
  for (const m of found) {
    const before = text.slice(at, m.index).trim()
    if (before) out.push({ kind: 'text', text: before })
    at = (m.index ?? 0) + m[0].length

    const attrs: Record<string, string> = {}
    for (const a of (m[1] ?? '').matchAll(ATTRIBUTE)) attrs[a[1] ?? ''] = a[2] ?? ''
    const body = (m[2] ?? '').trim()

    const block: Block = { kind: 'teammate_message', text: body }
    if (attrs.teammate_id) block.from = attrs.teammate_id
    if (attrs.color) block.color = attrs.color
    if (attrs.summary) block.summary = attrs.summary

    if (body.startsWith('{')) {
      let signal: unknown
      try {
        signal = JSON.parse(body)
      } catch {
        signal = null
      }
      const type = str((signal as Record<string, unknown> | null)?.type)
      if (NOTICES.has(type)) {
        const fields = signal as Record<string, unknown>
        block.notice = type
        block.text = ''
        // Ce que le signal apprend en propre, et que son type ne dit pas :
        // `idle_notification` porte parfois le résumé de ce que l'équipier vient
        // de finir (13 fois sur 22), `shutdown_request` la raison de l'arrêt
        // (7 fois sur 7). Le reste — horodatage, identifiant de requête,
        // identifiant de panneau tmux — ne se lit pas.
        const said = str(fields.summary) || str(fields.reason)
        if (said && !block.summary) block.summary = said
        // `teammate_terminated` arrive au nom de `system` : c'est le harnais qui
        // parle, pas l'agent. Seule sa phrase — « rf has shut down. » — dit de
        // qui il s'agit, et sans elle le rejeu annonce un arrêt sans arrêté.
        const who = /^(\S+) has shut down\.$/.exec(str(fields.message))
        if (who) block.from = who[1]
      }
    }
    out.push(block)
  }
  const after = text.slice(at).trim()
  if (after) out.push({ kind: 'text', text: after })
  return out
}

// ── Session titles ───────────────────────────────────────────────────────────

/**
 * Accumulates the session title while walking a transcript's rows.
 *
 * Two row types carry one: `custom-title` (`customTitle`, typed by the user) and
 * `ai-title` (`aiTitle`, generated). A user-chosen name always wins.
 *
 * Both are re-emitted many times per session, and the generated one genuinely
 * *changes* as the session's subject drifts — so the last occurrence is the
 * current title, not the first.
 */
export class TitleAccumulator {
  private custom = ''
  private ai = ''

  /** Feed every parsed row; cheap enough to call unconditionally. */
  push(row: Record<string, unknown>): void {
    if (row.type === 'custom-title') {
      const t = str(row.customTitle).trim()
      if (t) this.custom = t
    } else if (row.type === 'ai-title') {
      const t = str(row.aiTitle).trim()
      if (t) this.ai = t
    }
  }

  get title(): string {
    return this.custom || this.ai
  }

  get source(): TitleSource {
    if (this.custom) return 'custom'
    if (this.ai) return 'ai'
    return ''
  }
}

function normUsage(u: Record<string, unknown> | undefined): Usage | undefined {
  if (!u) return undefined
  return {
    input: Number(u.input_tokens ?? 0),
    output: Number(u.output_tokens ?? 0),
    cacheRead: Number(u.cache_read_input_tokens ?? 0),
    cacheCreate: Number(u.cache_creation_input_tokens ?? 0),
  }
}

// `growth` vient de `tokens.ts`, comme pour `usage.ts` et le diagnostic. Il en
// existait ici une copie mot pour mot : trois pliages identiques qu'aucun test ne
// tenait ensemble, et dont le premier à dériver aurait fait dire à cette page un
// coût que la page Usage contredisait. `Usage` et `TokenCounts` portent les mêmes
// champs — le typage structurel suffit à les faire coïncider.

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Keep only the non-blank strings of a value that should be `string[]`. */
function strList(v: unknown): string[] {
  if (typeof v === 'string') return v.trim() ? [v] : []
  if (!Array.isArray(v)) return []
  return v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
}

/**
 * A hook's stdout is JSON — the harness reads `hookSpecificOutput.additionalContext`
 * from it and feeds that back to Claude. Anything else in there is bookkeeping.
 */
function contextFromStdout(stdout: string): string[] {
  if (!stdout) return []
  try {
    const j = JSON.parse(stdout) as Record<string, unknown>
    const specific = j.hookSpecificOutput as Record<string, unknown> | undefined
    return strList(specific?.additionalContext)
  } catch {
    return [] // not JSON → nothing to extract
  }
}

/** `stop_hook_summary` → `Stop`; `subagent_stop_hook_summary` → `SubagentStop`. */
/**
 * Dig the human-readable reason out of an `api_error` payload.
 *
 * Claude Code has written that payload two ways, and both are in the corpus:
 *   { message: "529 {…}", status, requestId, … }              (16 rows)
 *   { status: 529, error: { error: { message: "Overloaded" } } } (91 rows)
 *
 * So we walk the nesting rather than reach for one field. Depth is capped: this
 * runs per row over transcripts we do not control.
 */
function errorMessage(value: unknown, depth = 0): string {
  if (!value || typeof value !== 'object' || depth > 3) return ''
  const o = value as Record<string, unknown>
  const own = str(o.message)
  if (own) return own
  return errorMessage(o.error, depth + 1)
}

/**
 * A `system` row that is really a slash command.
 *
 * `/compact` writes its echo as three `user` rows; `/doctor` and `/model` write
 * theirs as `subtype: local_command` system rows instead. Same markup, same
 * meaning — so give them the same origin, and the timeline renders them the same
 * way rather than as a bare "Système · local_command" label.
 *
 * Returning `null` means "not a local command row" and hands the row back to
 * `systemBlocks`. A recognised row always returns, even with no block to show:
 * `/clear` says `<local-command-stdout></local-command-stdout>` — it ran, it had
 * nothing to say — and falling through would print that markup verbatim.
 */
function localCommandSystem(r: Record<string, unknown>): { blocks: Block[]; origin: string } | null {
  const content = typeof r.content === 'string' ? r.content : ''
  const kind = content ? classifyLocalCommand(content) : null
  if (!kind) return null

  if (kind === 'command' || kind === 'bash') {
    const block = kind === 'bash' ? bashInputBlock(content) : slashCommandBlock(content)
    return { blocks: block ? [block] : [], origin: 'slash-command' }
  }
  if (kind === 'stdout') {
    const out = commandOutput(content)
    return { blocks: out ? [{ kind: 'text', text: out }] : [], origin: 'command-output' }
  }
  if (kind === 'reminder') {
    const inner = content.replace(/<\/?system-reminder>/g, '').trim()
    return { blocks: inner ? [{ kind: 'text', text: inner }] : [], origin: 'system' }
  }
  return { blocks: [], origin: 'system' } // caveat: boilerplate the CLI writes for itself.
}

/**
 * What a `system` row has to say, if anything.
 *
 * Most carry a `content` string. `api_error` carries none — the reason lives
 * under `error`, so a row that explains why a turn died used to render as a bare
 * "Système · api_error" label with no text at all. The rest — `turn_duration`,
 * `away_summary`, `bridge_status` — say nothing and yield no block, which lets
 * the timeline drop them instead of drawing an empty row.
 */
function systemBlocks(r: Record<string, unknown>): Block[] {
  if (typeof r.content === 'string' && r.content) return [{ kind: 'text', text: r.content }]

  const error = r.error
  if (!error || typeof error !== 'object') return []
  const status = num((error as Record<string, unknown>).status)
  const message = errorMessage(error)
  const text = message || (status ? `Erreur HTTP ${status}` : '')
  if (!text) return []

  // The first shape already prefixes its status; do not print it twice.
  const prefixed = status && !text.startsWith(String(status)) ? `HTTP ${status} — ${text}` : text
  return [{ kind: 'text', text: prefixed }]
}

// Colour and cursor codes a terminal wrote into a captured stdout. The escape
// byte is required: without it this would also eat `[2]` out of ordinary prose.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

/** What a `user` row really is, when it opens with harness markup. */
type LocalRow = 'caveat' | 'command' | 'bash' | 'stdout' | 'reminder' | 'teammate'

/**
 * A `user` row the CLI wrote about itself, not one the human typed.
 *
 * Running `/compact` produces three rows, all `type: "user"`, none carrying an
 * `origin` — so the naive read is "the human said `<command-name>/compact…`".
 * They are, in order:
 *   `<local-command-caveat>` boilerplate telling the model to ignore what follows
 *   `<command-name>/compact</command-name>` + `<command-args>`
 *   `<local-command-stdout>` with the CLI's own output, ANSI codes and all
 *
 * Three more shapes appear in the corpus: `/init` writes `<command-message>`
 * *before* `<command-name>`, a `!cmd` prefix writes `<bash-input>` / `<bash-stdout>`,
 * and a side question arrives wrapped in `<system-reminder>`.
 */
function classifyLocalCommand(text: string): LocalRow | null {
  const t = text.trimStart()
  if (t.startsWith('<local-command-caveat>')) return 'caveat'
  if (t.startsWith('<bash-input>')) return 'bash'
  if (
    t.startsWith('<local-command-stdout>') ||
    t.startsWith('<local-command-stderr>') ||
    t.startsWith('<bash-stdout>') ||
    t.startsWith('<bash-stderr>')
  ) {
    return 'stdout'
  }
  if (t.startsWith('<command-name>') || t.startsWith('<command-message>')) return 'command'
  if (t.startsWith('<system-reminder>')) return 'reminder'
  return null
}

function tag(text: string, name: string): string {
  return new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)?.[1]?.trim() ?? ''
}

/** Turn a `<command-name>` row into one block; `null` when it names nothing. */
function slashCommandBlock(text: string): Block | null {
  const name = tag(text, 'command-name')
  if (!name) return null
  return { kind: 'slash_command', name, text: tag(text, 'command-args') }
}

/** A `!cmd` the user ran straight from the prompt. */
function bashInputBlock(text: string): Block | null {
  const command = tag(text, 'bash-input')
  return command ? { kind: 'slash_command', name: '!', text: command } : null
}

/** The CLI's own stdout, stripped of tags and terminal codes. Empty → nothing said. */
function commandOutput(text: string): string {
  return text
    .replace(/<\/?(local-command|bash)-std(out|err)>/g, '')
    .replace(ANSI, '')
    .trim()
}

/** Who a `user` row came from. A slash command is the CLI, not the human. */
function userOrigin(injected: boolean, originKind: string | undefined, localRow: LocalRow | null, compactSummary: boolean): string {
  if (localRow === 'command' || localRow === 'bash') return 'slash-command'
  if (localRow === 'stdout') return 'command-output'
  // Un équipier, pas l'humain. Sans cette origine la ligne s'affiche en « Vous ».
  if (localRow === 'teammate') return 'teammate'
  // The history a compaction kept, re-sent as a `user` row. Nobody typed it.
  if (compactSummary) return 'compact-summary'
  if (localRow === 'reminder') return 'system'
  if (injected) return originKind ?? 'system'
  return 'human'
}

/**
 * Le message que l'humain a tapé pendant que l'agent travaillait, ou `null`.
 *
 * Écrire pendant un tour ne produit pas une ligne `user` : le CLI met le texte
 * en file, puis le dépile *au milieu* du tour sous forme d'`attachment`. Le
 * message a bien été reçu — la suite du tour y répond — mais il n'a jamais eu
 * de ligne à son nom, et la timeline le perdait donc entièrement. 180 messages
 * dans le parc, sur 116 sessions.
 *
 * Seule une `origin.kind` humaine passe : la file transporte aussi ce que le
 * harnais s'envoie à lui-même, et le rendre comme « Vous » serait le même
 * mensonge que pour une ligne `user` injectée.
 */
function queuedHumanPrompt(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const a = value as Record<string, unknown>
  if (str(a.type) !== 'queued_command') return ''
  const origin = a.origin as Record<string, unknown> | undefined
  if (str(origin?.kind) !== 'human') return ''
  return str(a.prompt).trim()
}

/**
 * La notification de fin qu'un `attachment` porte, ou `''`.
 *
 * Un agent qui rend la main pendant que la session travaille ne produit pas de
 * ligne `user` : sa notification passe par la même file que ce qu'on tape en
 * cours de tour, et ressort en `attachment.queued_command` — reconnaissable à
 * son `commandMode`, qui joue ici le rôle que `origin.kind` joue sur une ligne
 * `user`. C'est la moitié du corpus : **100 notifications de cette forme contre
 * 97 de l'autre**, et 27 sessions n'ont que celle-ci.
 *
 * Sans elle, `runStatus` ne trouve que le résultat de l'appel — « Async agent
 * launched » — et laisse le run « au travail » pour toujours, alors qu'il a
 * fini, rapport compris.
 */
function queuedTaskNotification(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const a = value as Record<string, unknown>
  if (str(a.type) !== 'queued_command') return ''
  if (str(a.commandMode) !== 'task-notification') return ''
  return str(a.prompt).trim()
}

/**
 * La borne de mode plan qu'un `attachment` porte, ou `null`.
 *
 * Trois types la disent, et il faut les trois : `plan_mode` ouvre (142 au parc),
 * `plan_mode_exit` ferme (158), `plan_mode_reentry` reprend un plan déjà
 * commencé (45). Le quatrième, `plan_file_reference`, porte le plan lui-même et
 * revient à la comptabilité du contexte, où `classifyAttachment` le traite
 * déjà — ce n'est pas une borne.
 *
 * Sont écartés : `reminderType`, `"full"` sur les 142, et `isSubAgent`, `false`
 * sur les 142 — les attachments de sidechain sont de toute façon exclus en
 * amont.
 */
function planModeMark(value: unknown): PlanModeMark | null {
  if (!value || typeof value !== 'object') return null
  const a = value as Record<string, unknown>
  const phase =
    str(a.type) === 'plan_mode' ? 'enter' : str(a.type) === 'plan_mode_exit' ? 'exit' : str(a.type) === 'plan_mode_reentry' ? 'reentry' : null
  if (!phase) return null
  const mark: PlanModeMark = { phase, planFilePath: str(a.planFilePath) }
  if (typeof a.planExists === 'boolean') mark.planExists = a.planExists
  return mark
}

/**
 * Marquer ce qui s'est joué en mode plan, et dire à l'ouverture ce que ça couvre.
 *
 * Le compte des bornes ne tombe juste ni au parc ni session par session — **45
 * sessions sur 133** sont déséquilibrées, et ce n'est pas un défaut de lecture :
 * le mode plan traverse les frontières de session. Une session reprise
 * (`--continue`) démarre dans un régime ouvert par la précédente et ne porte
 * qu'une sortie ; à l'inverse, **13 sessions** finissent sans jamais se fermer.
 *
 * D'où les deux refus de cette passe : une sortie orpheline ne fait rien
 * rétroactivement — inventer son ouverture reviendrait à teinter des tours dont
 * on ne sait pas s'ils étaient contraints — et une ouverture jamais fermée court
 * jusqu'au dernier événement sans qu'on lui compte de tours.
 *
 * `reentry` ne rouvre rien : le CLI l'émet à l'intérieur d'un régime déjà en
 * cours, et la traiter comme une ouverture couperait la portée en deux.
 */
function markPlanMode(events: TranscriptEvent[]): void {
  let open: PlanModeMark | null = null
  let turns = 0
  /** Les rappels redondants, retirés du fil une fois la passe finie. */
  const drop = new Set<TranscriptEvent>()

  for (const ev of events) {
    // Un sous-agent a son propre régime, qui n'est pas celui de la session.
    if (ev.isSidechain) continue

    const phase = ev.planMode?.phase
    if (phase === 'enter') {
      // Le CLI réémet le rappel à l'intérieur d'un régime déjà ouvert : 4 fois
      // au parc, toujours pour le même fichier de plan, entre 66 et 249 lignes
      // après l'ouverture. Le prendre pour une entrée poserait un second
      // marqueur au milieu du séjour et repartirait le compte de tours à zéro.
      // La ligne ne porte rien d'autre, donc elle sort du fil : la garder vidée
      // la ferait tomber dans le bloc « Système » générique.
      if (open) {
        drop.add(ev)
        continue
      }
      open = ev.planMode ?? null
      turns = 0
      continue
    }
    if (phase === 'exit') {
      if (open) open.turns = turns
      open = null
      continue
    }
    if (phase === 'reentry') continue

    if (!open) continue
    ev.inPlanMode = true
    if (ev.kind === 'assistant') turns++
  }
  // Régime encore ouvert à la dernière ligne : les tours sont marqués, mais
  // aucun total n'est annoncé — il n'est pas clos.

  for (let i = events.length - 1; i >= 0; i--) {
    if (drop.has(events[i]!)) events.splice(i, 1)
  }
}

function summaryEvent(subtype: string): string {
  return subtype
    .replace(/_hook_summary$/, '')
    .split('_')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('')
}

function isHookSummary(subtype: string | undefined): boolean {
  return typeof subtype === 'string' && subtype.endsWith('_hook_summary')
}

/**
 * A run says nothing when it neither reported an error nor produced anything
 * Claude could act on. Its only trace worth keeping is that it ran, and how long.
 */
function isSilent(run: HookRun): boolean {
  return run.status === 'ok' && !run.context?.length && !run.stderr
}

/** An `attachment.hook_*` payload → a run, or `null` if it carries nothing. */
function hookRunFromAttachment(a: Record<string, unknown>): HookRun | null {
  const type = str(a.type)
  if (!type.startsWith('hook_')) return null

  const name = str(a.hookName)
  const run: HookRun = {
    event: str(a.hookEvent, name.split(':')[0] ?? 'hook'),
    name: name || 'hook',
    status: 'ok',
  }
  if (typeof a.toolUseID === 'string' && a.toolUseID) run.toolUseId = a.toolUseID
  if (typeof a.command === 'string' && a.command) run.command = a.command
  if (typeof a.durationMs === 'number') run.durationMs = a.durationMs
  if (typeof a.exitCode === 'number') run.exitCode = a.exitCode

  const stdout = typeof a.stdout === 'string' ? a.stdout.trim() : ''
  const stderr = typeof a.stderr === 'string' ? a.stderr.trim() : ''
  if (stdout) run.stdout = stdout
  if (stderr) run.stderr = stderr

  switch (type) {
    case 'hook_blocking_error': {
      const be = a.blockingError
      const msg = typeof be === 'string' ? be : str((be as Record<string, unknown> | undefined)?.blockingError)
      run.status = 'blocked'
      run.error = msg.trim() || stderr || 'Le hook a interrompu le tour.'
      return run
    }
    case 'hook_non_blocking_error': {
      run.status = 'error'
      run.error = stderr || t('hooks.failed', { code: run.exitCode ?? '?' })
      return run
    }
    case 'hook_success': {
      const ctx = contextFromStdout(stdout)
      if (ctx.length) {
        run.context = ctx
        run.status = 'context'
      }
      return run
    }
    case 'hook_additional_context': {
      const ctx = strList(a.content)
      if (!ctx.length) return null
      run.context = ctx
      run.status = 'context'
      return run
    }
    default:
      return null
  }
}

/**
 * A `*_hook_summary` system row → one run per hook the harness ran. Errors,
 * injected context and `preventedContinuation` are reported for the batch as a
 * whole, so they are pinned onto the first run.
 */
function hookRunsFromSummary(r: Record<string, unknown>): HookRun[] {
  const event = summaryEvent(str(r.subtype)) || 'Hook'
  const infos = Array.isArray(r.hookInfos) ? (r.hookInfos as Record<string, unknown>[]) : []
  const errors = strList(r.hookErrors)
  const context = strList(r.hookAdditionalContext)
  const prevented = Boolean(r.preventedContinuation)
  const stopReason = typeof r.stopReason === 'string' ? r.stopReason.trim() : ''

  const list = infos.length ? infos : [{}]
  return list.map((info, i) => {
    const run: HookRun = { event, name: event, status: 'ok' }
    if (typeof info.command === 'string' && info.command) run.command = info.command
    if (typeof info.durationMs === 'number') run.durationMs = info.durationMs
    if (i !== 0) return run

    if (context.length) {
      run.context = context
      run.status = 'context'
    }
    if (errors.length) {
      run.status = 'error'
      run.error = errors.join('\n')
    }
    if (prevented) {
      run.status = 'blocked'
      run.error = stopReason || errors.join('\n') || t('hooks.blocked')
    }
    return run
  })
}

/** Accumulates the silent runs into a per-command tally. */
class SilentHookTally {
  private readonly byCommand = new Map<string, SilentHookGroup>()
  private count = 0
  private durationMs = 0

  add(run: HookRun): void {
    const command = run.command ?? run.name
    const ms = run.durationMs ?? 0
    this.count++
    this.durationMs += ms
    const g = this.byCommand.get(command)
    if (g) {
      g.count++
      g.durationMs += ms
    } else {
      this.byCommand.set(command, { command, count: 1, durationMs: ms })
    }
  }

  result(): SilentHooks {
    return {
      count: this.count,
      durationMs: this.durationMs,
      groups: [...this.byCommand.values()].sort((a, b) => b.count - a.count),
    }
  }
}

/**
 * The text of a tool call's arguments, as the model was billed for them.
 *
 * The transcript stores `input` parsed back into an object; what crossed the wire
 * was its JSON. Re-serialising is the closest recoverable form — it differs only
 * in the whitespace neither side sent. A `Write` puts an entire file in here, so
 * this is not a rounding error.
 */
function toolInputText(input: unknown): string {
  if (input === undefined || input === null) return ''
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input)
  } catch {
    // Cyclic input cannot have come from JSONL, but a parser must not throw.
    return ''
  }
}

// ── Résultat structuré d'un outil ────────────────────────────────────────────
//
// À côté du texte qu'il rend au modèle, le harness écrit parfois un objet sur la
// ligne du résultat (`toolUseResult`). Pour la plupart des outils il ne fait que
// redire le texte sous forme de champs — et il pèse : 1,3 Ko en médiane sur ce
// corpus, mais jusqu'à 106 Ko sur un `Read`, 61 Ko sur un `Write`. Le transcript
// parsé passe par le cache du BFF, alors le garder pour tout le monde coûterait
// cher pour ne montrer, la plupart du temps, rien de neuf.
//
// D'où une liste blanche : on ne retient que les outils dont le résultat
// structuré porte une information que sa phrase ne porte pas. `Artifact` est le
// premier cas — l'URL publiée, le titre et le numéro de version y sont des
// champs, alors qu'ils ne sont dans le texte qu'au milieu d'un paragraphe.

/** Champs retenus par outil — jamais l'objet entier, toujours une projection. */
const STRUCTURED_RESULT: Record<string, readonly string[]> = {
  Artifact: ['url', 'title', 'path', 'version', 'updated', 'liveSubscription'],
  // Les réponses effectivement choisies, sous forme de carte question → réponse.
  // Le `questions` que le sidecar renvoie aussi n'est pas retenu : c'est l'écho
  // de l'entrée, que le bloc porte déjà. Mesuré sur 342 appels : 190 octets en
  // médiane, 840 au maximum.
  // `afkTimeoutMs` s'y ajoute pour les questions restées sans réponse : le
  // harness a repris la main tout seul au bout du délai, et sans ce champ le
  // rejeu affiche « en attente » pour une question que personne n'a jamais vue.
  AskUserQuestion: ['answers', 'afkTimeoutMs'],
  // Le nombre d'outils encore différés au moment de la recherche. Il ne se
  // déduit de rien d'autre, et il varie d'un ordre de grandeur d'un appel à l'autre.
  ToolSearch: ['total_deferred_tools'],
  // Le statut HTTP de la page, et son poids avant extraction. Une part non
  // négligeable des appels rapportent autre chose qu'un 200 — échecs (404, 403,
  // 402) et redirections non suivies — sans qu'aucun ne soit marqué `is_error` :
  // le rejeu les présentait donc exactement comme une réussite.
  // `url` n'est pas retenu : il est toujours l'écho exact de l'entrée,
  // redirections comprises. Ni `result`, qui redouble le texte et peut peser des
  // dizaines de Ko — c'est précisément ce contre quoi la liste blanche existe.
  WebFetch: ['code', 'codeText', 'bytes'],
  // Le seul signal du harness disant que l'utilisateur a retouché le plan avant
  // de l'approuver. Le rejeu le devinait en comparant le plan proposé à la copie
  // que le résultat renvoie ; sur 142 plans approuvés, cette comparaison a
  // produit 3 divergences, les 3 fausses — le fichier de plan est partagé par
  // toute la session, et la copie porte alors un plan tout à fait différent.
  // Le drapeau seul ne suffit pas non plus : il vaut `true` 10 fois pour un plan
  // rigoureusement identique. Aucun des deux ne dit la vérité ; croisés, ils la
  // disent. Un booléen, coût nul.
  // `plan` n'est pas retenu — jusqu'à 14,6 Ko de doublon du texte. Ni `filePath`,
  // écho exact du `planFilePath` de l'entrée, 142 fois sur 142. Ni `isAgent`
  // (`false` 142 fois sur 142) ni `hasTaskTool` (`true` 47 fois sur 47).
  ExitPlanMode: ['planWasEdited'],
  // L'identifiant que le harness attribue à la tâche créée — `{id, subject}`.
  // C'est la seule clé fiable pour raccrocher les `TaskUpdate` qui suivront à la
  // tâche qu'ils font avancer ; le rang de l'appel ne l'est pas.
  //
  // Cette entrée ne sert plus qu'à relire le passé, et ce n'est pas un oubli.
  // Les outils de suivi de tâches — `TaskCreate`, `TaskGet`, `TaskUpdate`,
  // `TaskList`, `TodoWrite` — sont sortis de la surface par défaut des modèles
  // récents (CLI 2.1.233, en écho à un réglage serveur antérieur) : les sessions
  // nouvelles n'en produisent plus. Les transcripts déjà écrits, eux, en sont
  // pleins, et le rejeu doit continuer de les lire — d'où le maintien de la
  // liste blanche et du raccrochage. Aucun réglage ne les rallume côté AURA :
  // l'Atelier garde de quoi les afficher, sans exposer le choix.
  TaskCreate: ['task'],
  // Rien à retenir à plat : le seul champ utile de `Skill` est un tableau, et
  // il se lit dans `STRUCTURED_DERIVED`. L'entrée doit exister quand même —
  // c'est elle qui autorise l'outil à être lu du tout.
  Skill: [],
}

/**
 * Champs *dérivés* — quand ce qu'on veut est enfoui sous une clé qu'on ne veut
 * pas retenir entière. La liste blanche plate ne sait pas l'exprimer ; ces
 * fonctions si, sans pour autant rouvrir `flatMap` à l'imbrication.
 */
const STRUCTURED_DERIVED: Record<string, (source: Record<string, unknown>) => Record<string, unknown> | null> = {
  // `annotations` est une carte question → `{ preview?, notes? }`. Le `preview`
  // n'est que l'écho de l'option choisie, que le bloc porte déjà, et c'est lui
  // qui pèse ; les `notes` sont de la parole d'utilisateur, qu'on ne lit nulle
  // part ailleurs. Les notes sont rares, et il arrive que la note *soit* la
  // réponse — `answers` n'y porte alors que le marqueur `(notes only)`.
  AskUserQuestion: (source) => {
    const a = source.annotations
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null
    const notes: Record<string, string> = {}
    for (const [question, ann] of Object.entries(a as Record<string, unknown>)) {
      if (!ann || typeof ann !== 'object' || Array.isArray(ann)) continue
      const n = (ann as Record<string, unknown>).notes
      if (typeof n === 'string' && n) notes[question] = n
    }
    return Object.keys(notes).length ? { notes } : null
  },
  // `matches` est la liste des outils que la recherche a effectivement chargés —
  // le seul retour de `ToolSearch`, puisque son texte est vide dans 357 des 365
  // appels du parc. Un tableau de chaînes que la liste blanche plate refuse ;
  // c'est pourtant tout ce que la vue a à montrer. Onze noms au maximum mesuré.
  ToolSearch: (source) => {
    const m = source.matches
    if (!Array.isArray(m)) return null
    const names = m.filter((x): x is string => typeof x === 'string' && Boolean(x))
    // Une liste vide compte : elle dit que rien n'a été chargé, ce qui n'est pas
    // la même chose qu'un résultat absent. On la retient donc telle quelle.
    return { matches: names }
  },
  // Un skill peut restreindre les outils de la session le temps où il s'applique,
  // et c'est la seule trace de cette restriction : ni l'entrée ni le texte du
  // résultat n'en disent rien. 5 des 16 résultats structurés du parc en portent
  // une — `update-config` réduit à `Read` seul, `claude-api` aux quatre outils
  // de lecture. Un tableau de chaînes, là encore, que la liste blanche plate
  // refuse. Une liste vide n'est pas retenue : elle ne restreint rien.
  //
  // `success` n'est pas retenu (`true` 16 fois sur 16, l'échec passant par
  // `is_error`), ni `commandName`, écho exact du `skill` de l'entrée.
  Skill: (source) => {
    const a = source.allowedTools
    if (!Array.isArray(a)) return null
    const names = a.filter((x): x is string => typeof x === 'string' && Boolean(x))
    return names.length ? { allowedTools: names } : null
  },
}

/** Taille au-delà de laquelle on renonce, quoi que dise la liste blanche. */
const MAX_STRUCTURED_BYTES = 8_192

/**
 * Le résultat structuré d'un outil, réduit à ce qu'on sait afficher.
 *
 * Rend `null` dès que quelque chose ne va pas — outil hors liste, valeur qui
 * n'est pas un objet, taille aberrante. Un affichage vaut mieux vide qu'inventé.
 */
function structuredResult(toolName: string | undefined, value: unknown): Record<string, unknown> | null {
  if (!toolName) return null
  const keep = STRUCTURED_RESULT[toolName]
  if (!keep) return null
  const derive = STRUCTURED_DERIVED[toolName]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const source = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of keep) {
    const v = source[key]
    if (v === undefined || v === null) continue
    if (typeof v !== 'object') {
      out[key] = v
      continue
    }
    // Une carte plate — les réponses d'un AskUserQuestion, par exemple. On
    // s'arrête là : c'est par l'imbrication qu'un sidecar explose en volume, et
    // rien de ce qu'on affiche n'en a besoin.
    const flat = flatMap(v)
    if (flat) out[key] = flat
  }
  Object.assign(out, derive?.(source) ?? {})
  if (!Object.keys(out).length) return null
  return JSON.stringify(out).length > MAX_STRUCTURED_BYTES ? null : out
}

/** L'objet s'il n'est qu'une carte de valeurs simples ; `null` sinon. */
function flatMap(value: object): Record<string, unknown> | null {
  if (Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length) return null
  if (entries.some(([, v]) => v !== null && typeof v === 'object')) return null
  return Object.fromEntries(entries)
}

// ── Sub-agent sidecars ───────────────────────────────────────────────────────
//
// A sub-agent's turns are not in the session file. They live beside it, one
// file per run: `<slug>/<id>/subagents/agent-<agentId>.jsonl`, with an optional
// `agent-<agentId>.meta.json` naming the agent and the tool call that spawned
// it. The session file holds only the `Agent` tool_use and, later, its report —
// so without reading these sidecars the replay never shows what the agent did.

interface SubagentRun {
  agentId: string
  /** The agent that ran, when anything on disk could name it. */
  agentType?: string
  /** The `Agent` tool_use this run answers to — the anchor for its rows. */
  toolUseId?: string
  /** The call's one-line description; the anchor of last resort before time. */
  description?: string
  /** When the run's first row was written — used to place an unanchored run. */
  startedAt: number
  /** 1 for a top-level agent; deeper when an agent spawned another. */
  spawnDepth: number
  rows: Record<string, unknown>[]
}

function parseJsonl(raw: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const l of raw.split('\n')) {
    if (!l.trim()) continue
    try {
      out.push(JSON.parse(l) as Record<string, unknown>)
    } catch {
      /* skip malformed line */
    }
  }
  return out
}

/** Every `tool_use` id in these rows, mapped to the block's own `input`. */
function eachToolUse(
  rows: Record<string, unknown>[],
  visit: (id: string, name: string, input: Record<string, unknown>, rowIndex: number) => void,
): void {
  rows.forEach((r, i) => {
    const msg = r.message as Record<string, unknown> | undefined
    if (!msg || !Array.isArray(msg.content)) return
    for (const b of msg.content as Record<string, unknown>[]) {
      if (b.type === 'tool_use' && typeof b.id === 'string') {
        visit(b.id, str(b.name), (b.input ?? {}) as Record<string, unknown>, i)
      }
    }
  })
}

/**
 * The launch of an async agent answers with its `agentId` in the tool_result
 * text. That is the only tie back to the sidecar when its `.meta.json` is
 * missing (older runs wrote none), so mine it before falling back to nothing.
 */
function agentIdToToolUse(rows: Record<string, unknown>[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    const msg = r.message as Record<string, unknown> | undefined
    if (!msg || !Array.isArray(msg.content)) continue
    for (const b of msg.content as Record<string, unknown>[]) {
      if (b.type !== 'tool_result' || typeof b.tool_use_id !== 'string') continue
      const m = /agentId:\s*([a-f0-9]+)/.exec(resultToText(b.content))
      if (m?.[1]) out.set(m[1], b.tool_use_id)
    }
  }
  return out
}

/**
 * L'appel `Agent` que cette description désigne — s'il n'y en a qu'un.
 *
 * Deux agents lancés avec la même description sont indiscernables, et deviner
 * rattacherait silencieusement un run au mauvais appel : mieux vaut un run sans
 * appel qu'un run mal attribué. Une description vide ne désigne rien.
 */
function toolUseByDescription(rows: Record<string, unknown>[], description: string): string | undefined {
  if (!description) return undefined
  const hits: string[] = []
  eachToolUse(rows, (id, name, input) => {
    if (name !== 'Agent' && name !== 'Task') return
    if (input.description === description) hits.push(id)
  })
  return hits.length === 1 ? hits[0] : undefined
}

/**
 * Read the sidecars beside a session file. Three sources can name the agent,
 * and they never disagreed across the transcripts on hand — so take them by
 * descending reliability rather than trying to reconcile them:
 *
 *   1. `meta.json`'s `agentType`   — written for the run, unambiguous;
 *   2. the spawning `Agent` call's `input.subagent_type`;
 *   3. `attributionAgent`, stamped on some (not all) sidechain rows.
 *
 * A run nobody can name still gets its rows and its `agentId`, which is enough
 * to color it apart from its siblings.
 */
async function readSubagentRuns(abs: string, id: string, mainRows: Record<string, unknown>[]): Promise<SubagentRun[]> {
  const dir = join(dirname(abs), id, 'subagents')
  if (!existsSync(dir)) return []

  const spawnedBy = agentIdToToolUse(mainRows)
  const subagentTypeOf = new Map<string, string>()
  eachToolUse(mainRows, (toolUseId, name, input) => {
    if ((name === 'Agent' || name === 'Task') && typeof input.subagent_type === 'string') {
      subagentTypeOf.set(toolUseId, input.subagent_type)
    }
  })

  let files: string[]
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return []
  }

  const runs: SubagentRun[] = []
  for (const file of files) {
    const agentId = file.replace(/^agent-/, '').replace(/\.jsonl$/, '')
    let rows: Record<string, unknown>[]
    try {
      rows = parseJsonl(await readFile(join(dir, file), 'utf8'))
    } catch {
      continue // a sidecar we cannot read is a sub-agent we cannot show
    }
    if (!rows.length) continue

    let meta: Record<string, unknown> = {}
    try {
      meta = JSON.parse(await readFile(join(dir, `agent-${agentId}.meta.json`), 'utf8')) as Record<string, unknown>
    } catch {
      /* older runs wrote no meta — the fallbacks below cover them */
    }

    const description = typeof meta.description === 'string' ? meta.description : ''
    const toolUseId =
      (typeof meta.toolUseId === 'string' ? meta.toolUseId : undefined) ??
      spawnedBy.get(agentId) ??
      // Dernier recours, la description que les deux côtés notent. `anchorIndex`
      // s'en sert déjà pour *placer* le run ; l'identité en a le même besoin, et
      // sans elle un run parfaitement lisible n'a plus d'appel à qui se
      // rattacher — donc pas de statut, et aucune carte pour le montrer.
      toolUseByDescription(mainRows, description)
    const attributed = rows.find((r) => typeof r.attributionAgent === 'string')
    const agentType =
      (typeof meta.agentType === 'string' ? meta.agentType : undefined) ??
      (toolUseId ? subagentTypeOf.get(toolUseId) : undefined) ??
      (attributed?.attributionAgent as string | undefined)

    // Stamp every row so the event loop can carry the identity through without
    // knowing the file it came from.
    for (const r of rows) {
      r.agentId = agentId
      if (agentType) r.agentType = agentType
    }

    const firstTs = str(rows[0]?.timestamp)

    runs.push({
      agentId,
      ...(agentType ? { agentType } : {}),
      ...(toolUseId ? { toolUseId } : {}),
      ...(description ? { description } : {}),
      startedAt: firstTs ? Date.parse(firstTs) : 0,
      spawnDepth: typeof meta.spawnDepth === 'number' ? meta.spawnDepth : 1,
      rows,
    })
  }

  // Shallow runs first: a nested agent anchors to a tool_use that only exists
  // once its parent's rows have been spliced in.
  return runs.sort((a, b) => a.spawnDepth - b.spawnDepth)
}

/**
 * Where a run's rows belong in the main stream: right after the `Agent` call
 * that spawned it, so a sub-agent reads where it happened. Interleaving by
 * timestamp would scatter concurrent agents through one another; anchoring on
 * the call keeps each run whole.
 *
 * Four ways to find that call, weakest last. Older sidecars wrote no
 * `toolUseId`, and async launches only echo the `agentId` in their result — so
 * fall back to the `description` both sides record, but *only* when exactly one
 * call matches: two agents launched with the same description are unorderable,
 * and guessing would silently move a run under the wrong parent.
 *
 * Some sidecars answer to no `Agent` call at all (`aside_question-*` runs are
 * not sub-agents). They land chronologically, which is where they happened.
 */
function anchorIndex(rows: Record<string, unknown>[], run: SubagentRun): number {
  if (run.toolUseId) {
    let at = -1
    eachToolUse(rows, (id, _name, _input, rowIndex) => {
      if (id === run.toolUseId && at === -1) at = rowIndex
    })
    if (at !== -1) return at
  }

  if (run.description) {
    const hits: number[] = []
    eachToolUse(rows, (_id, name, input, rowIndex) => {
      if (name !== 'Agent' && name !== 'Task') return
      if (input.description !== run.description) return
      const type = input.subagent_type
      if (run.agentType && typeof type === 'string' && type !== run.agentType) return
      hits.push(rowIndex)
    })
    if (hits.length === 1) return hits[0] as number
  }

  // Chronological: after the last row written before this run began.
  if (run.startedAt) {
    let at = -1
    rows.forEach((r, i) => {
      if (r.agentId) return // never anchor inside another run's rows
      const ts = str(r.timestamp)
      if (ts && Date.parse(ts) <= run.startedAt) at = i
    })
    if (at !== -1) return at
  }

  return -1
}

/**
 * Splice every run into the stream at its anchor; unanchorable runs append.
 *
 * The tool_use anchor deliberately searches rows already spliced in: an agent
 * spawned by another agent finds its parent's call and lands inside that run,
 * which is where it happened. Only the chronological fallback refuses to aim
 * inside a run, having no call to justify it.
 */
function spliceSubagentRuns(rows: Record<string, unknown>[], runs: SubagentRun[]): void {
  for (const run of runs) {
    const at = anchorIndex(rows, run)
    if (at === -1) rows.push(...run.rows)
    else rows.splice(at + 1, 0, ...run.rows)
  }
}

/** Les mots par lesquels une notification dit que le run a mal fini. */
const FAILED_STATUS = /^(fail|error|abort|cancel|interrupt)/i

/**
 * Où en est un run, par ordre décroissant de fiabilité du signal.
 *
 *  1. Une `task-notification` dont le `task-id` est ce run : la fin, dite par le
 *     harness. Elle n'existe que pour les agents asynchrones.
 *  2. Le résultat de l'appel `Agent` : absent, l'appel est encore en vol ;
 *     « Async agent launched », le run est lancé et sa fin se dira en 1 ; toute
 *     autre prose est le rapport d'un agent synchrone, donc sa fin. C'est
 *     exactement la règle qu'`AgentView.vue` applique pour décider s'il a un
 *     rapport à rendre.
 *  3. Rien des deux : `unknown`. On n'utilise pas le dernier horodatage — voir
 *     `SubagentRunStatus`, un agent bloqué et un agent fini se taisent pareil.
 */
function runStatus(notif: Block | undefined, call: Block | undefined): SubagentRunStatus {
  if (notif) {
    // Le corpus n'a jamais écrit autre chose que `completed`, mais le champ est
    // libre : on ne reconnaît l'échec qu'à des mots qui le disent, et tout le
    // reste est une fin sans erreur signalée — jamais l'inverse.
    return FAILED_STATUS.test(notif.status ?? '') ? 'failed' : 'completed'
  }
  if (!call) return 'unknown'
  const result = call.result
  if (!result) return 'running'
  if (result.isError) return 'failed'
  return result.content.trimStart().startsWith('Async agent launched') ? 'running' : 'completed'
}

// ── Parser ───────────────────────────────────────────────────────────────────

/** Parse a whole transcript file into the normalised replay model. */
export async function parseTranscript(abs: string, id: string): Promise<ParsedTranscript> {
  const raw = await readFile(abs, 'utf8')
  const rows = parseJsonl(raw)

  // Before anything reads `rows`: a sub-agent's tool calls must be indexed with
  // the session's own, and its turns must already sit in the stream.
  //
  // Les runs survivent à leur insertion, au lieu d'être consommés sur place :
  // `toolUseId`, `description` et `spawnDepth` ne se lisent que sur le disque, et
  // le client en a besoin pour nommer ses pistes et rattacher chaque run à
  // l'appel qui l'a lancé.
  const subagentRuns = await readSubagentRuns(abs, id, rows)
  spliceSubagentRuns(rows, subagentRuns)

  /** Ce que la boucle d'événements ajoutera à chaque run, à mesure. */
  interface RunTally {
    turns: number
    events: number
    tokens: Usage
    lastActivityAt: number
  }
  const tallyByAgentId = new Map<string, RunTally>(
    subagentRuns.map((run) => [
      run.agentId,
      {
        turns: 0,
        events: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
        lastActivityAt: run.startedAt,
      },
    ]),
  )

  // Pass 1 — index every tool_result by its tool_use_id so tool calls can carry
  // their output inline (results live in the *next* user message, keyed by id).
  // Collect the tool_use ids too: a hook is tied to a tool call only if its
  // `toolUseID` names one (lifecycle hooks carry an unrelated uuid there).
  const resultsById = new Map<string, ToolResult>()
  const toolUseIds = new Set<string>()
  /** Par `tool_use_id`, le nom de l'outil — connu avant son résultat, qui suit. */
  const toolNameById = new Map<string, string>()
  // Le palier de vision vaut pour toute la session : il se lit une fois, sur
  // l'ensemble des lignes, avant que la moindre image soit chiffrée.
  const hiRes = hasHiResVision(rows)
  for (const r of rows) {
    const msg = r.message as Record<string, unknown> | undefined
    if (!msg || !Array.isArray(msg.content)) continue
    const blocks = msg.content as Record<string, unknown>[]
    const shotsByTool = rowImages(r, hiRes).byTool
    // `toolUseResult` est porté par la *ligne*, pas par le bloc : il n'a de sens
    // que s'il n'y a qu'un résultat à qui l'attribuer. En pratique c'est toujours
    // le cas — aucune exception rencontrée —, mais deviner serait pire que se taire.
    const soleResult = blocks.filter((b) => b.type === 'tool_result').length === 1
    for (const b of blocks) {
      if (b.type === 'tool_result') {
        const id = str(b.tool_use_id)
        const shots = shotsByTool.get(id)
        const meta = soleResult ? structuredResult(toolNameById.get(id), r.toolUseResult) : null
        resultsById.set(id, {
          content: resultToText(b.content),
          isError: Boolean(b.is_error),
          ...(shots?.length ? { images: shots } : {}),
          ...(meta ? { meta } : {}),
        })
      } else if (b.type === 'tool_use' && typeof b.id === 'string') {
        toolUseIds.add(b.id)
        toolNameById.set(b.id, str(b.name))
      }
    }
  }

  // Pass 1b — gather every hook run, before the event stream is built, so a run
  // can be attached to its tool call whichever line came first.
  const silent = new SilentHookTally()
  const hooksByToolUse = new Map<string, HookRun[]>()
  /** Runs with no tool call to hang off, keyed by the row that produced them. */
  const looseHooks = new Map<string, HookRun[]>()
  /**
   * `hook_success` then `hook_additional_context` describe one run: the first
   * carries the command and timing, the second repeats the injected text. Merge
   * the second into the first rather than reporting the hook twice.
   *
   * What ties the two lines together depends on the hook. Around a tool call,
   * both name the same `toolUseID`. Outside one, they agree on nothing but the
   * event — a `SessionStart` pair writes `toolUseID` as a uuid on one line and
   * as the literal `"SessionStart"` on the other — so the event is the key.
   */
  function mergeKey(run: HookRun): string {
    return run.toolUseId && toolUseIds.has(run.toolUseId) ? `tool:${run.toolUseId}|${run.name}` : `lifecycle:${run.event}`
  }
  const runByKey = new Map<string, HookRun>()
  /**
   * Rewinding a session replays earlier lines verbatim, so the same run can be
   * written twice. A tool call fires a given hook once — a second identical
   * record is that replay, not a second execution. (Summaries are exempt: their
   * command repeats every turn by design.)
   */
  const seenRuns = new Set<string>()

  // Collect and merge first — a run is only classified once every line that can
  // still change it has been read.
  const collected: { rowUuid: string; run: HookRun }[] = []
  for (const r of rows) {
    const type = str(r.type)
    const rowUuid = str(r.uuid)

    if (type === 'attachment') {
      const a = r.attachment as Record<string, unknown> | undefined
      if (!a) continue
      const run = hookRunFromAttachment(a)
      if (!run) continue

      const key = mergeKey(run)
      const previous = runByKey.get(key)
      if (previous && a.type === 'hook_additional_context') {
        if (!previous.context?.length) {
          previous.context = run.context
          if (previous.status === 'ok') previous.status = 'context'
        }
        continue // folded into the run already collected
      }

      // Keyed on the raw `toolUseID`, not on `key`: two genuine SessionStarts
      // share an event but not a uuid, and must both survive.
      const identity = `${run.toolUseId ?? ''}|${run.name}|${run.command ?? ''}|${run.status}|${run.exitCode ?? ''}`
      if (seenRuns.has(identity)) continue // replayed by a rewind
      seenRuns.add(identity)

      runByKey.set(key, run)
      collected.push({ rowUuid, run })
    } else if (type === 'system' && isHookSummary(r.subtype as string | undefined)) {
      for (const run of hookRunsFromSummary(r)) collected.push({ rowUuid, run })
    }
  }

  for (const { rowUuid, run } of collected) {
    if (isSilent(run)) {
      silent.add(run)
      continue
    }
    const tid = run.toolUseId
    if (tid && toolUseIds.has(tid)) {
      const list = hooksByToolUse.get(tid)
      if (list) list.push(run)
      else hooksByToolUse.set(tid, [run])
    } else {
      const list = looseHooks.get(rowUuid)
      if (list) list.push(run)
      else looseHooks.set(rowUuid, [run])
    }
  }

  // Pass 2 — build the ordered event stream.
  const events: TranscriptEvent[] = []
  const tools: Record<string, number> = {}
  const models = new Set<string>()
  let tokensIn = 0
  let tokensOut = 0
  let cacheRead = 0
  let cacheCreate = 0
  let costUsd = 0
  /** A response ran on a model we have no price for: `costUsd` is then a floor. */
  let costPartial = false
  let toolCalls = 0
  let userTurns = 0
  let assistantTurns = 0
  let firstPrompt = ''
  let cwd = ''
  let gitBranch = ''
  let version = ''
  let sessionId = ''
  let hasSidechain = false
  let startedAt = 0
  let endedAt = 0
  // Claude Code writes one row per content block, so a single API response is
  // spread over several rows repeating the same `message.id`. Count each
  // response as one turn, or assistant turns inflate by the number of blocks it
  // produced. Their `usage` tallies are *not* identical: `output_tokens` grows
  // as the response streams, so the tokens of a response are the per-field
  // maximum over its rows — `countedById` tracks what each has contributed.
  const seenAssistantIds = new Set<string>()
  const countedById = new Map<string, Usage>()
  /** Per `message.id`: index of the one event that shows the response's tally. */
  const usageEventIdx = new Map<string, number>()
  const titles = new TitleAccumulator()
  /**
   * Le nom du skill qu'un appel `Skill` a lancé, par identifiant d'appel.
   *
   * Ce que le CLI injecte ensuite — le manuel du skill, en entier, dans une
   * ligne `user` méta — ne porte qu'un `sourceToolUseID`. Le rapprochement se
   * fait ici parce qu'ici seulement on a le fichier entier : la ligne injectée
   * et l'appel qui l'a provoquée peuvent être à plusieurs tours de distance.
   *
   * Les lignes qui portent un `sourceToolUseID` désignent toutes un appel
   * `Skill` — aucun autre outil n'en produit.
   */
  const skillCalls = new Map<string, string>()

  const context = new ContextAccumulator()
  /** Per `message.id`: the turn awaiting its exact total, known only after the fold. */
  const pendingTurns = new Map<string, TurnContext>()

  for (const r of rows) {
    titles.push(r)
    const type = str(r.type)
    const rawTs = str(r.timestamp)
    const ts = rawTs ? Date.parse(rawTs) : 0
    if (ts) {
      if (!startedAt) startedAt = ts
      endedAt = ts
    }
    if (typeof r.cwd === 'string' && r.cwd) cwd = r.cwd
    if (typeof r.gitBranch === 'string' && r.gitBranch) gitBranch = r.gitBranch
    if (typeof r.version === 'string' && r.version) version = r.version
    if (typeof r.sessionId === 'string' && r.sessionId) sessionId = r.sessionId
    const isSidechain = Boolean(r.isSidechain)
    if (isSidechain) hasSidechain = true
    const isMeta = Boolean(r.isMeta)
    // A `user` row is a genuine typed prompt only when it originates from a
    // human. Harness-injected rows (task-notifications, hook output, …) also
    // carry `type:'user'` but come from `origin.kind` other than 'human' /
    // `promptSource:'system'`. Older transcripts lack both fields → treat as
    // human (unchanged behaviour).
    const originObj = r.origin as Record<string, unknown> | undefined
    const originKind = typeof originObj?.kind === 'string' ? originObj.kind : undefined
    // After a compaction the harness re-sends the summarised history as a plain
    // `user` row. It carries no `origin`, so without this flag it reads as the
    // human opening the next turn with "This session is being continued from…".
    const isCompactSummary = type === 'user' && r.isCompactSummary === true
    const isInjectedUser =
      type === 'user' && (isCompactSummary || r.promptSource === 'system' || (originKind !== undefined && originKind !== 'human'))

    if (type === 'user' || type === 'assistant') {
      const msg = (r.message ?? {}) as Record<string, unknown>
      let blocks = toBlocks(msg.content, rowImages(r, hiRes), type === 'assistant')
      if (!blocks.length) continue

      for (const b of blocks) {
        if (b.kind === 'tool_use' && b.name === 'Skill' && b.id) {
          skillCalls.set(b.id, str(((b.input ?? {}) as Record<string, unknown>).skill))
        }
      }

      // Running a slash command writes three `user` rows that nobody typed. Read
      // them for what they are, or the timeline shows the human saying
      // "<command-name>/compact</command-name>". Keyed off the row's first text
      // block: `/init` puts `<command-message>` ahead of `<command-name>`.
      let localRow: LocalRow | null = null
      const lead = blocks.find((b) => b.kind === 'text' && (b.text ?? '').trim())?.text ?? ''
      // Un message d'équipier arrive dans une ligne `user` que rien ne marque.
      // Il faut le reconnaître au texte, et seulement quand la ligne s'ouvre
      // dessus : un rapport d'agent qui *cite* la balise n'en est pas un.
      const teammate = type === 'user' && lead.trimStart().startsWith('<teammate-message') ? teammateBlocks(lead) : null
      if (teammate) {
        localRow = 'teammate'
        blocks = teammate
      } else if (type === 'user' && lead) {
        localRow = classifyLocalCommand(lead)
        if (localRow === 'caveat') continue // Boilerplate addressed to the model.
        if (localRow === 'command' || localRow === 'bash') {
          const block = localRow === 'bash' ? bashInputBlock(lead) : slashCommandBlock(lead)
          if (!block) continue
          blocks = [block]
        } else if (localRow === 'stdout') {
          const out = commandOutput(lead)
          if (!out) continue // The command printed nothing.
          blocks = [{ kind: 'text', text: out }]
        } else if (localRow === 'reminder') {
          // Shown as injected context; the wrapper itself says nothing.
          const inner = lead.replace(/<\/?system-reminder>/g, '').trim()
          if (!inner) continue
          blocks = [{ kind: 'text', text: inner }]
        }
      }

      // A task-notification is a single XML blob — parse it into a structured
      // block the UI can render as an agent report card.
      if (isInjectedUser && originKind === 'task-notification') {
        blocks = [parseTaskNotification(blocks.map((b) => b.text ?? '').join('\n'))]
      }

      // Attach tool_result to tool_use; a user message that is *only* tool
      // results is a harness echo — drop it (its output already lives inline).
      const meaningful: Block[] = []
      for (const b of blocks) {
        if (b.kind === 'tool_use' && b.id) {
          b.result = resultsById.get(b.id) ?? null
          const hooks = hooksByToolUse.get(b.id)
          if (hooks?.length) b.hooks = hooks
          toolCalls++
          tools[b.name ?? 'tool'] = (tools[b.name ?? 'tool'] ?? 0) + 1
          meaningful.push(b)
        } else if (b.kind === 'tool_result') {
          // Swallowed — surfaced under its tool_use. Keep only if orphaned.
          if (!b.toolUseId || !hasToolUse(rows, b.toolUseId)) meaningful.push(b)
        } else {
          meaningful.push(b)
        }
      }
      if (!meaningful.length) continue

      // Rows lacking an id (older transcripts, user rows) can't be deduped —
      // count them, since they carry at most one usage payload each.
      const msgId = typeof msg.id === 'string' ? msg.id : undefined
      const firstSeen = !msgId || !seenAssistantIds.has(msgId)
      if (msgId) seenAssistantIds.add(msgId)

      const model = typeof msg.model === 'string' ? msg.model : undefined
      if (model) models.add(model)

      // Ce que cette ligne doit à son run, s'il y en a un. Les compteurs du run
      // sont tenus ici, dans la boucle qui sait déjà dédupliquer une réponse
      // écrite sur plusieurs lignes ; les refaire après coup demanderait de
      // reproduire cette arithmétique, et donc de la faire dériver un jour.
      const runTally = typeof r.agentId === 'string' ? tallyByAgentId.get(r.agentId) : undefined
      if (runTally && ts) runTally.lastActivityAt = Math.max(runTally.lastActivityAt, ts)
      if (runTally && type === 'assistant' && firstSeen) runTally.turns++

      const usage = normUsage(msg.usage as Record<string, unknown> | undefined)
      if (usage) {
        // Rows without an id carry at most one payload each, so they count in
        // full. A repeat of a known id tops the totals up by however much its
        // later snapshot grew.
        const counted = msgId ? countedById.get(msgId) : undefined
        const delta = counted ? growth(counted, usage) : usage
        tokensIn += delta.input
        tokensOut += delta.output
        cacheRead += delta.cacheRead
        cacheCreate += delta.cacheCreate
        if (msgId && !counted) countedById.set(msgId, { ...usage })

        // Le run paie la même croissance que la session, jamais l'`usage` brut :
        // une réponse écrite sur cinq lignes serait sinon comptée cinq fois.
        if (runTally) {
          runTally.tokens.input += delta.input
          runTally.tokens.output += delta.output
          runTally.tokens.cacheRead += delta.cacheRead
          runTally.tokens.cacheCreate += delta.cacheCreate
        }

        // Cost is summed per response, at that response's own model and rate — a
        // session that switched models cannot be priced from its totals alone. A
        // model we have no price for (a local one, `<synthetic>`) leaves the
        // figure a floor, flagged so the panel can say "au moins".
        const day = ts ? new Date(ts).toISOString().slice(0, 10) : ''
        const c = model ? costOf(model, delta, day) : null
        if (c === null) costPartial = true
        else costUsd += c
      }

      // Sub-agent rows are excluded here and nowhere else. A `user` row inside a
      // run is the orchestrator briefing its agent, not the human taking a turn,
      // and it must never become the session's `firstPrompt`. The token and tool
      // tallies below *do* count them: that work happened, and the timeline now
      // shows it.
      if (type === 'user' && !isMeta && !isInjectedUser && !localRow && !isSidechain) {
        userTurns++
        if (!firstPrompt) {
          const t = (meaningful.find((b) => b.kind === 'text')?.text ?? '').trim()
          if (t && !t.startsWith('<')) firstPrompt = t.replace(/\s+/g, ' ').slice(0, 200)
        }
      } else if (type === 'assistant' && firstSeen && !isSidechain) {
        assistantTurns++
      }

      // A sub-agent runs in a context window of its own — a few thousand tokens,
      // where the parent's is hundreds of thousands. Its rows sit in this stream
      // because the timeline shows them, but folding them into the parent's turns
      // would interleave two unrelated windows: the panel reports on the last
      // anchored turn of a phase, and that turn would be a sub-agent's. What the
      // parent actually paid for the sub-agent is the `Agent` call it made, and
      // that call is a block of a row that is not a sidechain.
      if (!isSidechain) {
        // The context a response was given is whatever existed *before* it, so the
        // snapshot is taken on its first row. Its own thinking and text are output;
        // they only weigh on the turns that follow, which is why they are added
        // after the snapshot, never before.
        if (type === 'assistant' && firstSeen && msgId) {
          pendingTurns.set(msgId, context.beginTurn(str(r.uuid), ts))
        }
        const turnIndex = context.currentTurnIndex()
        for (const b of meaningful) {
          if (b.kind === 'thinking' || (b.kind === 'text' && type === 'assistant')) {
            const kind = b.kind === 'thinking' ? 'thinking' : 'text'
            context.addThinking(turnIndex, kind, b.text ?? '')
          } else if (b.kind === 'tool_use') {
            // Both directions. A tool's arguments are context too — the model is
            // billed for the file it hands `Write` exactly as for the one `Read`
            // hands back, and counting only the output was this accumulator's
            // single largest omission.
            context.addToolCall(
              turnIndex,
              b.name ?? '',
              toolInputText(b.input),
              b.result?.content ?? '',
              b.result?.isError ?? false,
              imageTokens(b.result?.images),
            )
          } else if (b.kind === 'tool_result') {
            // A result whose call could not be paired: its input, and the name of
            // the tool that made it, are already lost.
            context.addToolCall(turnIndex, '', '', b.content ?? '', b.isError ?? false, imageTokens(b.images))
          } else if (b.kind === 'text' && type === 'user' && !isInjectedUser && !isMeta && !localRow) {
            // Only what the human actually typed. Harness-injected `user` rows are
            // bookkeeping, and counting them as "your message" would be a lie.
            context.addText('userMessage', b.text ?? '', turnIndex)
          }
        }
      }

      // A response spans several rows; only its last event should carry the
      // token badge, and it carries the consolidated tally (set after the loop,
      // once every row of the response has been folded in).
      if (msgId && usage) {
        const prevIdx = usageEventIdx.get(msgId)
        const prevEvent = prevIdx === undefined ? undefined : events[prevIdx]
        if (prevEvent) prevEvent.usage = undefined
        usageEventIdx.set(msgId, events.length)
      }

      events.push({
        uuid: str(r.uuid),
        parentUuid: (r.parentUuid as string) ?? null,
        kind: type,
        role: str(msg.role, type),
        timestamp: ts,
        isSidechain,
        isMeta,
        origin: type === 'user' ? userOrigin(isInjectedUser, originKind, localRow, isCompactSummary) : undefined,
        model,
        usage,
        gitBranch: typeof r.gitBranch === 'string' ? r.gitBranch : undefined,
        skill: skillCalls.get(str(r.sourceToolUseID)),
        blocks: meaningful,
      })
    } else if (type === 'attachment' || (type === 'system' && isHookSummary(r.subtype as string | undefined))) {
      // An attachment row is how the harness records what it pushed into the
      // context window — a CLAUDE.md layer, the skill listing, an @-mentioned
      // file. That text never reaches the timeline (it is not something anyone
      // *said*), but it is exactly what the context panel accounts for.
      // …of *this* session. A sub-agent's own attachments (276 rows across the
      // corpus) entered its window, never the parent's.
      if (type === 'attachment' && !isSidechain) {
        const injection = classifyAttachment(r.attachment)
        if (injection) context.add(injection)

        // Sauf une : celle-ci porte bien quelque chose que quelqu'un a dit. Elle
        // devient un tour à part entière, ce qui coupe en deux le tour qu'elle a
        // interrompu — c'est exactement ce qui s'est passé, et la coupure est
        // l'information : ce qui suit répond aussi à ce message.
        //
        // Les compteurs (`userTurns`, `firstPrompt`) et le contexte ne bougent
        // pas : `classifyAttachment` a déjà porté ces tokens, et les seuils du
        // diagnostic sont calibrés sur la définition actuelle de `userTurns`.
        // Le rapport d'un agent asynchrone, quand la file l'a apporté. Même
        // événement que sur le chemin `user` — même origine, même bloc — pour
        // qu'il se rende et se compte pareil des deux côtés.
        const notified = queuedTaskNotification(r.attachment)
        if (notified) {
          events.push({
            uuid: str(r.uuid),
            parentUuid: (r.parentUuid as string) ?? null,
            kind: 'user',
            role: 'user',
            timestamp: ts,
            isSidechain,
            isMeta,
            origin: 'task-notification',
            blocks: [parseTaskNotification(notified)],
          })
          continue
        }

        const queued = queuedHumanPrompt(r.attachment)
        if (queued) {
          events.push({
            uuid: str(r.uuid),
            parentUuid: (r.parentUuid as string) ?? null,
            kind: 'user',
            role: 'user',
            timestamp: ts,
            isSidechain,
            isMeta,
            origin: 'queued',
            blocks: [{ kind: 'text', text: queued }],
          })
          continue
        }

        // Et une autre encore : le changement de régime. Ces lignes ne portent
        // aucun texte — `classifyAttachment` a raison de les laisser hors du
        // compte du contexte — mais elles disent quand la session est passée en
        // lecture seule, ce qu'aucune autre ligne ne dit.
        const mark = planModeMark(r.attachment)
        if (mark) {
          events.push({
            uuid: str(r.uuid),
            parentUuid: (r.parentUuid as string) ?? null,
            kind: 'planmode',
            timestamp: ts,
            isSidechain,
            isMeta,
            planMode: mark,
            blocks: [],
          })
          continue
        }
      }
      // Otherwise these rows hold no renderable text of their own: both reach the
      // timeline only through the hook runs they produced, and only when those
      // runs said something.
      const runs = looseHooks.get(str(r.uuid))
      if (!runs?.length) continue
      for (const hook of runs) {
        events.push({
          uuid: `${str(r.uuid)}:${hook.name}:${events.length}`,
          parentUuid: (r.parentUuid as string) ?? null,
          kind: 'hook',
          timestamp: ts,
          isSidechain,
          isMeta,
          hook,
          blocks: [],
        })
      }
    } else if (type === 'system' && r.subtype === 'compact_boundary') {
      // The window was collapsed here. The harness records what it cost exactly
      // (`preTokens` → `postTokens`), so this deserves a first-class event rather
      // than the generic "Conversation compacted" system line it would otherwise
      // render as. Everything accumulated so far is gone from the model's view.
      const compaction = readCompaction(r, ts)
      if (compaction) {
        context.compact(compaction)
        events.push({
          uuid: str(r.uuid),
          parentUuid: (r.parentUuid as string) ?? null,
          kind: 'compaction',
          timestamp: ts,
          isSidechain,
          isMeta,
          compaction,
          blocks: [],
        })
      }
    } else if (type === 'system') {
      const command = localCommandSystem(r)
      const blocks = command ? command.blocks : systemBlocks(r)
      if (!blocks.length) continue // Pure telemetry: turn_duration, bridge_status, …
      events.push({
        uuid: str(r.uuid),
        parentUuid: (r.parentUuid as string) ?? null,
        kind: 'system',
        timestamp: ts,
        isSidechain,
        isMeta,
        origin: command?.origin,
        subtype: typeof r.subtype === 'string' ? r.subtype : undefined,
        level: typeof r.level === 'string' ? r.level : undefined,
        blocks,
      })
    } else if (type === 'summary') {
      events.push({
        uuid: str(r.uuid, str(r.leafUuid)),
        parentUuid: null,
        kind: 'summary',
        timestamp: ts,
        isSidechain,
        isMeta,
        blocks: typeof r.summary === 'string' ? [{ kind: 'text', text: r.summary }] : [],
      })
    }
    // file-history-snapshot / last-prompt / mode → noise, skipped. The `*-title`
    // rows carry no event of their own but feed `titles` above.
  }

  // Give each response's surviving event the folded tally rather than whatever
  // partial snapshot its own row happened to hold.
  for (const [msgId, idx] of usageEventIdx) {
    const total = countedById.get(msgId)
    const event = events[idx]
    if (total && event) event.usage = { ...total }
  }

  markPlanMode(events)

  // Anchor each turn on the exact size of the context that produced it. Only now
  // is it known: it is the folded usage, not any single row's snapshot.
  for (const [msgId, turn] of pendingTurns) {
    const usage = countedById.get(msgId)
    if (usage) settleTurn(turn, usage.input + usage.cacheRead + usage.cacheCreate)
  }

  // Carry the sub-agent identity from the spliced-in rows onto their events. A
  // single pass keyed by uuid, rather than five spread-in fields at each of the
  // `events.push` sites — the rows are the only place the identity was stamped.
  const identityByUuid = new Map<string, { agentId: string; agentType?: string }>()
  const typeByAgentId = new Map<string, string>()
  for (const r of rows) {
    if (typeof r.agentId !== 'string') continue
    const agentType = typeof r.agentType === 'string' ? r.agentType : undefined
    identityByUuid.set(str(r.uuid), { agentId: r.agentId, ...(agentType ? { agentType } : {}) })
    if (agentType) typeByAgentId.set(r.agentId, agentType)
  }
  /** Les rapports de fin, par `taskId` — le signal explicite d'un agent asynchrone. */
  const notifByTaskId = new Map<string, Block>()
  /** Les appels d'outil, par id — pour retrouver l'appel `Agent` d'un run. */
  const callById = new Map<string, Block>()

  for (const event of events) {
    const identity = identityByUuid.get(event.uuid)
    if (identity) {
      event.agentId = identity.agentId
      if (identity.agentType) event.agentType = identity.agentType
      // Compté ici et pas dans la boucle : c'est le seul endroit qui connaisse
      // les événements réellement émis, une ligne pouvant n'en produire aucun.
      const tally = tallyByAgentId.get(identity.agentId)
      if (tally) tally.events++
    }
    // A report sits on the main thread, so it never carries the run's identity —
    // but it names it in `<task-id>`. Resolve it here, where the runs are known.
    for (const b of event.blocks) {
      if (b.kind === 'tool_use' && b.id) callById.set(b.id, b)
      if (b.kind !== 'task_notification' || !b.taskId) continue
      notifByTaskId.set(b.taskId, b)
      const agentType = typeByAgentId.get(b.taskId)
      if (agentType) b.agentType = agentType
    }
  }

  // La couleur d'un équipier, propagée à tous ses messages.
  //
  // Le CLI ne la met pas sur chaque envoi — 67 blocs du parc sur 100, jamais sur
  // les `teammate_terminated`, qui arrivent d'ailleurs au nom de `system`. Sans
  // cette passe, le même `rf` est vert quand il parle et d'une autre teinte
  // quand il s'arrête, parce qu'il retombe sur le hachage de son nom. C'est le
  // transcript lui-même qui porte la réponse : il suffit de la lire une fois.
  const hueByTeammate = new Map<string, string>()
  for (const event of events) {
    for (const b of event.blocks) {
      if (b.kind === 'teammate_message' && b.from && b.color) hueByTeammate.set(b.from, b.color)
    }
  }
  for (const event of events) {
    for (const b of event.blocks) {
      if (b.kind !== 'teammate_message' || b.color || !b.from) continue
      const hue = hueByTeammate.get(b.from)
      if (hue) b.color = hue
    }
  }

  // Les runs tels que le client les verra : une piste chacun, dans l'ordre du
  // temps. `sort` sur une copie — l'ordre de `readSubagentRuns` est celui du
  // `spawnDepth`, et c'est lui qui a permis l'insertion.
  const subagents: SubagentRunSummary[] = subagentRuns
    .map((run) => {
      const tally = tallyByAgentId.get(run.agentId)
      const status = runStatus(notifByTaskId.get(run.agentId), run.toolUseId ? callById.get(run.toolUseId) : undefined)
      const terminal = status === 'completed' || status === 'failed'
      const lastActivityAt = tally?.lastActivityAt ?? run.startedAt
      return {
        agentId: run.agentId,
        ...(run.agentType ? { agentType: run.agentType } : {}),
        ...(run.description ? { description: run.description } : {}),
        ...(run.toolUseId ? { toolUseId: run.toolUseId } : {}),
        spawnDepth: run.spawnDepth,
        status,
        startedAt: run.startedAt,
        lastActivityAt,
        ...(terminal ? { endedAt: lastActivityAt } : {}),
        turns: tally?.turns ?? 0,
        events: tally?.events ?? 0,
        tokens: tally?.tokens ?? { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
      }
    })
    // Un run dont pas une ligne n'a survécu à la boucle — de la télémétrie, un
    // sidecar illisible — n'a rien à montrer : lui donner une piste, ce serait
    // promettre un flux vide au clic.
    .filter((run) => run.events > 0)
    .sort((a, b) => a.startedAt - b.startedAt)

  // Le modèle configuré dit la fenêtre avant que la session ne l'ait prouvée —
  // c'est ce qui évite qu'une session jeune, suivie en direct, s'affiche sur 200k.
  const configuredLong = await configuredLongWindow(cwd)

  return {
    id,
    sessionId: sessionId || id,
    cwd,
    gitBranch,
    version,
    firstPrompt,
    hasSidechain,
    subagents,
    title: titles.title,
    titleSource: titles.source,
    stats: {
      events: events.length,
      userTurns,
      assistantTurns,
      toolCalls,
      tokensIn,
      tokensOut,
      cacheRead,
      cacheCreate,
      durationMs: endedAt - startedAt,
      startedAt,
      endedAt,
      models: [...models],
      tools,
      costUsd: costUsd > 0 ? costUsd : costPartial ? 0 : null,
      costPartial,
    },
    silentHooks: silent.result(),
    events,
    context: context.result(models, configuredLong),
  }
}

/** True if any row holds a tool_use with this id (to detect orphan results). */
function hasToolUse(rows: Record<string, unknown>[], id: string): boolean {
  for (const r of rows) {
    const msg = r.message as Record<string, unknown> | undefined
    if (!msg || !Array.isArray(msg.content)) continue
    for (const b of msg.content as Record<string, unknown>[]) {
      if (b.type === 'tool_use' && String(b.id) === id) return true
    }
  }
  return false
}

// ── Listing (session summaries for a project) ────────────────────────────────

/**
 * Cheap per-file summary: read once, grab the title, the first prompt, the branch.
 *
 * Ce résumé ne compte rien : il n'a pas les moyens de le faire honnêtement. Une
 * ligne `user` porte le plus souvent un simple résultat d'outil, et une réponse
 * d'assistant s'étale sur plusieurs lignes qui partagent un `message.id` — seul
 * `parseTranscript` déduplique et filtre. Les tours, les tokens et le coût de la
 * liste viennent donc du relevé de diagnostic, joint par `getProjectDetail`.
 */
export async function summariseTranscript(abs: string, id: string): Promise<TranscriptSummary> {
  const s = await stat(abs)
  let firstPrompt = ''
  let gitBranch = ''
  let hasSidechain = false
  const titles = new TitleAccumulator()
  try {
    const raw = await readFile(abs, 'utf8')
    for (const l of raw.split('\n')) {
      if (!l.trim()) continue
      let j: Record<string, unknown>
      try {
        j = JSON.parse(l) as Record<string, unknown>
      } catch {
        continue
      }
      const t = j.type
      titles.push(j)
      if (j.isSidechain) hasSidechain = true
      if (!gitBranch && typeof j.gitBranch === 'string') gitBranch = j.gitBranch
      if (!firstPrompt && t === 'user' && !j.isMeta) {
        const msg = j.message as Record<string, unknown> | undefined
        const c = msg?.content
        const text =
          typeof c === 'string'
            ? c
            : Array.isArray(c)
              ? (((c.find((b) => (b as Record<string, unknown>).type === 'text') as Record<string, unknown> | undefined)?.text as string) ?? '')
              : ''
        if (text && !text.startsWith('<')) firstPrompt = text.replace(/\s+/g, ' ').trim().slice(0, 160)
      }
    }
  } catch {
    /* unreadable → zeros */
  }
  return {
    id,
    mtime: s.mtimeMs,
    size: s.size,
    firstPrompt,
    gitBranch,
    hasSidechain,
    title: titles.title,
    titleSource: titles.source,
  }
}

// `listTranscripts` vit dans `transcript-cache.ts` : lister, c'est résumer tout
// un dossier, et cela ne se fait plus sans le cache des résumés.
