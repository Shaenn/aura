// Cost estimation for Claude API token usage.
//
// ⚠️ These are *API list prices*. A Pro/Max subscription bills a flat monthly
// fee, not per token — the figures here answer "what would this session have
// cost on the API?", not "what did you pay". The UI must say so.
//
// Prices are $ per million tokens, Anthropic API list as of 2026-06-24.
// Source: the `claude-api` skill (shared/models.md, shared/prompt-caching.md).
// Only `input` and `output` are stored: the cache rates are fixed multiples of
// the input rate, so deriving them keeps one number per model instead of four
// that can drift apart.

/** Cache-write (5-minute TTL) costs 1.25x the base input rate. */
const CACHE_WRITE_MULTIPLIER = 1.25;
/** Cache-read costs ~0.1x the base input rate. */
const CACHE_READ_MULTIPLIER = 0.1;

/** $/MTok. `introUntil` is inclusive, ISO `YYYY-MM-DD`. */
interface Rate {
  input: number;
  output: number;
  introUntil?: string;
  introInput?: number;
  introOutput?: number;
}

// Longest prefix wins, so a dated id (`claude-haiku-4-5-20251001`) and a bare
// alias (`claude-haiku-4-5`) both resolve, and `claude-opus-4-8` never matches
// a hypothetical `claude-opus-4-80`. Keep keys as *full model ids*.
const RATES: Record<string, Rate> = {
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos-5': { input: 10, output: 50 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-opus-4-1': { input: 15, output: 75 },
  // Sonnet 5 ships at an introductory rate through 2026-08-31.
  'claude-sonnet-5': {
    input: 3,
    output: 15,
    introUntil: '2026-08-31',
    introInput: 2,
    introOutput: 10,
  },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

/**
 * The rate card for a model id, or `null` when we have no price for it.
 *
 * Unknown ids are *not* guessed from the family name: a model we've never
 * priced would silently bill at a stale rate. Callers surface them instead
 * (see `unpricedModels` in `usage.ts`).
 */
function rateFor(model: string): Rate | null {
  let best: Rate | null = null;
  let bestLen = 0;
  for (const [id, rate] of Object.entries(RATES)) {
    if (model === id || model.startsWith(`${id}-`)) {
      if (id.length > bestLen) {
        best = rate;
        bestLen = id.length;
      }
    }
  }
  return best;
}

/** Whether we can put a dollar figure on this model at all. */
export function isPriced(model: string): boolean {
  return rateFor(model) !== null;
}

/**
 * Cost in dollars of one API response, or `null` if the model has no price
 * (a local model, `<synthetic>`, or one released after this table was written).
 *
 * `day` is the ISO date the tokens were spent, needed only for models on a
 * time-limited introductory rate.
 */
export function costOf(model: string, t: TokenCounts, day: string): number | null {
  const rate = rateFor(model);
  if (!rate) return null;

  const intro = rate.introUntil !== undefined && day <= rate.introUntil;
  const input = intro ? (rate.introInput ?? rate.input) : rate.input;
  const output = intro ? (rate.introOutput ?? rate.output) : rate.output;

  return (
    (t.input * input +
      t.output * output +
      t.cacheCreate * input * CACHE_WRITE_MULTIPLIER +
      t.cacheRead * input * CACHE_READ_MULTIPLIER) /
    1_000_000
  );
}
