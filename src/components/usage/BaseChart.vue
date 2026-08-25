<template>
  <!-- The canvas is decorative: the figures it plots are also listed in the
       table beside it, which is what a screen reader (and a colourblind reader
       under the relief rule) actually consumes. -->
  <div class="chart-box" :style="{ height: `${height}px` }">
    <canvas ref="canvasEl" role="presentation" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
  import { Chart, type ChartConfiguration } from 'chart.js/auto'
  import { onBeforeUnmount, onMounted, ref, watch, useTemplateRef } from 'vue'

  const props = withDefaults(defineProps<{ config: ChartConfiguration; height?: number }>(), {
    height: 260,
  })

  const canvasEl = useTemplateRef<HTMLCanvasElement>('canvasEl')
  const chart = ref<Chart | null>(null)

  function render(): void {
    const el = canvasEl.value
    if (!el) return
    chart.value?.destroy()
    chart.value = new Chart(el, props.config)
  }

  onMounted(render)
  // The config is rebuilt from scratch on a theme flip or a data reload; Chart.js
  // mutates the object it is handed, so replace the instance rather than patch it.
  watch(() => props.config, render, { deep: false })
  onBeforeUnmount(() => chart.value?.destroy())
</script>

<style scoped lang="scss">
  .chart-box {
    position: relative;
    width: 100%;
  }
</style>
