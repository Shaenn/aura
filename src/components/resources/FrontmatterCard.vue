<template>
  <section class="fm surface-card" :aria-labelledby="titleId">
    <header class="fm-head">
      <q-icon :name="icon" size="16px" aria-hidden="true" />
      <h2 :id="titleId" class="fm-name">{{ displayName }}</h2>
      <span class="fm-badge font-mono">frontmatter</span>
    </header>

    <p v-if="description" class="fm-desc">{{ description }}</p>
    <p v-else class="fm-desc fm-desc--absent">{{ noDescription }}</p>

    <!-- Keys the file actually sets -->
    <dl v-if="defined.length" class="fm-grid">
      <div v-for="e in defined" :key="e.key" class="fm-row">
        <dt class="fm-key font-mono" :class="{ 'fm-key--doc': keyInfo(e.spec) }">
          {{ e.key }}
          <q-tooltip v-if="keyInfo(e.spec)" anchor="top start" self="bottom start" max-width="320px">
            {{ keyInfo(e.spec) }}
          </q-tooltip>
        </dt>
        <dd class="fm-val">
          <!-- Nested YAML we don't model (hooks, inline mcpServers): verbatim -->
          <pre v-if="e.raw" class="fm-block font-mono">{{ e.raw }}</pre>

          <!-- Booleans: the literal value, with an on/off reading -->
          <span v-else-if="e.spec.kind === 'bool'" class="fm-bool" :class="e.value === 'true' ? 'fm-bool--on' : 'fm-bool--off'">
            <q-icon :name="e.value === 'true' ? 'check' : 'close'" size="12px" aria-hidden="true" />
            {{ e.value }}
          </span>

          <!-- Tools: one chip per token, each explained -->
          <template v-else-if="e.spec.kind === 'tools'">
            <span v-for="t in entryTokens(e)" :key="t" class="fm-chip font-mono">
              {{ t }}
              <q-tooltip anchor="top middle" self="bottom middle" max-width="300px">
                {{ describeToolToken(t) }}
              </q-tooltip>
            </span>
          </template>

          <!-- Globs: one per line, wildcards highlighted -->
          <ul v-else-if="e.spec.kind === 'globs'" class="fm-globs">
            <li v-for="(g, i) in entryTokens(e)" :key="i">
              <code class="fm-glob">
                <span v-for="(t, ti) in globTokens(g)" :key="ti" :class="{ 'fm-wild': t.wild }">{{ t.text }}</span>
              </code>
            </li>
          </ul>

          <template v-else-if="e.spec.kind === 'list'">
            <span v-for="(v, i) in entryTokens(e)" :key="i" class="fm-chip font-mono">{{ v }}</span>
          </template>

          <!-- text / enum: the scalar as written -->
          <span v-else class="fm-scalar" :class="{ 'font-mono': e.spec.kind === 'enum' }">
            {{ e.value }}
          </span>

          <span v-if="documented && !isKnownKey(keys, e.key)" class="fm-flag fm-flag--warn">
            <q-icon name="warning" size="13px" aria-hidden="true" />
            {{ t('frontmatter.ignored') }}
            <q-tooltip anchor="top middle" self="bottom middle" max-width="300px">
              {{ keyInfo(e.spec) }}
            </q-tooltip>
          </span>
        </dd>
      </div>
    </dl>

    <!-- Keys the file omits: show the value Claude Code will assume -->
    <div v-if="omitted.length" class="fm-defaults">
      <button type="button" class="fm-defaults-toggle" :aria-expanded="showDefaults" @click="showDefaults = !showDefaults">
        <q-icon :name="showDefaults ? 'expand_more' : 'chevron_right'" size="16px" aria-hidden="true" />
        {{ t('frontmatter.undefinedKeys', omitted.length) }}
        <span class="fm-defaults-note">{{ t('frontmatter.defaultsNote') }}</span>
        <span v-if="missingRequired.length" class="fm-flag fm-flag--danger">
          <q-icon name="error_outline" size="13px" aria-hidden="true" />
          {{ t('frontmatter.requiredCount', missingRequired.length) }}
        </span>
      </button>
      <dl v-if="showDefaults" class="fm-grid fm-grid--muted">
        <div v-for="s in omitted" :key="s.key" class="fm-row">
          <dt class="fm-key font-mono">
            {{ s.key }}
            <q-tooltip anchor="top start" self="bottom start" max-width="320px">{{ keyInfo(s) }}</q-tooltip>
          </dt>
          <dd class="fm-val" :class="s.required ? 'fm-required' : 'fm-fallback'">
            {{ keyFallback(s) }}
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
  // Presents a resource's frontmatter as a reference card: every key the file sets,
  // rendered according to its type, and — behind a disclosure — every key it omits
  // with the value Claude Code will assume. Read-only by design: skills and agents
  // are written by Claude, and these pages are where a human checks what they declare.
  // The `keys` prop decides the vocabulary (SKILL_KEYS vs AGENT_KEYS), so a skill key
  // used in an agent (or the reverse) surfaces as "ignorée".
  // Pass an empty `keys` for a resource type Claude Code documents no vocabulary for:
  // the card then shows each key as written and passes no judgement — no tooltip, no
  // "ignorée" flag, no defaults disclosure. Silence beats inventing a reference.
  import { entryTokens, isKnownKey, keyFallback, keyInfo, keySpec, type FmEntry, type KeySpec } from '@/utils/resourceFrontmatter'
  import { describeToolToken } from '@/utils/tools'
  import { computed, ref, useId } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()

  const props = defineProps<{
    entries: FmEntry[]
    /** The vocabulary this resource type understands; empty when there is none. */
    keys: KeySpec[]
    /** File or folder name, used when the frontmatter sets no `name`. */
    fallbackName: string
    icon: string
    /** Shown in place of the description when the file has none. */
    noDescription: string
  }>()

  // Un identifiant par instance plutôt qu'un `fm-title` en dur : deux cartes
  // montées ensemble se disputaient le même `aria-labelledby`, et un lecteur
  // d'écran annonçait la seconde du nom de la première.
  const titleId = useId()

  const showDefaults = ref(false)

  /** With no vocabulary there is nothing to compare against, hence nothing to flag. */
  const documented = computed(() => props.keys.length > 0)

  const byKey = (k: string): FmEntry | undefined => props.entries.find((e) => e.key === k)
  const displayName = computed(() => byKey('name')?.value || props.fallbackName)
  const description = computed(() => byKey('description')?.value ?? '')

  /** A key we can render but not explain: shape read off the value, no `info`. */
  const neutralSpec = (e: FmEntry): KeySpec => ({
    key: e.key,
    kind: e.list.length ? 'list' : 'text',
    ns: null,
  })

  /** Every entry except the two already rendered as the card's header. */
  const defined = computed(() =>
    props.entries
      .filter((e) => e.key !== 'name' && e.key !== 'description')
      .map((e) => ({ ...e, spec: documented.value ? keySpec(props.keys, e.key) : neutralSpec(e) })),
  )

  /** Documented keys the file leaves out, so we can show their implicit value. */
  const omitted = computed<KeySpec[]>(() => props.keys.filter((s) => !props.entries.some((e) => e.key === s.key)))
  const missingRequired = computed(() => omitted.value.filter((s) => s.required))

  interface GlobToken {
    text: string
    wild: boolean
  }
  function globTokens(pattern: string): GlobToken[] {
    return pattern
      .split(/(\*\*|\*|\?)/g)
      .filter((s) => s !== '')
      .map((t) => ({ text: t, wild: t === '**' || t === '*' || t === '?' }))
  }
</script>

<style scoped lang="scss">
  .fm {
    padding: var(--space-lg);
  }
  .fm-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .fm-head .q-icon {
    color: var(--brand);
  }
  /* Quasar's typography.sass styles bare h1–h6: h2 carries a 3.75rem line-height
   and a negative letter-spacing. Reset both, or the title towers over its row. */
  .fm-name {
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: normal;
    margin: 0;
  }
  .fm-badge {
    margin-left: auto;
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--dim);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    padding: 1px 6px;
  }
  .fm-desc {
    margin: var(--space-sm) 0 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    line-height: 1.55;
  }
  .fm-desc--absent {
    color: var(--dim);
    font-style: italic;
  }

  .fm-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin: var(--space-md) 0 0;
  }
  .fm-row {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: var(--space-md);
    align-items: baseline;
  }
  @media (max-width: 720px) {
    .fm-row {
      grid-template-columns: 1fr;
      gap: var(--space-xs);
    }
  }
  .fm-key {
    font-size: var(--fs-xs);
    color: var(--muted);
    justify-self: start;
  }
  // Only a key we can explain invites a hover.
  .fm-key--doc {
    cursor: help;
    border-bottom: 1px dotted var(--line-2);
  }
  .fm-val {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--fs-sm);
    color: var(--text);
    min-width: 0;
  }
  .fm-scalar {
    word-break: break-word;
  }
  // Le dépliant explique aussi ses clés, mais sans le pointillé qui les signale.
  .fm-grid--muted .fm-key {
    cursor: help;
  }
  .fm-fallback {
    color: var(--dim);
    font-style: italic;
    font-size: var(--fs-xs);
  }
  .fm-required {
    color: var(--danger);
    font-size: var(--fs-xs);
  }

  .fm-chip {
    font-size: var(--fs-xs);
    padding: 2px var(--space-sm);
    background: var(--surface-2);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    color: var(--text);
    cursor: help;
  }
  .fm-bool {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: var(--fs-xs);
    padding: 2px var(--space-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--line-2);
  }
  .fm-bool--on {
    background: var(--brand-soft);
    border-color: var(--brand-line);
    color: var(--brand);
  }
  .fm-bool--off {
    background: var(--surface-2);
    color: var(--muted);
  }
  .fm-flag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--fs-2xs);
  }
  .fm-flag--warn {
    color: var(--warn);
    cursor: help;
  }
  .fm-flag--danger {
    color: var(--danger);
    margin-left: var(--space-xs);
  }

  .fm-globs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .fm-glob {
    font-size: var(--fs-xs);
    color: var(--muted);
  }
  .fm-wild {
    color: var(--brand);
    font-weight: 600;
  }
  .fm-block {
    margin: 0;
    width: 100%;
    overflow-x: auto;
    font-size: var(--fs-xs);
    line-height: 1.5;
    color: var(--muted);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
  }

  .fm-defaults {
    margin-top: var(--space-md);
    border-top: 1px solid var(--line);
    padding-top: var(--space-sm);
  }
  .fm-defaults-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    background: transparent;
    border: none;
    padding: var(--space-xs) 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    cursor: pointer;
    text-align: left;
  }
  .fm-defaults-toggle:hover {
    color: var(--text);
  }
  .fm-defaults-toggle:focus-visible {
    outline: 2px solid var(--brand-line);
    outline-offset: 2px;
    border-radius: var(--radius-xs);
  }
  .fm-defaults-note {
    color: var(--dim);
  }
</style>
