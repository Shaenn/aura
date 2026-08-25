<template>
  <q-page class="dg">
    <h1 class="sr-only">{{ t('pages.diagnostic.title') }}</h1>

    <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

    <header class="dg-header">
      <q-icon name="troubleshoot" size="15px" class="dg-head-icon" aria-hidden="true" />
      <p class="dg-sub font-mono">{{ t('pages.diagnostic.sub') }}</p>
      <SegmentedControl v-model="range" :options="rangeOptions" :aria-label="t('pages.usage.rangeAria')" class="dg-range" />
      <q-btn flat dense no-caps :label="t('common.refresh')" :disable="loading" @click="reload" />
    </header>

    <!-- Error: the whole page depends on one request, so it replaces everything below. -->
    <section v-if="error" class="surface-card dg-state" aria-live="polite">
      <q-icon name="warning" size="lg" color="negative" aria-hidden="true" />
      <h2>{{ t('pages.diagnostic.loadError') }}</h2>
      <p class="dg-state-msg">{{ error }}</p>
      <q-btn unelevated no-caps color="primary" :label="t('common.retry')" :loading="loading" @click="reload" />
    </section>

    <template v-else>
      <!-- Résumé exécutif -->
      <section class="dg-tiles" :aria-label="t('pages.diagnostic.summaryAria')">
        <article v-for="tile in tiles" :key="tile.label" class="surface-card dg-tile">
          <p class="section-label dg-tile-label">{{ tile.label }}</p>
          <p v-if="loading" class="dg-tile-value"><q-skeleton type="text" width="70%" /></p>
          <p v-else class="dg-tile-value font-mono" :class="{ 'dg-tile-value--cost': tile.accent }">
            {{ tile.value }}
          </p>
          <p class="dg-tile-hint">{{ tile.hint }}</p>
        </article>
      </section>

      <!-- Les actions, dans l'ordre où elles valent la peine -->
      <section class="surface-card dg-section" aria-labelledby="dg-actions-title">
        <header class="dg-section-head">
          <q-icon name="playlist_add_check" size="20px" aria-hidden="true" />
          <h2 id="dg-actions-title">{{ t('pages.diagnostic.actions') }}</h2>
          <span class="dg-count font-mono">{{ report ? `${report.summary.top.length}` : '—' }}</span>
        </header>

        <q-skeleton v-if="loading" height="200px" />
        <p v-else-if="!report?.summary.top.length" class="dg-empty">
          {{ t('pages.diagnostic.noAction') }}
        </p>
        <ol v-else class="dg-actions">
          <li v-for="(a, i) in report.summary.top" :key="a.recommendationId" class="dg-action">
            <span class="dg-action-rank font-mono" aria-hidden="true">{{ i + 1 }}</span>
            <div class="dg-action-body">
              <h3 class="dg-action-title">{{ a.title }}</h3>
              <p class="dg-action-problem">{{ a.problem }}</p>
              <p class="dg-action-do">{{ a.action }}</p>
            </div>
            <span class="dg-action-impact font-mono" :class="`dg-impact--${a.impact.kind}`">
              {{ amount(a.impact) }}
            </span>
          </li>
        </ol>
      </section>

      <!-- Comment vous travaillez : deux quarts du parc, opposés -->
      <section class="surface-card dg-section" aria-labelledby="dg-work-title">
        <header class="dg-section-head">
          <q-icon name="conveyor_belt" size="20px" aria-hidden="true" />
          <h2 id="dg-work-title">{{ t('pages.diagnostic.work') }}</h2>
          <span class="dg-count font-mono">
            {{ behaviour ? t('pages.diagnostic.workSessions', behaviour.sessions) : '—' }}
          </span>
        </header>

        <q-skeleton v-if="loading" height="200px" />
        <template v-else-if="behaviour?.comparable">
          <p class="dg-thresholds-intro">
            <i18n-t keypath="pages.diagnostic.workIntro" scope="global">
              <template #activity>
                <strong>{{ t('pages.diagnostic.workIntroActivity') }}</strong>
              </template>
            </i18n-t>
          </p>
          <div class="dg-table-scroll">
            <table class="dg-table">
              <caption class="sr-only">
                {{
                  t('pages.diagnostic.workCaption')
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('pages.diagnostic.workColumns.gesture') }}</th>
                  <th scope="col" class="dg-num">{{ t('pages.diagnostic.workColumns.bottom') }}</th>
                  <th scope="col" class="dg-num">{{ t('pages.diagnostic.workColumns.top') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in workRows" :key="row.label">
                  <th scope="row" class="dg-row-head">
                    <HelpTip :what="row.what" :reading="row.reading">{{ row.label }}</HelpTip>
                  </th>
                  <td class="dg-num font-mono">{{ row.bottom }}</td>
                  <td class="dg-num font-mono" :class="{ 'dg-num--strong': row.strong }">
                    {{ row.top }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="dg-reading">
            <q-icon name="lightbulb" size="16px" aria-hidden="true" />
            {{ workReading }}
          </p>
        </template>
        <p v-else class="dg-empty">{{ t('pages.diagnostic.workEmpty') }}</p>
      </section>

      <!-- Rythme : la fenêtre de 5 h et les sessions de front -->
      <section class="surface-card dg-section" aria-labelledby="dg-pace-title">
        <header class="dg-section-head">
          <q-icon name="speed" size="20px" aria-hidden="true" />
          <h2 id="dg-pace-title">{{ t('pages.diagnostic.pace') }}</h2>
          <span class="dg-count font-mono">
            {{ pace ? t('pages.diagnostic.paceWindow', { n: pace.windowHours }) : '—' }}
          </span>
        </header>

        <q-skeleton v-if="loading" height="160px" />
        <template v-else-if="pace">
          <div class="dg-pace">
            <article class="dg-pace-card">
              <p class="section-label dg-tile-label">
                <HelpTip :what="t('pages.diagnostic.currentWhat')" :reading="currentReading">
                  {{ t('pages.diagnostic.current') }}
                </HelpTip>
              </p>
              <p class="dg-tile-value font-mono dg-tile-value--cost">
                {{ money(pace.current.cost) }}
              </p>
              <p class="dg-tile-hint">
                {{
                  t('pages.diagnostic.currentHint', {
                    sessions: t('pages.diagnostic.workSessions', pace.current.sessions),
                    rank: currentRankSentence,
                  })
                }}
              </p>
            </article>
            <article class="dg-pace-card">
              <p class="section-label dg-tile-label">
                <HelpTip :what="t('pages.diagnostic.windowsWhat')" :reading="windowsReading">
                  {{ t('pages.diagnostic.windows') }}
                </HelpTip>
              </p>
              <p class="dg-tile-value font-mono">{{ money(pace.windows.quantiles.p50) }}</p>
              <p class="dg-tile-hint">
                {{
                  t('pages.diagnostic.windowsHint', {
                    p90: money(pace.windows.quantiles.p90),
                    peak: money(pace.windows.peak.cost),
                    day: peakDay ? t('pages.diagnostic.windowsPeakDay', { date: peakDay }) : '',
                  })
                }}
              </p>
            </article>
            <article class="dg-pace-card">
              <p class="section-label dg-tile-label">
                <HelpTip :what="t('pages.diagnostic.concurrencyWhat')" :reading="t('pages.diagnostic.concurrencyReading')">
                  {{ t('pages.diagnostic.concurrency') }}
                </HelpTip>
              </p>
              <p class="dg-tile-value font-mono">{{ pace.concurrency.max }}</p>
              <p class="dg-tile-hint">
                {{
                  t('pages.diagnostic.concurrencyHint', {
                    hours: Math.round(pace.concurrency.hoursAtLeast2),
                    share: concurrentShare,
                  })
                }}
              </p>
            </article>
          </div>
          <p class="dg-reading">
            <q-icon name="lightbulb" size="16px" aria-hidden="true" />
            {{ t('pages.diagnostic.paceReading') }}
          </p>
        </template>
      </section>

      <!-- Le détail, règle par règle -->
      <section class="surface-card dg-section" aria-labelledby="dg-recos-title">
        <header class="dg-section-head">
          <q-icon name="rule" size="20px" aria-hidden="true" />
          <h2 id="dg-recos-title">{{ t('pages.diagnostic.detail') }}</h2>
          <span class="dg-count font-mono">
            {{ report ? t('pages.diagnostic.rulesCount', { n: report.recommendations.length }) : '—' }}
          </span>
        </header>

        <q-skeleton v-if="loading" height="240px" />
        <p v-else-if="!report?.recommendations.length" class="dg-empty">
          {{ t('pages.diagnostic.nothing') }}
        </p>
        <q-list v-else separator class="dg-recos">
          <q-expansion-item v-for="r in recommendations" :key="r.id" :label="r.title" header-class="dg-reco-head">
            <template #header>
              <q-item-section avatar class="dg-reco-avatar">
                <q-icon
                  :name="severityIcon(r.severity)"
                  :style="{ color: severityColor(r.severity) }"
                  size="20px"
                  :aria-label="severityLabel(r.severity)"
                />
              </q-item-section>
              <q-item-section>
                <span class="dg-reco-title">{{ r.title }}</span>
                <span class="dg-reco-meta font-mono">
                  {{ t('pages.diagnostic.affected', r.affected) }}
                  <template v-if="!r.calibrated">{{ t('pages.diagnostic.uncalibratedTag') }}</template>
                </span>
              </q-item-section>
              <q-item-section side>
                <span class="dg-reco-impact font-mono" :class="`dg-impact--${r.impact.kind}`">
                  {{ amount(r.impact) }}
                </span>
              </q-item-section>
            </template>

            <div class="dg-reco-body">
              <p class="dg-reco-text">{{ r.body }}</p>

              <p class="dg-reco-action">
                <q-icon name="arrow_forward" size="16px" aria-hidden="true" />
                {{ r.action }}
              </p>

              <!-- La provenance du chiffre : sans elle, un montant n'est qu'une
                   assertion. Elle dit aussi lequel est exact et lequel est estimé. -->
              <p class="dg-reco-basis">
                <q-icon :name="r.impact.kind === 'measured' ? 'straighten' : 'blur_on'" size="14px" aria-hidden="true" />
                {{ r.impact.kind === 'measured' ? t('pages.diagnostic.measured') : t('pages.diagnostic.estimated') }}
                —
                {{ r.impact.basis }}
              </p>

              <p v-if="!r.calibrated" class="dg-reco-warn">
                <q-icon name="info" size="14px" aria-hidden="true" />
                {{ t('pages.diagnostic.uncalibratedWarn') }}
              </p>

              <!-- Le drill-down : c'est tout l'intérêt d'avoir ça dans AURA plutôt
                   que dans un rapport statique. -->
              <template v-if="r.targets.length && r.scopeIsSession">
                <p class="section-label dg-targets-label">{{ t('pages.diagnostic.heaviest') }}</p>
                <ul class="dg-targets">
                  <li v-for="t in r.targets" :key="t.id">
                    <router-link class="dg-target" :to="{ name: 'session', params: { slug: t.project, id: t.id } }">
                      <span class="dg-target-dot" :style="{ background: severityColor(t.severity) }" aria-hidden="true" />
                      <span class="dg-target-label font-mono">{{ t.label }}</span>
                      <span class="dg-target-project">{{ projectName(t.project) }}</span>
                      <span class="dg-target-value font-mono">{{ targetAmount(t) }}</span>
                      <q-icon name="chevron_right" size="16px" aria-hidden="true" />
                    </router-link>
                  </li>
                </ul>
              </template>
            </div>
          </q-expansion-item>
        </q-list>
      </section>

      <!-- Les seuils, à découvert -->
      <section class="surface-card dg-section" aria-labelledby="dg-thresholds-title">
        <header class="dg-section-head">
          <q-icon name="tune" size="20px" aria-hidden="true" />
          <h2 id="dg-thresholds-title">{{ t('pages.diagnostic.thresholds') }}</h2>
          <span class="dg-count font-mono">
            {{ report ? (report.thresholds.reliable ? t('pages.diagnostic.thresholdsCalibrated') : t('pages.diagnostic.thresholdsPartial')) : '—' }}
          </span>
        </header>

        <q-skeleton v-if="loading" height="180px" />
        <template v-else-if="report">
          <p class="dg-thresholds-intro">
            <i18n-t keypath="pages.diagnostic.thresholdsIntro" scope="global">
              <template #formula>
                <strong>{{ t('pages.diagnostic.thresholdsFormula') }}</strong>
              </template>
            </i18n-t>
          </p>
          <div class="dg-table-scroll">
            <table class="dg-table">
              <caption class="sr-only">
                {{
                  t('pages.diagnostic.thresholdsCaption')
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('pages.diagnostic.thresholdColumns.signal') }}</th>
                  <th scope="col" class="dg-num">
                    {{ t('pages.diagnostic.thresholdColumns.sessions') }}
                  </th>
                  <th scope="col" class="dg-num">
                    {{ t('pages.diagnostic.thresholdColumns.median') }}
                  </th>
                  <th scope="col" class="dg-num">
                    {{ t('pages.diagnostic.thresholdColumns.threshold') }}
                  </th>
                  <th scope="col">{{ t('pages.diagnostic.thresholdColumns.decidedBy') }}</th>
                  <th scope="col" class="dg-num">
                    {{ t('pages.diagnostic.thresholdColumns.hits') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in calibrations" :key="c.metric">
                  <th scope="row" class="dg-row-head">
                    <HelpTip :what="c.help" :reading="readThreshold(c)">{{ c.label }}</HelpTip>
                  </th>
                  <td class="dg-num font-mono">{{ c.sampleSize }}</td>
                  <td class="dg-num font-mono">{{ unitValue(c.quantiles.p50, c.unit) }}</td>
                  <td class="dg-num font-mono">{{ unitValue(c.value, c.unit) }}</td>
                  <!-- Le percentile se relit dans les deux colonnes voisines ; le
                       garde-fou, lui, ne se déduit d'aucun chiffre affiché. C'est
                       donc là que sa provenance doit être disponible. -->
                  <td class="dg-bound">
                    <HelpTip :what="boundWhat(c)" :reading="c.guardBasis">
                      <span v-if="!c.calibrated" class="dg-bound-weak">
                        {{ t('pages.diagnostic.boundWeak') }}
                      </span>
                      <span v-else-if="c.bound === 'guard'">{{ t('pages.diagnostic.boundGuard') }}</span>
                      <span v-else>{{ t('pages.diagnostic.boundPark') }}</span>
                    </HelpTip>
                  </td>
                  <td class="dg-num font-mono">{{ c.hits }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Un garde-fou vieillit : il a été posé face à une distribution, et la
               distribution bouge. Sans cette ligne, personne ne sait si le plancher
               a été pesé hier ou hérité d'un corpus dix fois plus petit. -->
          <p class="dg-reviewed">
            <q-icon name="history" size="14px" aria-hidden="true" />
            <span>
              <i18n-t keypath="pages.diagnostic.reviewed" scope="global">
                <template #date>{{ reviewedOn }}</template>
                <template #sessions>{{ report.thresholds.sessions }}</template>
                <template #link>
                  <router-link :to="{ name: 'help', query: { s: 'diagnostic' } }">
                    {{ t('pages.diagnostic.reviewedLink') }}
                  </router-link>
                </template>
              </i18n-t>
            </span>
          </p>
        </template>
      </section>

      <!-- Ce que ce rapport ne sait pas. Toujours rendu. -->
      <section v-if="report?.summary.caveats.length" class="surface-card dg-section dg-caveats" aria-labelledby="dg-caveats-title">
        <header class="dg-section-head">
          <q-icon name="info" size="20px" aria-hidden="true" />
          <h2 id="dg-caveats-title">{{ t('pages.diagnostic.caveats') }}</h2>
        </header>
        <ul class="dg-caveat-list">
          <li v-for="c in report.summary.caveats" :key="c">{{ c }}</li>
        </ul>
      </section>
    </template>
  </q-page>
</template>

<script setup lang="ts">
  import HelpTip from '@/components/ui/HelpTip.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import { getDiagnostics, type Calibration, type DiagnosticReport, type Impact, type Recommendation, type Target } from '@/services/diagnostics'
  import { severityIcon, severityColor, severityLabel } from '@/services/diagnostics/severity'
  import { resolveRange, type RangeKey } from '@/services/usage'
  import { fmtDateLong, fmtDateShort, fmtDecimal, fmtMoney, fmtNum, fmtPercent } from '@/utils/format'
  import { computed, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()

  const range = ref<RangeKey>('30d')
  // Mêmes périodes que la page Usage, et donc les mêmes libellés.
  const rangeOptions = computed(() => [
    { label: t('pages.usage.ranges.d7'), value: '7d' as const },
    { label: t('pages.usage.ranges.d30'), value: '30d' as const },
    { label: t('pages.usage.ranges.d90'), value: '90d' as const },
    { label: t('pages.usage.ranges.all'), value: 'all' as const },
  ])

  const report = ref<DiagnosticReport | null>(null)
  const loading = ref(true)
  const error = ref('')

  // ── Formatage ────────────────────────────────────────────────────────────────

  const money = fmtMoney

  /**
   * Le chiffre d'un impact.
   *
   * Un montant prime sur des tokens quand les deux existent : le dollar est exact
   * et comparable, le token est une estimation. Le `~` est porté par la classe
   * d'estimation, pas par la chaîne, pour qu'il ne se retrouve pas dans un tri.
   */
  function amount(impact: Impact): string {
    if (impact.usd !== undefined) return money(impact.usd)
    if (impact.tokens !== undefined) return `~${fmtNum(impact.tokens)} tok`
    return '—'
  }

  function targetAmount(t: Target): string {
    if (t.usd !== undefined) return money(t.usd)
    if (t.tokens !== undefined) return `~${fmtNum(t.tokens)} tok`
    return ''
  }

  function unitValue(v: number, unit: Calibration['unit']): string {
    if (unit === 'usd') return money(v)
    if (unit === 'ratio') return fmtPercent(v)
    if (unit === 'tokens') return fmtNum(v)
    // Un rapport garde sa décimale : « 2 explorations par modification » perd
    // exactement ce qui distingue 1,5 de 2,4.
    if (unit === 'rate') return fmtDecimal(v)
    return String(Math.round(v))
  }

  /** `-Users-dev-Documents-projets-aura` → `aura`. Comme sur la page Usage. */
  function projectName(slug: string): string {
    const parts = slug.split('-').filter(Boolean)
    return parts[parts.length - 1] ?? slug
  }

  // ── Données dérivées ─────────────────────────────────────────────────────────

  const tiles = computed(() => {
    const s = report.value?.summary
    const critical = report.value?.findings.filter((f) => f.severity === 'critical').length ?? 0
    return [
      {
        label: t('pages.diagnostic.tiles.cost'),
        value: s ? money(s.cost) : '—',
        hint: t('pages.diagnostic.tiles.costHint'),
        accent: true,
      },
      {
        label: t('pages.diagnostic.tiles.sessions'),
        value: s ? String(s.sessions) : '—',
        hint: t('pages.diagnostic.tiles.sessionsHint'),
      },
      {
        label: t('pages.diagnostic.tiles.findings'),
        value: s ? String(s.findings) : '—',
        hint: t('pages.diagnostic.tiles.findingsHint'),
      },
      {
        label: t('pages.diagnostic.tiles.critical'),
        value: s ? String(critical) : '—',
        hint: t('pages.diagnostic.tiles.criticalHint'),
      },
    ]
  })

  /**
   * Les recommandations, chacune sachant si ses cibles sont des sessions.
   *
   * Une règle de parc (`socle-gaspille`) désigne le corpus entier : ses « cibles »
   * n'ouvrent aucune session, et un lien mort vaut moins que pas de lien.
   */
  const recommendations = computed<(Recommendation & { scopeIsSession: boolean })[]>(() =>
    (report.value?.recommendations ?? []).map((r) => ({
      ...r,
      scopeIsSession: r.targets.every((t) => t.id !== '' && t.project !== ''),
    })),
  )

  // ── Comment vous travaillez ──────────────────────────────────────────────────

  const behaviour = computed(() => report.value?.behaviour ?? null)
  const pace = computed(() => report.value?.pace ?? null)

  function one(n: number): string {
    return fmtDecimal(n)
  }

  /**
   * Les quatre gestes, du quart du bas au quart du haut.
   *
   * `strong` marque les deux colonnes qui renversent l'intuition : les sessions
   * les plus productives font *plus* de tours par prompt, pas moins. C'est la
   * lecture qu'on veut voir sauter aux yeux, parce que c'est celle qu'on n'attend
   * pas — et une règle écrite à l'instinct aurait conseillé l'inverse.
   */
  const workRows = computed(() => {
    const b = behaviour.value
    if (!b) return []
    return [
      {
        label: t('pages.diagnostic.rows.editsPerHour'),
        what: t('pages.diagnostic.rows.editsPerHourWhat'),
        reading: t('pages.diagnostic.rows.editsPerHourReading'),
        bottom: one(b.editsPerHour.bottom),
        top: one(b.editsPerHour.top),
        strong: false,
      },
      {
        label: t('pages.diagnostic.rows.explorationRatio'),
        what: t('pages.diagnostic.rows.explorationRatioWhat'),
        reading: workReadingFor('explorationRatio'),
        bottom: one(b.explorationRatio.bottom),
        top: one(b.explorationRatio.top),
        strong: true,
      },
      {
        label: t('pages.diagnostic.rows.turnsPerPrompt'),
        what: t('pages.diagnostic.rows.turnsPerPromptWhat'),
        reading: workReadingFor('turnsPerPrompt'),
        bottom: one(b.turnsPerPrompt.bottom),
        top: one(b.turnsPerPrompt.top),
        strong: true,
      },
      {
        label: t('pages.diagnostic.rows.interrupted'),
        what: t('pages.diagnostic.rows.interruptedWhat'),
        bottom: fmtPercent(b.interruptedShare.bottom),
        top: fmtPercent(b.interruptedShare.top),
        strong: false,
      },
    ]
  })

  /**
   * La lecture d'un geste, dans le sens où *votre* parc la donne.
   *
   * Écrite à partir de la comparaison plutôt qu'en dur : là où on l'a mesuré, les
   * gestes marqués `strong` renversent l'intuition, mais rien ne garantit qu'ils
   * la renversent partout — une phrase figée finirait par mentir.
   */
  function workReadingFor(key: 'explorationRatio' | 'turnsPerPrompt'): string {
    const b = behaviour.value
    if (!b?.comparable) return ''
    const { top, bottom } = b[key]
    if (Math.abs(top - bottom) < 0.05) return t('pages.diagnostic.readings.same')
    const more = top > bottom
    if (key === 'explorationRatio') {
      return more ? t('pages.diagnostic.readings.exploreMore') : t('pages.diagnostic.readings.exploreLess')
    }
    return more ? t('pages.diagnostic.readings.turnsMore') : t('pages.diagnostic.readings.turnsLess')
  }

  /** La phrase qui dit ce que le tableau montre — construite sur vos chiffres. */
  const workReading = computed(() => {
    const b = behaviour.value
    if (!b?.comparable) return ''
    const parts: string[] = []
    if (b.explorationRatio.bottom > b.explorationRatio.top) {
      parts.push(
        t('pages.diagnostic.workReading.explore', {
          top: one(b.explorationRatio.top),
          bottom: one(b.explorationRatio.bottom),
        }),
      )
    }
    if (b.turnsPerPrompt.top > b.turnsPerPrompt.bottom) {
      parts.push(
        t('pages.diagnostic.workReading.turns', {
          top: one(b.turnsPerPrompt.top),
          bottom: one(b.turnsPerPrompt.bottom),
        }),
      )
    }
    if (!parts.length) return t('pages.diagnostic.workReading.none')
    return t('pages.diagnostic.workReading.prefix', { parts: parts.join(' ; ') })
  })

  // ── Rythme ───────────────────────────────────────────────────────────────────

  const currentRankSentence = computed(() => {
    const p = pace.value
    if (!p) return ''
    if (p.current.cost <= 0) return t('pages.diagnostic.currentRank.none')
    const rank = Math.round(p.current.rank * 100)
    if (rank >= 90) return t('pages.diagnostic.currentRank.busier', { pct: rank })
    if (rank <= 25) return t('pages.diagnostic.currentRank.calmer', { pct: 100 - rank })
    return t('pages.diagnostic.currentRank.above', { pct: rank })
  })

  /** Ce que vaut la fenêtre courante face au seuil, dit en clair. */
  const currentReading = computed(() => {
    const p = pace.value
    if (!p) return ''
    if (p.current.cost <= 0) return t('pages.diagnostic.currentReading.none')
    const threshold = money(p.windows.threshold)
    if (!p.windows.calibrated) return t('pages.diagnostic.currentReading.fallback', { threshold })
    return p.current.cost > p.windows.threshold
      ? t('pages.diagnostic.currentReading.over', { threshold })
      : t('pages.diagnostic.currentReading.under', { threshold })
  })

  /** Pourquoi la médiane des fenêtres est si loin du pic. */
  const windowsReading = computed(() => {
    const w = pace.value?.windows
    if (!w) return ''
    return t('pages.diagnostic.windowsReading', { n: fmtNum(w.samples) })
  })

  const peakDay = computed(() => {
    const at = pace.value?.windows.peak.at
    if (!at) return ''
    const d = new Date(at)
    return Number.isNaN(d.getTime()) ? '' : fmtDateShort(d.getTime())
  })

  const concurrentShare = computed(() => {
    const c = pace.value?.concurrency
    if (!c || c.activeHours <= 0) return fmtPercent(0)
    return fmtPercent(c.hoursAtLeast2 / c.activeHours)
  })

  // ── Les seuils ───────────────────────────────────────────────────────────────

  /**
   * Ce que « décidé par » veut dire, avant d'en venir à la provenance du plancher.
   *
   * La formule est dans l'intro de la section ; ici on dit seulement laquelle de
   * ses deux moitiés a gagné sur cette ligne, et ce que cela coûte en cas.
   */
  function boundWhat(c: Calibration): string {
    const rank = `P${Math.round(c.rank * 100)}`
    const guard = unitValue(c.guard, c.unit)
    const p = c.percentile === null ? null : unitValue(c.percentile, c.unit)
    const which = t(c.direction === 'high' ? 'pages.diagnostic.bound.whichHigh' : 'pages.diagnostic.bound.whichLow')

    if (!c.calibrated) return t('pages.diagnostic.bound.uncal', { n: c.sampleSize, guard })
    // Ce que pèsent les cas — la contrepartie de la bande tue, et la seule façon
    // de juger si le plancher est au bon endroit.
    const weight =
      c.hits === 0
        ? t('pages.diagnostic.bound.weightNone')
        : t('pages.diagnostic.bound.weight', {
            n: c.hits,
            cost: c.hitsCost !== null ? t('pages.diagnostic.bound.weightCost', { cost: money(c.hitsCost) }) : '',
          })

    if (c.bound === 'guard') {
      const s = c.silenced
      const silenced = s
        ? t(
            'pages.diagnostic.bound.silenced',
            {
              n: s.sessions,
              cost: s.cost !== null ? t('pages.diagnostic.bound.silencedCost', { cost: money(s.cost) }) : '',
            },
            s.sessions,
          )
        : ''
      // Le prix réel du plancher : une session tue mais signalée ailleurs n'est pas
      // perdue, elle est dédoublonnée. Sans cette distinction, la bande fait peur
      // pour rien.
      const orphans = s?.orphans
        ? s.orphans.sessions === 0
          ? t('pages.diagnostic.bound.orphansNone')
          : t('pages.diagnostic.bound.orphans', {
              n: s.orphans.sessions,
              cost: money(s.orphans.cost),
            })
        : ''
      return t('pages.diagnostic.bound.guardLine', {
        rank,
        p: p ?? '',
        guard,
        which,
        silenced,
        weight,
        orphans,
      })
    }
    const verdict = t(p === guard ? 'pages.diagnostic.bound.verdictSame' : 'pages.diagnostic.bound.verdictPassed')
    return t('pages.diagnostic.bound.parkLine', { rank, p: p ?? '', guard, which, verdict, weight })
  }

  /**
   * Comment se lit *ce* seuil-là, avec les chiffres de la ligne.
   *
   * La phrase d'intro dit la formule ; celle-ci dit laquelle de ses deux moitiés a
   * parlé, et ce que le nombre de cas signifie du coup. Un seuil au percentile
   * désigne toujours un décile — ce n'est pas une anomalie détectée, c'est un tri —
   * là où un seuil au garde-fou dit que le parc est sain.
   */
  function readThreshold(c: Calibration): string {
    function u(v: number) {
      return unitValue(v, c.unit)
    }
    const value = u(c.value)
    const rank = c.direction === 'high' ? 'P90' : 'P10'
    const side = t(c.direction === 'high' ? 'pages.diagnostic.read.sideHigh' : 'pages.diagnostic.read.sideLow')
    const sense = c.direction === 'high' ? '' : t('pages.diagnostic.read.senseLow')
    // La distribution d'où le percentile est tiré : quatre repères valent mieux
    // qu'un rang énoncé, parce qu'ils montrent s'il est isolé ou dans la foule.
    const dist = t('pages.diagnostic.read.dist', {
      p50: u(c.quantiles.p50),
      p75: u(c.quantiles.p75),
      p90: u(c.quantiles.p90),
      max: u(c.quantiles.max),
      n: c.sampleSize,
    })

    if (!c.calibrated) {
      return t('pages.diagnostic.read.uncal', { n: c.sampleSize, value }, c.sampleSize) + sense + dist
    }
    if (c.bound === 'percentile') {
      return t('pages.diagnostic.read.percentile', { rank, n: c.sampleSize, side, value, hits: c.hits }) + sense + dist
    }
    const p = c.percentile === null ? null : u(c.percentile)
    const silenced = c.silenced
      ? t('pages.diagnostic.read.guardSilenced', {
          n: c.silenced.sessions,
          cost: c.silenced.cost !== null ? t('pages.diagnostic.read.guardSilencedCost', { cost: money(c.silenced.cost) }) : '',
        })
      : ''
    return (
      t('pages.diagnostic.read.guard', {
        rank,
        p: p ? t('pages.diagnostic.read.guardP', { p }) : '',
        value,
        silenced,
      }) +
      sense +
      dist
    )
  }

  const reviewedOn = computed(() => {
    const raw = report.value?.thresholds.reviewed.on
    if (!raw) return ''
    const d = new Date(`${raw}T00:00:00`)
    return Number.isNaN(d.getTime()) ? raw : fmtDateLong(d.getTime())
  })

  const calibrations = computed<Calibration[]>(() => {
    const m = report.value?.thresholds.metrics
    if (!m) return []
    // Les signaux qui ont désigné quelqu'un d'abord : ce sont eux qu'on relit.
    return Object.values(m).sort((a, b) => b.hits - a.hits || a.label.localeCompare(b.label))
  })

  // ── Chargement ───────────────────────────────────────────────────────────────

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const { from, to } = resolveRange(range.value)
      report.value = await getDiagnostics(from, to)
    } catch (e) {
      error.value = e instanceof Error ? e.message : t('pages.diagnostic.unknownError')
      report.value = null
    } finally {
      loading.value = false
    }
  }

  async function reload(): Promise<void> {
    await load()
  }

  onMounted(load)
  watch(range, load)
</script>

<style scoped lang="scss">
  .dg {
    padding: var(--space-lg);
    max-width: var(--page-max);
    margin: 0 auto;
  }

  .dg-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
    flex-wrap: wrap;
  }
  .dg-head-icon {
    color: var(--brand);
  }
  .dg-sub {
    color: var(--dim);
    font-size: var(--fs-xs);
    margin: 0;
    flex: 1 1 auto;
  }
  .dg-range {
    flex: 0 0 auto;
  }

  .dg-state {
    text-align: center;
    padding: var(--space-xl);
  }
  .dg-state-msg {
    color: var(--muted);
    margin: var(--space-xs) 0 var(--space-md);
  }

  .dg-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }
  .dg-tile {
    padding: var(--space-md);
  }
  .dg-tile-label {
    color: var(--dim);
    margin: 0 0 var(--space-xs);
  }
  .dg-tile-value {
    font-size: var(--fs-lg);
    color: var(--text);
    margin: 0;
  }
  .dg-tile-value--cost {
    color: var(--brand);
  }
  .dg-tile-hint {
    color: var(--faint);
    font-size: var(--fs-xs);
    margin: var(--space-xs) 0 0;
  }

  .dg-section {
    padding: var(--space-md);
    margin-bottom: var(--space-md);
  }
  .dg-section-head {
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
  .dg-count {
    color: var(--dim);
    font-size: var(--fs-xs);
  }
  .dg-empty {
    color: var(--muted);
    text-align: center;
    padding: var(--space-xl) 0;
    margin: 0;
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  .dg-actions {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    counter-reset: none;
  }
  // Le rang et le montant sont plus gros que le titre : alignés en haut de leur
  // case, leur demi-interligne plus court les fait flotter au-dessus de la ligne
  // qu'ils qualifient. La baseline, elle, ne dépend pas de la taille de police.
  .dg-action {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-md);
    align-items: baseline;
    padding-bottom: var(--space-md);
    border-bottom: 1px solid var(--line);

    &:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
  }
  .dg-action-rank {
    color: var(--faint);
    font-size: var(--fs-lg);
    line-height: 1.1;
    min-width: 1.2em;
  }
  .dg-action-title {
    font-size: var(--fs-md);
    margin: 0 0 var(--space-xs);
    color: var(--text);
  }
  .dg-action-problem {
    color: var(--muted);
    font-size: var(--fs-sm);
    margin: 0 0 var(--space-xs);
  }
  .dg-action-do {
    color: var(--dim);
    font-size: var(--fs-sm);
    margin: 0;
  }
  .dg-action-impact {
    color: var(--brand);
    font-size: var(--fs-md);
    white-space: nowrap;
  }
  .dg-impact--estimated {
    color: var(--muted);
  }

  // ── Recommandations ──────────────────────────────────────────────────────────

  .dg-recos {
    margin: 0 calc(-1 * var(--space-md));
  }
  .dg-reco-avatar {
    min-width: 36px;
  }
  .dg-reco-title {
    color: var(--text);
    font-size: var(--fs-sm);
  }
  .dg-reco-meta {
    color: var(--dim);
    font-size: var(--fs-xs);
  }
  .dg-reco-impact {
    color: var(--brand);
    font-size: var(--fs-sm);
    white-space: nowrap;
  }
  .dg-reco-body {
    padding: 0 var(--space-md) var(--space-md) calc(var(--space-md) + 36px);
  }
  .dg-reco-text {
    color: var(--muted);
    font-size: var(--fs-sm);
    margin: 0 0 var(--space-sm);
    white-space: pre-line;
  }
  /**
 * Une icône en tête de paragraphe.
 *
 * `align-items: baseline` ne cadre pas un `q-icon` : Quasar le rend en
 * `inline-flex`, dont la baseline est celle de sa boîte, pas celle du glyphe —
 * l'icône flotte alors au-dessus du texte. On lui donne plutôt la hauteur d'une
 * ligne : son `align-items: center` interne la centre alors exactement sur la
 * première ligne, quelle que soit la taille de police du paragraphe.
 */
  .dg-reco-action,
  .dg-reco-basis,
  .dg-reco-warn {
    margin: 0 0 var(--space-sm);
    display: flex;
    gap: var(--space-xs);
    align-items: flex-start;

    > .q-icon {
      flex: 0 0 auto;
      height: 1.5em;
    }
  }
  .dg-reco-action {
    color: var(--text);
    font-size: var(--fs-sm);
  }
  .dg-reco-basis,
  .dg-reco-warn {
    color: var(--faint);
    font-size: var(--fs-xs);
  }
  .dg-reco-warn {
    color: var(--warn);
  }

  .dg-targets-label {
    color: var(--dim);
    margin: var(--space-md) 0 var(--space-xs);
  }
  .dg-targets {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .dg-target {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    color: var(--muted);
    text-decoration: none;
    font-size: var(--fs-sm);

    &:hover,
    &:focus-visible {
      background: var(--surface-2);
      color: var(--text);
    }
  }
  .dg-target-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .dg-target-label {
    flex: 0 0 auto;
  }
  .dg-target-project {
    color: var(--faint);
    font-size: var(--fs-xs);
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dg-target-value {
    color: var(--muted);
    flex: 0 0 auto;
  }

  // ── Seuils ───────────────────────────────────────────────────────────────────

  .dg-thresholds-intro {
    color: var(--muted);
    font-size: var(--fs-sm);
    margin: 0 0 var(--space-md);
  }
  // Une table large ne doit jamais faire défiler la page : elle défile chez elle.
  .dg-table-scroll {
    overflow-x: auto;
  }
  .dg-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);

    th,
    td {
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--line);
      text-align: left;
      white-space: nowrap;
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
  .dg-row-head {
    font-weight: 400;
    color: var(--text);
  }
  .dg-num {
    text-align: right;
  }
  // La colonne qui renverse l'intuition : elle mérite d'être lue en premier.
  .dg-num--strong {
    color: var(--brand);
  }

  // ── Comment vous travaillez · Rythme ─────────────────────────────────────────

  .dg-reading {
    display: flex;
    gap: var(--space-xs);
    align-items: flex-start;
    color: var(--muted);
    font-size: var(--fs-sm);
    line-height: 1.55;
    margin: var(--space-md) 0 0;

    > .q-icon {
      flex: 0 0 auto;
      height: 1.5em;
      color: var(--brand);
    }
  }
  .dg-pace {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-md);
  }
  .dg-pace-card {
    padding: var(--space-md);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .dg-bound {
    color: var(--muted);
    font-size: var(--fs-xs);
  }
  .dg-bound-weak {
    color: var(--warn);
  }
  .dg-reviewed {
    display: flex;
    gap: var(--space-xs);
    align-items: flex-start;
    color: var(--faint);
    font-size: var(--fs-xs);
    line-height: 1.5;
    margin: var(--space-md) 0 0;

    > .q-icon {
      flex: 0 0 auto;
      height: 1.5em;
    }
    a {
      color: var(--brand);
    }
  }

  // ── Avertissements ───────────────────────────────────────────────────────────

  .dg-caveat-list {
    margin: 0;
    padding-left: var(--space-lg);
    color: var(--muted);
    font-size: var(--fs-sm);

    li + li {
      margin-top: var(--space-xs);
    }
  }
</style>
