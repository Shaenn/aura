// Chart.js draws into a canvas, which knows nothing about CSS custom properties.
// Resolve the design tokens to concrete values in JS, and recompute them when the
// theme flips — otherwise a dark-mode toggle leaves the charts painted for the
// old surface.

import { useQuasar } from 'quasar'
import { ref, watch, type Ref } from 'vue'

export interface ChartTokens {
  /** Categorical slots, in the fixed order defined by the theme. */
  series: string[]
  text: string
  muted: string
  line: string
  surface: string
}

/** Number of `--series-N` tokens declared in `app.scss`. */
const SERIES_COUNT = 6

function read(): ChartTokens {
  const s = getComputedStyle(document.body)
  function v(name: string) {
    return s.getPropertyValue(name).trim()
  }
  return {
    series: Array.from({ length: SERIES_COUNT }, (_, i) => v(`--series-${i + 1}`)),
    text: v('--text'),
    muted: v('--muted'),
    line: v('--line'),
    surface: v('--surface'),
  }
}

/**
 * Reactive design tokens for charts. Re-read on every theme change; the caller
 * rebuilds its chart from the new values.
 */
export function useChartTokens(): Ref<ChartTokens> {
  const $q = useQuasar()
  const tokens = ref<ChartTokens>(read())
  watch(
    () => $q.dark.isActive,
    () => {
      // The class swap happens on <body>; wait a frame so getComputedStyle sees it.
      requestAnimationFrame(() => (tokens.value = read()))
    },
  )
  return tokens
}

/**
 * Colour for categorical slot `i`, assigned in fixed order and never cycled.
 * Past the palette's length the caller should fold the tail into an "Autre"
 * bucket rather than reuse a hue — a repeated colour reads as the same entity.
 */
export function seriesColor(tokens: ChartTokens, i: number): string {
  return tokens.series[i] ?? tokens.muted
}
