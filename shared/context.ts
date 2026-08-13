// What fills the model's context window over a session, and what a compaction
// threw away. Shared between the BFF that reconstructs it and the SPA that
// draws it — see `./transcript.ts` for why these types live outside both.
//
// Read this before trusting a number here:
//
//   `total`, `baseline` and everything on `Compaction` are EXACT — each is read
//   from, or subtracted between, figures the harness recorded.
//   `byCategory` and `ContextInjection.tokens` are ESTIMATES, from a chars/4
//   heuristic, because no Anthropic tokenizer runs offline.
//
// The two are never reconciled by scaling the estimates. A breakdown massaged to
// sum to the anchor would look trustworthy and be wrong. What the categories fail
// to account for is `unattributed`, and it is not one thing: `baseline` names the
// part we can pin down, the rest we decline to name. See both fields.
//
// Measured over a large sample of sessions: the categories account for
// about a quarter of the window. `baseline` explains most of the remainder on
// short sessions, and the estimator's shortfall on code — chars/4 runs long on
// prose and short on code, which is most of what a tool returns — explains much
// of the rest. Neither is a bug to be tuned away; both are stated on the panel.

/**
 * Rough token count of a piece of text.
 *
 * Four characters per token is the usual English-prose approximation. It runs
 * long on code and short on prose, so any figure derived from it is indicative,
 * never authoritative — always render it behind a `~`. Shared with the SPA, which
 * sizes the per-tool badges with it.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The slices of context we can actually attribute to something.
 *
 * The first six are *content* — things a session put into its own window. The
 * seventh, `harness`, is the machinery Claude Code injects on its own: tool and
 * agent listings, MCP instructions, todo reminders, hook output, task
 * notifications. It is last on purpose: `--series-*` holds six hues, and the
 * theme forbids reusing one. The panel draws `harness` in grey, beside the
 * baseline and the remainder, which is what it is.
 */
export type ContextCategory =
  'memory' | 'skills' | 'files' | 'tools' | 'thinking' | 'userMessage' | 'harness';

/** Fixed order. It drives colour assignment, so never sort or cycle it. */
export const CONTEXT_CATEGORIES: readonly ContextCategory[] = [
  'memory',
  'skills',
  'files',
  'tools',
  'thinking',
  'userMessage',
  'harness',
];

/**
 * One tool, as it weighed on a turn. `count` folds repeated calls of the same
 * tool: three `Read`s read as one line, not three.
 */
export interface ToolBreakdown {
  name: string;
  tokens: number;
  count: number;
  /** At least one of those calls came back an error. */
  isError: boolean;
}

/** One named line of a catalogue injection: a skill, an agent, an MCP server. */
export interface ContextEntry {
  label: string;
  tokens: number;
}

/** One thing that entered the context window. `tokens` is an estimate. */
export interface ContextInjection {
  category: ContextCategory;
  /** What to show the user, e.g. a file's base name. */
  label: string;
  /** Absolute path, when the injection came from one. */
  path?: string;
  tokens: number;
  /** The turn at which it entered the window. */
  turnIndex: number;
  /** Which compaction segment it belongs to — a compaction empties the window. */
  phase: number;
  /**
   * When set, the same thing entering the window twice within a phase is counted
   * once. A CLAUDE.md layer or an @-mentioned file is re-*referenced* far more
   * often than it is re-*sent*; an edited file's snippet, by contrast, is new
   * text every time, and carries no key.
   *
   * A compaction empties the window, so the key set resets with it: re-injection
   * into the next phase is a real cost and is counted again.
   */
  dedupeKey?: string;
  /** `tools` only: how many tool calls were folded into this row. */
  toolCount?: number;
  /**
   * `tools` only: the split of `tokens` between what was sent to the tool and
   * what it sent back. An `Edit` weighs almost nothing on the way out and a great
   * deal on the way in, and the reverse is true of a `Read` — one figure hides
   * which of the two a session is paying for.
   */
  inputTokens?: number;
  outputTokens?: number;
  /**
   * `tools` only: which tools, largest first. "12 appels d'outil au tour 7" names
   * nothing — the reader cannot tell one 5 k `Read` from twelve cheap `Bash`.
   */
  tools?: ToolBreakdown[];
  /**
   * `thinking` only: the two halves of what a response produced. Claude's
   * reasoning and its answer both fall into the next turn's window, but only one
   * of them is shortened by asking for less thinking.
   */
  thinkingTokens?: number;
  textTokens?: number;
  /**
   * A catalogue's named lines — the skills, agents or MCP servers it lists.
   *
   * These injections are a *menu*, loaded once by the harness so the model knows
   * what it *could* reach; nothing here was invoked. Naming the lines answers the
   * only question the count raises — "18 skills, but which?" — and shows which
   * descriptions are the expensive ones.
   */
  entries?: ContextEntry[];
}

/** The context window as it stood when one assistant response was produced. */
export interface TurnContext {
  /** 0-based index among the session's assistant responses. */
  turnIndex: number;
  /** Which compaction segment this turn lived in. */
  phase: number;
  /** UUID of the assistant event this describes. */
  uuid: string;
  timestamp: number;
  /**
   * Exact size of the context sent to the model:
   * `usage.input + usage.cacheRead + usage.cacheCreate`.
   */
  total: number;
  /** Estimated share per category, cumulative since the last compaction. */
  byCategory: Record<ContextCategory, number>;
  /**
   * `total` minus the categories. Never negative.
   *
   * Everything the transcript does not spell out as an injection. `baseline`
   * names the largest identifiable part of it; what is left over after that is
   * message framing, the tool calls we have not yet learnt to read, and the
   * error of a chars/4 estimator on source code. Do not present this as one
   * thing to the reader — it is not.
   */
  unattributed: number;
}

/** Exact window growth at one anchored turn — no estimate involved. */
export interface TurnDelta {
  turnIndex: number;
  uuid: string;
  /** Exact size of the window at this turn. */
  total: number;
  /** Exact growth since the previous anchored turn of the phase. */
  delta: number;
}

/** A compaction event. Every field is recorded by the harness — none is estimated. */
export interface Compaction {
  uuid: string;
  timestamp: number;
  /** `manual` — the user ran /compact; `auto` — the window filled up. */
  trigger: 'manual' | 'auto';
  preTokens: number;
  postTokens: number;
  durationMs: number;
}

/**
 * Exact window growth, turn by turn, in chronological order.
 *
 * A phase does not start from zero: the first turn's growth is measured from the
 * baseline (phase 0) or from the post-compaction size (later phases), or the turn
 * that reloads a summarised history would appear to add all of it at once. Every
 * figure here is exact — it is the difference of two sizes the harness recorded.
 */
export function turnDeltas(ctx: SessionContext, phase: number): TurnDelta[] {
  const anchored = ctx.turns.filter((t) => t.total > 0 && t.phase === phase);
  const start = phase === 0 ? ctx.baseline : (ctx.compactions[phase - 1]?.postTokens ?? 0);
  return anchored.map((t, i) => ({
    turnIndex: t.turnIndex,
    uuid: t.uuid,
    total: t.total,
    delta: t.total - (i === 0 ? start : (anchored[i - 1]?.total ?? 0)),
  }));
}

export interface SessionContext {
  /** Size of the model's window. See `contextLimitFor` — it is not the model id. */
  limit: number;
  /**
   * What the session cost before anyone said anything: the system prompt and the
   * tool schemas. Neither is ever written to the transcript.
   *
   * Derived, not guessed: the first response states the exact size of the context
   * it was handed, and we know what we injected into it. The difference is what
   * the harness put there on its own. In practice the figure sits in the tens of
   * thousands of tokens, which is why a short session looks mostly
   * "unattributed" — most of it was spent before the first prompt.
   *
   * `0` when the first turn carries no usage: the subtraction has no anchor, and
   * a plausible constant would be a lie. Callers must render nothing, not zero.
   */
  baseline: number;
  turns: TurnContext[];
  compactions: Compaction[];
  /**
   * Everything that entered the window, across every phase, in arrival order.
   * The panel ranks these by size to answer "what is eating my context?".
   */
  injections: ContextInjection[];
}
