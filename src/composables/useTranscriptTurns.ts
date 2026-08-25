// Fold a flat event stream into the shape a reader thinks in: "I asked this,
// Claude did that."
//
// The transcript is one JSONL row per content block, so a single reply arrives as
// several `assistant` events, interleaved with the `user` rows the harness writes
// to carry tool results back. Rendering one header per event repeats
// "Claude · 12:03:04" a dozen times for what was, to the reader, one answer.
//
// So: a human message opens a `user` node; everything until the next human
// message folds into one `turn`. Hooks, compactions and summaries stay outside —
// they happened *between* turns and their position is the information.
//
// Nothing here calls the BFF. It is a pure view over `ParsedTranscript.events`.

import type { TranscriptEvent } from '@/services/projects'
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'

/**
 * Which sub-agent run a node belongs to. Both are absent on the main thread.
 * `agentId` separates two concurrent runs of the *same* agent; `agentType`
 * names it, and is missing when nothing on disk could.
 */
export interface AgentIdentity {
  agentId?: string
  agentType?: string
}

export interface AssistantTurn extends AgentIdentity {
  kind: 'turn'
  uuid: string
  isSidechain: boolean
  /** Segment de compaction où le nœud se trouve. Voir `assignPhases`. */
  phase: number
  events: TranscriptEvent[]
  model: string
  startedAt: number
  endedAt: number
  durationMs: number
  /** Tokens Claude generated across every response in the turn. Exact. */
  outputTokens: number
  /** Largest context window any response in the turn was handed. Exact. */
  contextPeak: number
  toolCount: number
  thinkingCount: number
}

export interface UserNode extends AgentIdentity {
  kind: 'user'
  uuid: string
  isSidechain: boolean
  phase: number
  event: TranscriptEvent
}

/** Hook, compaction, summary: rendered on its own, between the cards. */
export interface LooseNode extends AgentIdentity {
  kind: 'event'
  uuid: string
  isSidechain: boolean
  phase: number
  event: TranscriptEvent
}

export type TimelineNode = UserNode | AssistantTurn | LooseNode

/** The identity fields of an event, ready to spread onto a node. */
function identityOf(ev: TranscriptEvent): AgentIdentity {
  return {
    ...(ev.agentId ? { agentId: ev.agentId } : {}),
    ...(ev.agentType ? { agentType: ev.agentType } : {}),
  }
}

/**
 * A `user` row the human typed, as opposed to one the harness injected.
 *
 * Nobody types into a sub-agent's conversation. Its `user` rows are its opening
 * prompt, the follow-ups its parent sends it, and interruption markers — all
 * addressed *to* the agent. They carry no `origin` to tell them apart, so the
 * sidechain flag is what disqualifies them: rendered as "Vous", they would put
 * the orchestrator's words in the human's mouth.
 *
 * `'queued'` en fait partie : tapé pendant le tour, mis en file par le CLI et
 * dépilé au milieu. C'est bien l'humain qui parle — il coupe la parole.
 */
export function isHumanMessage(ev: TranscriptEvent): boolean {
  return (
    ev.kind === 'user' &&
    !ev.isSidechain &&
    !ev.isMeta &&
    (ev.origin === undefined || ev.origin === 'human' || ev.origin === 'queued') &&
    ev.blocks.some((b) => b.kind === 'text' || b.kind === 'image')
  )
}

/**
 * Events that interrupt a turn rather than belong to it.
 *
 * A slash command and its output are `user` rows the CLI wrote, not the human —
 * and `/compact` in particular is what *causes* the compaction that follows. It
 * belongs on the thread's spine, not tucked inside Claude's previous answer.
 */
function isLoose(ev: TranscriptEvent): boolean {
  // Une borne de mode plan est du même ordre qu'une compaction : elle ne dit
  // rien d'un tour, elle dit que le régime a changé entre deux. Pliée dans la
  // carte précédente, elle annoncerait une contrainte après les tours qu'elle
  // contraint.
  if (ev.kind === 'hook' || ev.kind === 'compaction' || ev.kind === 'summary') return true
  if (ev.kind === 'planmode') return true
  return ev.origin === 'slash-command' || ev.origin === 'command-output' || ev.origin === 'compact-summary'
}

/** A node the CLI wrote about a compaction, rather than a turn of conversation. */
function isCompactionAftermath(node: TimelineNode): boolean {
  if (node.kind !== 'event') return false
  return node.event.kind === 'compaction' || node.event.origin === 'compact-summary'
}

/** The one-line command a `user` row consists of, or `''`. */
function bareCommand(ev: TranscriptEvent): string {
  const texts = ev.blocks.filter((b) => b.kind === 'text')
  if (texts.length !== 1) return ''
  const text = (texts[0]?.text ?? '').trim()
  return /^[/!]\S/.test(text) && !text.includes('\n') ? text : ''
}

/**
 * Typing `/compact` writes it twice: once as the prompt the human sent, once as
 * the CLI's own `<command-name>` echo, 2 ms apart. Keep the echo — it is parsed,
 * carries the arguments, and reads as a command — and drop the prompt that says
 * exactly the same thing.
 */
function dropEchoedCommands(nodes: TimelineNode[]): TimelineNode[] {
  return nodes.filter((node, i) => {
    if (node.kind !== 'user') return true
    const typed = bareCommand(node.event)
    if (!typed) return true

    const next = nodes[i + 1]
    if (next?.kind !== 'event' || next.event.origin !== 'slash-command') return true

    const block = next.event.blocks.find((b) => b.kind === 'slash_command')
    if (!block) return true
    const echoed = [block.name ?? '', block.text ?? ''].join(' ').trim()
    return echoed !== typed
  })
}

/**
 * Put `/compact` back before the compaction it caused.
 *
 * Claude Code echoes a slash command into the transcript only once it returns,
 * so the rows land out of order: boundary, summarised history, then the command.
 * The timestamps say what really happened — the command ran at 09:41:33, the
 * boundary closed at 09:43:10. Left alone, the reader meets the effect first.
 *
 * We move a command back over the compaction rows that follow it in the file but
 * precede it in time, and never further.
 */
function hoistCommands(nodes: TimelineNode[]): TimelineNode[] {
  const out = [...nodes]
  for (let i = 0; i < out.length; i++) {
    const node = out[i]
    if (node?.kind !== 'event' || node.event.origin !== 'slash-command') continue

    let target = i
    while (target > 0) {
      const prev = out[target - 1]
      if (!prev || !isCompactionAftermath(prev)) break
      if (prev.kind !== 'event' || prev.event.timestamp <= node.event.timestamp) break
      target--
    }
    if (target !== i) {
      out.splice(i, 1)
      out.splice(target, 0, node)
    }
  }
  return out
}

/**
 * Le segment de compaction de chaque nœud, une fois le fil dans son ordre final.
 *
 * Une compaction vide la fenêtre : ce qui la suit est une autre conversation pour
 * le modèle, qui n'en connaît plus que le résumé. Le marqueur *ouvre* le segment
 * qu'il inaugure plutôt que de fermer le précédent — il porte les chiffres de la
 * fenêtre neuve, et le résumé conservé le suit immédiatement.
 *
 * Se calcule après `hoistCommands`, jamais avant : le `/compact` qui a provoqué
 * la compaction est remonté devant elle, et appartient donc à la phase qu'il
 * termine, pas à celle qu'il ouvre. C'est aussi ce qui condamne les `phase: 0`
 * posés à la construction — à ce moment-là l'ordre du fil n'est pas encore acquis.
 */
function assignPhases(nodes: TimelineNode[]): TimelineNode[] {
  let phase = 0
  return nodes.map((node) => {
    if (node.kind === 'event' && node.event.kind === 'compaction') phase++
    return { ...node, phase }
  })
}

function finish(events: TranscriptEvent[]): AssistantTurn | LooseNode[] {
  const first = events[0]
  if (!first) return []

  // A run with no assistant response is not a turn — it is stray system noise.
  // Rendering it under a "Claude" header would attribute it to Claude.
  if (!events.some((e) => e.kind === 'assistant')) {
    return events.map((event) => ({
      kind: 'event' as const,
      uuid: event.uuid,
      isSidechain: event.isSidechain,
      phase: 0,
      ...identityOf(event),
      event,
    }))
  }

  const last = events[events.length - 1] ?? first
  let outputTokens = 0
  let contextPeak = 0
  let toolCount = 0
  let thinkingCount = 0
  let model = ''

  for (const ev of events) {
    if (ev.usage) {
      outputTokens += ev.usage.output
      const context = ev.usage.input + ev.usage.cacheRead + ev.usage.cacheCreate
      if (context > contextPeak) contextPeak = context
    }
    if (!model && ev.model) model = ev.model
    for (const b of ev.blocks) {
      if (b.kind === 'tool_use') toolCount++
      else if (b.kind === 'thinking') thinkingCount++
    }
  }

  return {
    kind: 'turn',
    uuid: first.uuid,
    isSidechain: first.isSidechain,
    phase: 0,
    ...identityOf(first),
    events,
    model,
    startedAt: first.timestamp,
    endedAt: last.timestamp,
    durationMs: Math.max(0, last.timestamp - first.timestamp),
    outputTokens,
    contextPeak,
    toolCount,
    thinkingCount,
  }
}

export interface TurnOptions {
  /**
   * Montrer la consigne qui ouvre chaque run de sous-agent.
   *
   * Elle est masquée par défaut parce qu'elle est déjà à l'écran, dans la carte
   * de l'appel `Agent` qui a lancé le run — la répéter attribuerait à l'humain
   * les mots de l'orchestrateur, à deux lignes d'intervalle.
   *
   * Mais quand le run est montré *seul*, coupé du fil où cet appel se trouve,
   * cette carte n'est plus là : la consigne n'apparaît alors nulle part, et le
   * flux de l'agent commence par une réponse à une question qu'on ne lit pas.
   */
  showRunPrompt?: MaybeRefOrGetter<boolean>
}

export function useTranscriptTurns(source: MaybeRefOrGetter<TranscriptEvent[]>, options: TurnOptions = {}): ComputedRef<TimelineNode[]> {
  return computed(() => {
    const events = toValue(source)
    const showRunPrompt = toValue(options.showRunPrompt) === true
    const nodes: TimelineNode[] = []
    let run: TranscriptEvent[] = []
    /** Runs already opened, so the prompt that starts each one can be dropped. */
    const opened = new Set<string>()

    function flush(): void {
      if (!run.length) return
      const done = finish(run)
      if (Array.isArray(done)) nodes.push(...done)
      else nodes.push(done)
      run = []
    }

    for (const ev of events) {
      // A sub-agent's stream is a different conversation: never fold it into the
      // main one, even when its rows sit between two of ours. Two agents are two
      // conversations as well — `isSidechain` is true for both, so the run has to
      // break on the run id, or concurrent agents merge into one turn.
      const open = run[0]
      if (open && (open.isSidechain !== ev.isSidechain || open.agentId !== ev.agentId)) flush()

      // A run opens on the prompt its parent sent it. That text is normally
      // already on screen, in the `Agent` call that spawned the run — rendering
      // it again here would attribute the parent's instructions to the human.
      // Sauf quand le run est montré seul : cet appel est alors hors du flux, et
      // la consigne devient la seule chose qui explique ce qui suit. Elle sort
      // du run pour devenir son propre nœud, comme le prompt qui ouvre une
      // session : c'est le même geste, à un interlocuteur près.
      if (ev.isSidechain && ev.agentId && !opened.has(ev.agentId)) {
        opened.add(ev.agentId)
        if (ev.kind === 'user') {
          if (!showRunPrompt) continue
          flush()
          nodes.push({
            kind: 'user',
            uuid: ev.uuid,
            isSidechain: ev.isSidechain,
            phase: 0,
            ...identityOf(ev),
            event: ev,
          })
          continue
        }
      }

      // Un message reçu d'un équipier ouvre un tour comme un prompt en ouvre un :
      // c'est lui qui déclenche la réponse qui suit. Absorbé dans le tour d'avant,
      // il se rangeait sous la réponse qu'il n'a pas provoquée — et, faute de
      // rendu à cet endroit, disparaissait tout à fait.
      if (isHumanMessage(ev) || (ev.kind === 'user' && ev.origin === 'teammate')) {
        flush()
        nodes.push({
          kind: 'user',
          uuid: ev.uuid,
          isSidechain: ev.isSidechain,
          phase: 0,
          ...identityOf(ev),
          event: ev,
        })
      } else if (isLoose(ev)) {
        flush()
        nodes.push({
          kind: 'event',
          uuid: ev.uuid,
          isSidechain: ev.isSidechain,
          phase: 0,
          ...identityOf(ev),
          event: ev,
        })
      } else if (ev.blocks.length) {
        run.push(ev)
      }
    }
    flush()
    // Hoist first: the echo only lands next to its prompt once it is back in
    // causal order, and `dropEchoedCommands` compares neighbours.
    return assignPhases(dropEchoedCommands(hoistCommands(nodes)))
  })
}
