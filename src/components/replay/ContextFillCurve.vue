<template>
  <figure class="cf">
    <svg class="cf-svg" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="caption">
      <!-- La limite de la fenêtre : le plafond que le remplissage approche. Elle
           n'est tracée que si l'échelle monte jusque-là ; sinon elle tombe hors
           du cadre, et le SVG étant en `overflow: visible`, elle irait barrer ce
           qui se trouve au-dessus du graphe. -->
      <line v-if="limitInScale" class="cf-limit" :x1="0" :x2="W" :y1="yLimit" :y2="yLimit" />

      <!-- Une barre à chaque compaction : là où la fenêtre a été vidée. -->
      <line v-for="(x, i) in compactionX" :key="i" class="cf-compact" :x1="x" :x2="x" :y1="0" :y2="H" />

      <path class="cf-area" :d="areaPath" />
      <path class="cf-line" :d="linePath" />
    </svg>
    <figcaption class="cf-cap">{{ caption }}</figcaption>
  </figure>
</template>

<script setup lang="ts">
  import type { SessionContext } from '@/services/projects'
  import { fmtNum } from '@/utils/format'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()

  const props = defineProps<{ context: SessionContext }>()

  // Coordonnées internes ; le SVG est étiré par `preserveAspectRatio="none"`, donc
  // ces nombres ne sont qu'un repère, pas des pixels.
  const W = 300
  const H = 40
  /** Marge haute : la courbe ne colle pas au bord, la ligne de limite respire. */
  const PAD = 3

  /** Les tours réellement ancrés, dans l'ordre — un point par réponse mesurée. */
  const points = computed(() => props.context.turns.filter((t) => t.total > 0))

  /**
   * L'échelle verticale monte jusqu'à la limite si le pic n'en est pas trop loin,
   * sinon jusqu'au pic — une session qui n'a jamais dépassé 60 k d'une fenêtre de
   * 200 k s'écraserait en bas d'une échelle fixée sur la limite.
   */
  const scaleMax = computed(() => {
    const peak = points.value.reduce((m, t) => Math.max(m, t.total), 0)
    return peak > props.context.limit * 0.6 ? props.context.limit : Math.max(peak, 1)
  })

  function x(i: number): number {
    return points.value.length <= 1 ? W / 2 : (i / (points.value.length - 1)) * W
  }
  function y(total: number): number {
    return PAD + (1 - total / scaleMax.value) * (H - PAD)
  }

  const linePath = computed(() => points.value.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(t.total).toFixed(1)}`).join(' '))

  // L'aire sous la courbe, refermée sur le bas : la même ligne, plus deux angles.
  const areaPath = computed(() => {
    if (!points.value.length) return ''
    return `${linePath.value} L${W} ${H} L0 ${H} Z`
  })

  const yLimit = computed(() => y(props.context.limit))

  /** Vrai quand l'échelle est calée sur la limite — seul cas où la tracer a du sens. */
  const limitInScale = computed(() => scaleMax.value >= props.context.limit)

  /** L'abscisse de chaque compaction : le premier tour d'une phase après la 0. */
  const compactionX = computed(() => {
    const xs: number[] = []
    points.value.forEach((t, i) => {
      if (i > 0 && t.phase > points.value[i - 1]!.phase) xs.push(x(i))
    })
    return xs
  })

  const caption = computed(() => {
    const peak = points.value.reduce((m, t) => Math.max(m, t.total), 0)
    const n = props.context.compactions.length
    // L'espace vit ici : vue-i18n raboterait celui d'un message.
    const comp = n ? ` ${t('replay.fillCurve.compactions', n)}` : ''
    return t('replay.fillCurve.caption', {
      turns: points.value.length,
      peak: fmtNum(peak),
      limit: fmtNum(props.context.limit),
      compactions: comp,
    })
  })
</script>

<style scoped lang="scss">
  .cf {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cf-svg {
    width: 100%;
    height: 40px;
    display: block;
    overflow: visible;
  }

  .cf-area {
    fill: var(--brand-soft);
    stroke: none;
  }
  .cf-line {
    fill: none;
    stroke: var(--brand);
    stroke-width: 1.5;
    // Étiré horizontalement par le viewBox ; garder un trait d'épaisseur constante.
    vector-effect: non-scaling-stroke;
  }
  .cf-limit {
    stroke: var(--faint);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
  }
  .cf-compact {
    stroke: var(--danger);
    stroke-width: 1;
    stroke-dasharray: 2 2;
    opacity: 0.6;
    vector-effect: non-scaling-stroke;
  }

  .cf-cap {
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
</style>
