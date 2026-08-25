/**
 * ANSI escape sequences → HTML.
 *
 * Tool output is captured straight from a terminal, so it still carries the SGR
 * codes a shell would have painted (`ESC[2m` … `ESC[22m`). A browser renders the
 * escape character as nothing and the rest verbatim — `[2m` litter all over a
 * Playwright or vitest report. We render the styles instead of dropping them:
 * a red failure line is worth keeping.
 *
 * Only the 16 base colors are mapped, onto the palette the app already ships
 * (`--agent-*`), so both themes stay legible. 256-color and truecolor requests
 * fall back to the default foreground rather than inventing tokens.
 */

/** Every escape sequence a terminal swallows: CSI (incl. SGR), OSC, and 2-byte. */
// eslint-disable-next-line no-control-regex
const ESCAPES = /\u001b(?:\[[0-9;:?]*[ -/]*[@-~]|\][\s\S]*?(?:\u0007|\u001b\\)|[@-Z\\-_])/g

/** Carriage returns and backspaces: a terminal redraws with them, HTML cannot. */
const OTHER_CONTROLS = /\r(?!\n)|[\b]/g

export function stripAnsi(text: string): string {
  return text.replace(ESCAPES, '').replace(OTHER_CONTROLS, '')
}

type Color = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'

const COLORS: Color[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']

interface State {
  fg: Color | null
  bg: Color | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  inverse: boolean
}

function blank(): State {
  return {
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strike: false,
    inverse: false,
  }
}

const ESC_HTML: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ESC_HTML[c] ?? c)
}

/**
 * Applies one SGR parameter list to `state`. Extended-color selectors consume
 * their own arguments, hence the index-based loop.
 */
function applySgr(state: State, params: number[]): void {
  for (let i = 0; i < params.length; i++) {
    const p = params[i] ?? 0
    if (p === 0) Object.assign(state, blank())
    else if (p === 1) state.bold = true
    else if (p === 2) state.dim = true
    else if (p === 3) state.italic = true
    else if (p === 4) state.underline = true
    else if (p === 7) state.inverse = true
    else if (p === 9) state.strike = true
    else if (p === 21 || p === 22) {
      state.bold = false
      state.dim = false
    } else if (p === 23) state.italic = false
    else if (p === 24) state.underline = false
    else if (p === 27) state.inverse = false
    else if (p === 29) state.strike = false
    else if (p === 39) state.fg = null
    else if (p === 49) state.bg = null
    else if (p >= 30 && p <= 37) state.fg = COLORS[p - 30] ?? null
    else if (p >= 40 && p <= 47) state.bg = COLORS[p - 40] ?? null
    else if (p >= 90 && p <= 97) state.fg = COLORS[p - 90] ?? null
    else if (p >= 100 && p <= 107) state.bg = COLORS[p - 100] ?? null
    else if (p === 38 || p === 48) {
      // `38;5;n` (256 colors) or `38;2;r;g;b` (truecolor) — keep only what maps
      // onto the base 16, and skip the arguments of the rest.
      const mode = params[i + 1]
      const target = p === 38 ? 'fg' : 'bg'
      if (mode === 5) {
        const n = params[i + 2] ?? 0
        state[target] = n < 16 ? (COLORS[n % 8] ?? null) : null
        i += 2
      } else if (mode === 2) {
        state[target] = null
        i += 4
      }
    }
  }
}

function classesOf(state: State): string {
  const out: string[] = []
  // Inverse swaps the two ends rather than applying a filter, so an un-colored
  // inverted run still reads as a highlight.
  const fg = state.inverse ? (state.bg ?? 'black') : state.fg
  const bg = state.inverse ? (state.fg ?? 'white') : state.bg
  if (fg) out.push(`ansi-fg-${fg}`)
  if (bg) out.push(`ansi-bg-${bg}`)
  if (state.bold) out.push('ansi-bold')
  if (state.dim) out.push('ansi-dim')
  if (state.italic) out.push('ansi-italic')
  if (state.underline) out.push('ansi-underline')
  if (state.strike) out.push('ansi-strike')
  return out.join(' ')
}

/** True when `text` carries at least one escape sequence. */
export function hasAnsi(text: string): boolean {
  ESCAPES.lastIndex = 0
  return ESCAPES.test(text)
}

/**
 * Returns HTML: the source is escaped first, then wrapped in `<span>`s, so the
 * result is safe to hand to `v-html`.
 */
export function ansiToHtml(text: string): string {
  const state = blank()
  let out = ''
  let last = 0

  function push(chunk: string): void {
    if (!chunk) return
    const cls = classesOf(state)
    const safe = escapeHtml(chunk.replace(OTHER_CONTROLS, ''))
    out += cls ? `<span class="${cls}">${safe}</span>` : safe
  }

  ESCAPES.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ESCAPES.exec(text)) !== null) {
    push(text.slice(last, m.index))
    last = m.index + m[0].length
    const seq = m[0]
    if (seq.endsWith('m') && seq[1] === '[') {
      // `ESC[m` is a bare reset; `:` separates sub-parameters we don't read.
      const body = seq.slice(2, -1)
      const params = body === '' ? [0] : body.split(';').map((p) => Number(p.split(':')[0]) || 0)
      applySgr(state, params)
    }
  }
  push(text.slice(last))
  return out
}
