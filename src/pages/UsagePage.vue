<template>
  <q-page class="us">
    <h1 class="sr-only">{{ t('nav.usage') }}</h1>

    <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

    <header class="us-header">
      <q-icon name="insights" size="15px" class="us-head-icon" aria-hidden="true" />
      <p class="us-sub font-mono">{{ t('pages.usage.sub') }}</p>
      <SegmentedControl v-model="range" :options="rangeOptions" :aria-label="t('pages.usage.rangeAria')" class="us-range" />
      <!-- Cette page décrit ; le diagnostic juge. Le lien est là parce que c'est
           ici qu'on remarque un montant inhabituel. -->
      <q-btn flat dense no-caps icon="troubleshoot" :label="t('nav.diagnostic')" :to="{ name: 'diagnostic' }" />
      <q-btn flat dense no-caps :label="t('common.refresh')" :disable="loading" @click="reload" />
    </header>

    <!-- A dollar figure on a flat-fee subscription is misleading unless it says so. -->
    <q-banner dense class="us-caveat">
      <template #avatar>
        <q-icon name="info" size="18px" aria-hidden="true" />
      </template>
      <i18n-t keypath="pages.usage.caveat" scope="global">
        <template #rates>
          <strong>{{ t('pages.usage.caveatRates') }}</strong>
        </template>
      </i18n-t>
      <span v-if="report?.unpricedModels.length" class="us-caveat-unpriced">
        {{ t('pages.usage.unpriced', { n: report.unpricedModels.length, list: report.unpricedModels.join(', ') }, report.unpricedModels.length) }}
      </span>
    </q-banner>

    <!-- Error: the whole page depends on one request, so it replaces everything below. -->
    <section v-if="error" class="surface-card us-state" aria-live="polite">
      <q-icon name="warning" size="lg" color="negative" aria-hidden="true" />
      <h2>{{ t('pages.usage.loadError') }}</h2>
      <p class="us-state-msg">{{ error }}</p>
      <q-btn unelevated no-caps color="primary" :label="t('common.retry')" :loading="loading" @click="reload" />
    </section>

    <template v-else>
      <!-- Totals -->
      <section class="us-tiles" :aria-label="t('pages.usage.totalsAria')">
        <article v-for="tile in tiles" :key="tile.label" class="surface-card us-tile">
          <p class="section-label us-tile-label">{{ tile.label }}</p>
          <p v-if="loading" class="us-tile-value"><q-skeleton type="text" width="70%" /></p>
          <p v-else class="us-tile-value font-mono" :class="{ 'us-tile-value--cost': tile.accent }">
            {{ tile.value }}
          </p>
          <p class="us-tile-hint">{{ tile.hint }}</p>
        </article>
      </section>

      <!-- Cost over time, split by model. One axis: every series is dollars. -->
      <section class="surface-card us-section" aria-labelledby="us-daily-title">
        <header class="us-section-head">
          <q-icon name="stacked_bar_chart" size="20px" aria-hidden="true" />
          <h2 id="us-daily-title">{{ t('pages.usage.daily') }}</h2>
          <span class="us-count font-mono">
            {{ report ? t('pages.usage.days', { n: report.byDay.length }) : '—' }}
          </span>
        </header>

        <q-skeleton v-if="loading" height="260px" />
        <p v-else-if="!report?.byDay.length" class="us-empty">
          {{ t('pages.usage.noActivity') }}
        </p>
        <template v-else>
          <BaseChart :config="dailyConfig" :height="260" />
          <ul class="us-legend">
            <li v-for="m in chartModels" :key="m" class="us-legend-item">
              <span class="us-swatch" :style="{ background: colorOf(m) }" aria-hidden="true" />
              <span class="us-legend-label">{{ shortModel(m) }}</span>
            </li>
          </ul>
        </template>
      </section>

      <!-- Models. The table is the accessible view of the doughnut, and satisfies
           the relief rule for the light-mode hues that fall under 3:1. -->
      <section class="surface-card us-section" aria-labelledby="us-models-title">
        <header class="us-section-head">
          <q-icon name="donut_small" size="20px" aria-hidden="true" />
          <h2 id="us-models-title">{{ t('pages.usage.byModel') }}</h2>
          <span class="us-count font-mono">{{ report?.byModel.length ?? '—' }}</span>
        </header>

        <q-skeleton v-if="loading" height="260px" />
        <p v-else-if="!report?.byModel.length" class="us-empty">
          {{ t('pages.usage.noModel') }}
        </p>
        <div v-else class="us-split">
          <BaseChart :config="modelConfig" :height="240" />
          <table class="us-table">
            <caption class="sr-only">
              {{
                t('pages.usage.tableCaption')
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ t('pages.usage.columns.model') }}</th>
                <th scope="col" class="us-num">{{ t('pages.usage.columns.turns') }}</th>
                <th scope="col" class="us-num">{{ t('pages.usage.columns.cost') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in report.byModel" :key="m.model">
                <th scope="row" class="us-row-head">
                  <span class="us-swatch" :style="{ background: colorOf(m.model) }" aria-hidden="true" />
                  {{ shortModel(m.model) }}
                </th>
                <td class="us-num font-mono">{{ fmtNum(m.turns) }}</td>
                <td class="us-num font-mono">{{ m.cost > 0 ? money(m.cost) : 'n/a' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Projects -->
      <section class="surface-card us-section" aria-labelledby="us-projects-title">
        <header class="us-section-head">
          <q-icon name="folder" size="20px" aria-hidden="true" />
          <h2 id="us-projects-title">{{ t('pages.usage.topProjects') }}</h2>
          <span class="us-count font-mono">{{ report?.byProject.length ?? '—' }}</span>
        </header>

        <q-skeleton v-if="loading" height="200px" />
        <p v-else-if="!report?.byProject.length" class="us-empty">
          {{ t('pages.usage.noProject') }}
        </p>
        <ul v-else class="us-bars">
          <li v-for="p in topProjects" :key="p.project" class="us-bar">
            <div class="us-bar-info">
              <span class="us-bar-label" :title="p.project">{{ projectName(p.project) }}</span>
              <span class="us-bar-value font-mono">{{ money(p.cost) }}</span>
            </div>
            <div class="us-bar-track">
              <div class="us-bar-fill" :style="{ width: barWidth(p.cost, topProjects[0]?.cost) }" />
            </div>
          </li>
        </ul>
      </section>

      <!-- Sub-agents: the tokens spent by fan-outs, invisible everywhere else. -->
      <section class="surface-card us-section" aria-labelledby="us-agents-title">
        <header class="us-section-head">
          <q-icon name="account_tree" size="20px" aria-hidden="true" />
          <h2 id="us-agents-title">{{ t('pages.usage.agents') }}</h2>
          <span v-if="agentShare !== null" class="us-count font-mono">
            {{ t('pages.usage.agentShare', { pct: agentShare }) }}
          </span>
        </header>

        <q-skeleton v-if="loading" height="200px" />
        <p v-else-if="!report?.byAgent.length" class="us-empty">
          {{ t('pages.usage.noAgent') }}
        </p>
        <ul v-else class="us-bars">
          <li v-for="a in report.byAgent" :key="a.agentType" class="us-bar">
            <div class="us-bar-info">
              <span class="us-bar-label">{{ a.agentType }}</span>
              <span class="us-bar-value font-mono">{{ money(a.cost) }}</span>
            </div>
            <div class="us-bar-track">
              <div class="us-bar-fill us-bar-fill--agent" :style="{ width: barWidth(a.cost, report.byAgent[0]?.cost) }" />
            </div>
          </li>
        </ul>
      </section>
    </template>
  </q-page>
</template>

<script setup lang="ts">
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import BaseChart from '@/components/usage/BaseChart.vue'
  import { useChartTokens, seriesColor } from '@/composables/useChartTokens'
  import { getUsage, resolveRange, type RangeKey, type UsageReport } from '@/services/usage'
  import { fmtMoney, fmtNum } from '@/utils/format'
  import type { ChartConfiguration } from 'chart.js/auto'
  import { computed, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()
  const tokens = useChartTokens()

  const range = ref<RangeKey>('30d')
  const rangeOptions = computed(() => [
    { label: t('pages.usage.ranges.d7'), value: '7d' as const },
    { label: t('pages.usage.ranges.d30'), value: '30d' as const },
    { label: t('pages.usage.ranges.d90'), value: '90d' as const },
    { label: t('pages.usage.ranges.all'), value: 'all' as const },
  ])

  const report = ref<UsageReport | null>(null)
  const loading = ref(true)
  const error = ref('')

  /**
   * Colour is a property of the model, not of its rank: it is assigned once, from
   * the all-time ranking, and reused for every range. Recomputing it per range
   * would repaint the surviving series whenever a model drops out of the window.
   */
  const colorKeys = ref<string[]>([])

  const money = fmtMoney

  /** `claude-haiku-4-5-20251001` → `haiku-4-5`; a local model keeps its own name. */
  function shortModel(m: string): string {
    return m.replace(/^claude-/, '').replace(/-\d{8}$/, '')
  }

  function projectName(slug: string): string {
    const parts = slug.split('-').filter(Boolean)
    return parts[parts.length - 1] ?? slug
  }

  function colorOf(model: string): string {
    const i = colorKeys.value.indexOf(model)
    // Past the palette, entities share the muted ink rather than a recycled hue.
    return i >= 0 && i < tokens.value.series.length ? seriesColor(tokens.value, i) : tokens.value.muted
  }

  /** Models that get their own colour; the rest are folded into the muted tail. */
  const chartModels = computed(() =>
    colorKeys.value.slice(0, tokens.value.series.length).filter((m) => report.value?.byModel.some((x) => x.model === m)),
  )

  const topProjects = computed(() => report.value?.byProject.slice(0, 10) ?? [])

  const agentShare = computed(() => {
    const r = report.value
    if (!r || !r.totals.cost) return null
    const sub = r.byAgent.reduce((s, a) => s + a.cost, 0)
    return ((sub / r.totals.cost) * 100).toFixed(1)
  })

  const tiles = computed(() => {
    const tot = report.value?.totals
    return [
      {
        label: t('pages.usage.tiles.cost'),
        value: tot ? money(tot.cost) : '—',
        hint: t('pages.usage.tiles.costHint'),
        accent: true,
      },
      {
        label: t('pages.usage.tiles.sessions'),
        value: tot ? fmtNum(tot.sessions) : '—',
        hint: t('pages.usage.tiles.sessionsHint'),
      },
      {
        label: t('pages.usage.tiles.turns'),
        value: tot ? fmtNum(tot.turns) : '—',
        hint: t('pages.usage.tiles.turnsHint'),
      },
      {
        label: t('pages.usage.tiles.input'),
        value: tot ? fmtNum(tot.input) : '—',
        hint: t('pages.usage.tiles.inputHint'),
      },
      {
        label: t('pages.usage.tiles.output'),
        value: tot ? fmtNum(tot.output) : '—',
        hint: t('pages.usage.tiles.outputHint'),
      },
      {
        label: t('pages.usage.tiles.cacheRead'),
        value: tot ? fmtNum(tot.cacheRead) : '—',
        hint: t('pages.usage.tiles.cacheReadHint'),
      },
    ]
  })

  function barWidth(v: number, max: number | undefined): string {
    if (!max || max <= 0) return '0%'
    return `${Math.max((v / max) * 100, 1.5)}%`
  }

  // ── Charts ───────────────────────────────────────────────────────────────────

  /**
   * Stacked bars: one stack per day, one series per model. Single axis — every
   * series is dollars, so the stack totals to the day's cost and the segments
   * stay comparable. (Stacking tokens and cache on two axes would not be.)
   */
  const dailyConfig = computed<ChartConfiguration>(() => {
    const r = report.value
    const tk = tokens.value
    const days = r?.byDay.map((d) => d.day) ?? []
    const models = chartModels.value

    const cost = new Map<string, number>()
    for (const row of r?.byDayModel ?? []) cost.set(`${row.day}|${row.model}`, row.cost)

    const datasets = models.map((m) => ({
      label: shortModel(m),
      data: days.map((d) => cost.get(`${d}|${m}`) ?? 0),
      backgroundColor: colorOf(m),
      // A 2px surface gap keeps adjacent stacked segments separable.
      borderColor: tk.surface,
      borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
      borderRadius: 3,
    }))

    return {
      type: 'bar',
      data: { labels: days, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          // Identity is carried by the HTML legend below, which screen readers reach.
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.dataset.label} — ${money(c.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: tk.muted, maxRotation: 0, autoSkipPadding: 24 },
            border: { color: tk.line },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: tk.line },
            border: { display: false },
            ticks: { color: tk.muted, callback: (v) => `$${v}` },
          },
        },
      },
    }
  })

  const modelConfig = computed<ChartConfiguration>(() => {
    const rows = (report.value?.byModel ?? []).filter((m) => m.cost > 0)
    const tk = tokens.value
    return {
      type: 'doughnut',
      data: {
        labels: rows.map((m) => shortModel(m.model)),
        datasets: [
          {
            data: rows.map((m) => m.cost),
            backgroundColor: rows.map((m) => colorOf(m.model)),
            // A 2px surface gap between adjacent segments keeps them separable.
            borderColor: tk.surface,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${money(c.parsed ?? 0)}` } },
        },
      },
    }
  })

  // ── Loading ──────────────────────────────────────────────────────────────────

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const { from, to } = resolveRange(range.value)
      const r = await getUsage(from, to)
      report.value = r
      // Seed the stable colour order from the first (widest) load we ever make.
      if (!colorKeys.value.length) colorKeys.value = r.byModel.map((m) => m.model)
    } catch (e) {
      error.value = e instanceof Error ? e.message : t('pages.usage.unknownError')
      report.value = null
    } finally {
      loading.value = false
    }
  }

  async function reload(): Promise<void> {
    await load()
  }

  onMounted(async () => {
    // Prime the colour order from the all-time ranking, so a model keeps its hue
    // whatever range the user picks next.
    try {
      const all = await getUsage()
      colorKeys.value = all.byModel.map((m) => m.model)
    } catch {
      /* the range load below will seed it instead */
    }
    await load()
  })

  watch(range, load)
</script>

<style scoped lang="scss">
  .us {
    padding: var(--space-lg);
    max-width: var(--page-max);
    margin: 0 auto;
  }

  .us-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
    flex-wrap: wrap;
  }
  .us-head-icon {
    color: var(--brand);
  }
  .us-sub {
    color: var(--dim);
    font-size: var(--fs-xs);
    margin: 0;
    flex: 1 1 auto;
  }
  .us-range {
    flex: 0 0 auto;
  }

  .us-caveat {
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
    margin-bottom: var(--space-md);
  }
  .us-caveat-unpriced {
    display: block;
    margin-top: var(--space-xs);
    color: var(--dim);
  }

  .us-state {
    text-align: center;
    padding: var(--space-xl);
  }
  .us-state-msg {
    color: var(--muted);
    margin: var(--space-xs) 0 var(--space-md);
  }

  .us-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }
  .us-tile {
    padding: var(--space-md);
  }
  .us-tile-label {
    color: var(--dim);
    margin: 0 0 var(--space-xs);
  }
  .us-tile-value {
    font-size: var(--fs-lg);
    color: var(--text);
    margin: 0;
  }
  .us-tile-value--cost {
    color: var(--brand);
  }
  .us-tile-hint {
    color: var(--faint);
    font-size: var(--fs-xs);
    margin: var(--space-xs) 0 0;
  }

  .us-section {
    padding: var(--space-md);
    margin-bottom: var(--space-md);
  }
  .us-section-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);

    h2 {
      font-size: var(--fs-md);
      margin: 0;
      flex: 1 1 auto;
    }
  }
  .us-count {
    color: var(--dim);
    font-size: var(--fs-xs);
  }
  .us-empty {
    color: var(--muted);
    text-align: center;
    padding: var(--space-xl) 0;
    margin: 0;
  }

  .us-split {
    display: grid;
    grid-template-columns: minmax(200px, 280px) 1fr;
    gap: var(--space-lg);
    align-items: center;

    @media (max-width: 700px) {
      grid-template-columns: 1fr;
    }
  }

  .us-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm) var(--space-md);
    list-style: none;
    padding: 0;
    margin: var(--space-md) 0 0;
  }
  .us-legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .us-legend-label {
    color: var(--muted);
    font-size: var(--fs-xs);
  }
  .us-swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    display: inline-block;
    flex: 0 0 auto;
  }

  .us-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);

    th,
    td {
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--line);
      text-align: left;
    }
    thead th {
      color: var(--dim);
      font-weight: 500;
      font-size: var(--fs-xs);
    }
    tbody tr:last-child th,
    tbody tr:last-child td {
      border-bottom: none;
    }
  }
  .us-row-head {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-weight: 400;
    color: var(--text);
  }
  .us-num {
    text-align: right;
  }

  .us-bars {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .us-bar-info {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
    font-size: var(--fs-sm);
    margin-bottom: 4px;
  }
  .us-bar-label {
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .us-bar-value {
    color: var(--muted);
    flex: 0 0 auto;
  }
  .us-bar-track {
    height: 6px;
    background: var(--surface-3);
    border-radius: 3px;
    overflow: hidden;
  }
  .us-bar-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--series-1);
  }
  .us-bar-fill--agent {
    background: var(--series-4);
  }
</style>
