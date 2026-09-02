<template>
  <q-page class="hk">
    <h1 class="sr-only">{{ t('nav.hooks') }}</h1>

    <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

    <header class="hk-header">
      <q-icon name="bolt" size="15px" class="hk-head-icon" aria-hidden="true" />
      <p class="hk-sub font-mono">settings.json · hooks</p>
      <div class="hk-tools">
        <span v-if="dirty" class="dirty-pill font-mono">
          <span class="status-dot status-dot--brand" aria-hidden="true" /> {{ t('common.unsaved') }}
        </span>
        <q-btn flat dense no-caps :label="t('common.refresh')" :disable="loading" @click="load" />
        <q-btn
          unelevated
          no-caps
          dense
          color="primary"
          text-color="dark"
          :label="t('common.propose')"
          :disable="!dirty || !valid || proposing"
          :loading="proposing"
          @click="propose"
        />
      </div>
    </header>

    <p class="hk-note">{{ t('pages.hooks.note') }}</p>

    <div class="hk-global surface-card">
      <div class="hk-global-info">
        <div class="hk-global-name">{{ t('pages.hooks.execution') }}</div>
        <div class="hk-global-hint">{{ t('pages.hooks.executionHint') }}</div>
      </div>
      <SegmentedControl
        v-model="hooksEnabled"
        :options="execOptions"
        :toggle-color="hooksEnabled ? 'primary' : 'negative'"
        :aria-label="t('pages.hooks.execution')"
      />
    </div>

    <!-- Plugin-contributed hooks (read-only) -->
    <section v-if="pluginHooks.length" class="surface-card hk-plugins" :aria-label="t('pages.hooks.pluginHooks')">
      <header class="hk-event-head">
        <q-icon name="extension" size="18px" aria-hidden="true" />
        <h2 class="hk-event-name font-mono">{{ t('pages.hooks.pluginHooks') }}</h2>
      </header>
      <p class="hk-note">{{ t('pages.hooks.pluginNote') }}</p>
      <div v-for="ph in pluginHooks" :key="ph.plugin" class="hk-plugin">
        <div class="hk-plugin-head">
          <span class="hk-plugin-name font-mono">{{ ph.plugin }}</span>
          <span class="badge" :class="pluginEnabled(ph.plugin) ? 'badge--on' : 'badge--off'">
            {{ pluginEnabled(ph.plugin) ? t('pages.hooks.pluginOn') : t('pages.hooks.pluginOff') }}
          </span>
        </div>
        <div class="hk-plugin-events">
          <span v-for="ev in Object.keys(ph.hooks)" :key="ev" class="hk-chip font-mono">
            {{ ev }}
            <q-tooltip max-width="300px">{{ eventInfo(ev) }}</q-tooltip>
          </span>
        </div>
        <ul class="hk-cmds">
          <li v-for="(cmd, i) in commandsOf(ph)" :key="i" class="font-mono">{{ cmd }}</li>
        </ul>
      </div>
    </section>

    <div class="hk-user-label section-label">{{ t('pages.hooks.userHooks') }}</div>
    <div v-if="!eventsWithHooks.length" class="hk-empty">{{ t('pages.hooks.empty') }}</div>

    <section v-for="ev in eventsWithHooks" :key="ev" class="surface-card hk-event" :aria-label="t('pages.hooks.eventAria', { event: ev })">
      <header class="hk-event-head">
        <q-icon name="bolt" size="18px" aria-hidden="true" />
        <h2 class="hk-event-name font-mono">
          {{ ev }}
          <q-tooltip max-width="300px">{{ eventInfo(ev) }}</q-tooltip>
        </h2>
        <span class="hk-count font-mono">{{ groupsOf(ev).length }}</span>
      </header>

      <div v-for="(g, gi) in groupsOf(ev)" :key="gi" class="hk-group">
        <div class="hk-group-top">
          <label class="hk-lbl">{{ t('pages.hooks.matcher') }}</label>
          <input
            class="hk-input font-mono"
            :value="str(['hooks', ev, gi, 'matcher'])"
            :placeholder="t('pages.hooks.matcherPlaceholder')"
            spellcheck="false"
            :aria-label="t('pages.hooks.matcher')"
            @input="set(['hooks', ev, gi, 'matcher'], $event)"
          />
          <q-btn
            flat
            dense
            round
            size="sm"
            icon="delete"
            color="negative"
            :aria-label="t('pages.hooks.removeGroup', { n: gi + 1 })"
            @click="removeGroup(ev, gi)"
          />
        </div>

        <div v-for="(a, ai) in actionsOf(ev, gi)" :key="ai" class="hk-action">
          <div class="hk-action-row">
            <q-select
              :model-value="str(['hooks', ev, gi, 'hooks', ai, 'type']) || 'command'"
              :options="TYPE_OPTIONS"
              emit-value
              map-options
              dense
              outlined
              options-dense
              class="hk-type"
              :aria-label="t('pages.hooks.actionType')"
              @update:model-value="(v: string) => setVal(['hooks', ev, gi, 'hooks', ai, 'type'], v)"
            />
            <input
              class="hk-input hk-num font-mono"
              type="number"
              :value="str(['hooks', ev, gi, 'hooks', ai, 'timeout'])"
              placeholder="timeout"
              :aria-label="t('pages.hooks.timeout')"
              @input="setNum(['hooks', ev, gi, 'hooks', ai, 'timeout'], $event)"
            />
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="close"
              color="negative"
              :aria-label="t('pages.hooks.removeAction', { n: ai + 1 })"
              @click="removeAction(ev, gi, ai)"
            />
          </div>
          <textarea
            v-if="fieldFor(a) === 'command'"
            class="hk-input hk-area font-mono"
            rows="2"
            :value="str(['hooks', ev, gi, 'hooks', ai, 'command'])"
            :placeholder="t('pages.hooks.commandPlaceholder')"
            spellcheck="false"
            :aria-label="t('pages.hooks.command')"
            @input="set(['hooks', ev, gi, 'hooks', ai, 'command'], $event)"
          />
          <textarea
            v-else-if="fieldFor(a) === 'prompt'"
            class="hk-input hk-area"
            rows="2"
            :value="str(['hooks', ev, gi, 'hooks', ai, 'prompt'])"
            :placeholder="t('pages.hooks.promptPlaceholder')"
            :aria-label="t('pages.hooks.prompt')"
            @input="set(['hooks', ev, gi, 'hooks', ai, 'prompt'], $event)"
          />
          <input
            v-else-if="fieldFor(a) === 'url'"
            class="hk-input font-mono"
            :value="str(['hooks', ev, gi, 'hooks', ai, 'url'])"
            placeholder="https://…"
            spellcheck="false"
            aria-label="URL"
            @input="set(['hooks', ev, gi, 'hooks', ai, 'url'], $event)"
          />
          <p v-else class="hk-advanced font-mono">
            {{ t('pages.hooks.advanced', { type: str(['hooks', ev, gi, 'hooks', ai, 'type']) }) }}
          </p>
        </div>

        <q-btn flat dense no-caps size="sm" color="primary" icon="add" :label="t('pages.hooks.addAction')" @click="addAction(ev, gi)" />
      </div>

      <q-btn flat dense no-caps size="sm" color="primary" icon="add" :label="t('pages.hooks.addGroup')" @click="addGroup(ev)" />
    </section>

    <!-- Add a hook on any event -->
    <div class="hk-add surface-card">
      <div class="hk-add-row">
        <label class="hk-lbl">{{ t('pages.hooks.addOn') }}</label>
        <q-select v-model="newEvent" :options="EVENTS" dense outlined options-dense class="hk-newev" :aria-label="t('pages.hooks.event')" />
        <q-btn unelevated no-caps dense color="primary" text-color="dark" icon="add" :label="t('pages.hooks.add')" @click="addGroup(newEvent)" />
      </div>
      <p class="hk-newev-desc">{{ eventInfo(newEvent) }}</p>
    </div>

    <ConfirmDiffDialog :proposal="proposal" @applied="onApplied" @close="proposal = null" />
  </q-page>
</template>

<script setup lang="ts">
  import ConfirmDiffDialog from '@/components/ConfirmDiffDialog.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import { useJsonForm } from '@/composables/useJsonForm'
  import { useNotify } from '@/composables/useNotify'
  import { readFile, propose as proposeWrite, getPluginHooks, ClaudeApiError, type Proposal, type PluginHooks } from '@/services/claude'
  import { getAt, setAt, deleteAt } from '@/utils/json-edit'
  import { onMounted, ref, computed } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()
  const { notifyError } = useNotify()
  const PATH = 'settings.json'

  // Le catalogue des événements de Claude Code. L'ordre vient d'ici, les phrases
  // du catalogue de traduction — c'est de la documentation, pas la voix d'AURA.
  const EVENTS = [
    'SessionStart',
    'SessionEnd',
    'Setup',
    'UserPromptSubmit',
    'UserPromptExpansion',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'PostToolBatch',
    'PermissionRequest',
    'PermissionDenied',
    'Notification',
    'MessageDisplay',
    'SubagentStart',
    'SubagentStop',
    'TaskCreated',
    'TaskCompleted',
    'Stop',
    'StopFailure',
    'TeammateIdle',
    'InstructionsLoaded',
    'ConfigChange',
    'CwdChanged',
    'DirectoryAdded',
    'FileChanged',
    'WorktreeCreate',
    'WorktreeRemove',
    'PreCompact',
    'PostCompact',
    'PreModelSwitch',
    'PostModelSwitch',
    'Elicitation',
    'ElicitationResult',
  ]
  function eventInfo(ev: string): string {
    return t(`pages.hooks.events.${ev}`)
  }
  const TYPE_OPTIONS = [
    { label: 'command', value: 'command' },
    { label: 'prompt', value: 'prompt' },
    { label: 'http', value: 'http' },
    { label: 'agent', value: 'agent' },
    { label: 'mcp_tool', value: 'mcp_tool' },
  ]

  const content = ref('')
  const original = ref('')
  const loading = ref(true)
  const proposing = ref(false)
  const proposal = ref<Proposal | null>(null)
  const newEvent = ref('PostToolUse')
  const pluginHooks = ref<PluginHooks[]>([])

  const { valid, parsed, mutate } = useJsonForm(content)
  const dirty = computed(() => content.value !== original.value)

  type Path = (string | number)[]
  function str(p: Path): string {
    const v = getAt(parsed.value, p)
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    return ''
  }
  function set(p: Path, e: Event): void {
    const v = (e.target as HTMLInputElement | HTMLTextAreaElement).value
    mutate((o) => (v === '' ? deleteAt(o, p) : setAt(o, p, v)))
  }
  function setVal(p: Path, v: string): void {
    return mutate((o) => setAt(o, p, v))
  }
  function setNum(p: Path, e: Event): void {
    const raw = (e.target as HTMLInputElement).value
    mutate((o) => (raw === '' ? deleteAt(o, p) : setAt(o, p, Number(raw))))
  }

  const hooks = computed(() => (getAt(parsed.value, ['hooks']) ?? {}) as Record<string, unknown>)
  const eventsWithHooks = computed(() =>
    Object.keys(hooks.value).filter((e) => Array.isArray(hooks.value[e]) && (hooks.value[e] as unknown[]).length),
  )
  function groupsOf(ev: string): Record<string, unknown>[] {
    return (getAt(parsed.value, ['hooks', ev]) as Record<string, unknown>[] | undefined) ?? []
  }
  function actionsOf(ev: string, gi: number): Record<string, unknown>[] {
    return (getAt(parsed.value, ['hooks', ev, gi, 'hooks']) as Record<string, unknown>[] | undefined) ?? []
  }

  /** Which single field to render for an action, by its type. */
  function fieldFor(a: Record<string, unknown>): 'command' | 'prompt' | 'url' | 'other' {
    const t = (a.type as string) || 'command'
    if (t === 'command') return 'command'
    if (t === 'prompt' || t === 'agent') return 'prompt'
    if (t === 'http') return 'url'
    return 'other'
  }

  /** A plugin's hooks are active unless it's explicitly disabled in settings. */
  function pluginEnabled(id: string): boolean {
    return getAt(parsed.value, ['enabledPlugins', id]) !== false
  }

  /** Unique commands a plugin's hooks run (for a compact read-only summary). */
  function commandsOf(ph: PluginHooks): string[] {
    const set = new Set<string>()
    for (const groups of Object.values(ph.hooks)) {
      for (const g of groups ?? []) {
        for (const a of g.hooks ?? []) {
          if (a.command) set.add(a.command)
        }
      }
    }
    return [...set]
  }

  // Surfaced with positive polarity — the underlying `disableAllHooks` key is inverted,
  // so the segments read "Actifs / Désactivés" rather than asking the user to translate
  // an "on" switch into "everything is off". The key is deleted, not set to false, when
  // hooks are active: absent is its natural resting state.
  const execOptions = computed(() => [
    { label: t('pages.hooks.execOn'), value: true },
    { label: t('pages.hooks.execOff'), value: false },
  ])
  const hooksEnabled = computed({
    get: (): boolean => getAt(parsed.value, ['disableAllHooks']) !== true,
    set: (v: boolean): void => mutate((o) => (v ? deleteAt(o, ['disableAllHooks']) : setAt(o, ['disableAllHooks'], true))),
  })

  function addGroup(ev: string): void {
    mutate((o) => {
      const arr = getAt(o, ['hooks', ev])
      const group = { matcher: '', hooks: [{ type: 'command', command: '' }] }
      if (Array.isArray(arr)) arr.push(group)
      else setAt(o, ['hooks', ev], [group])
    })
  }
  function removeGroup(ev: string, gi: number): void {
    mutate((o) => {
      const arr = getAt(o, ['hooks', ev]) as unknown[] | undefined
      if (!Array.isArray(arr)) return
      arr.splice(gi, 1)
      if (!arr.length) {
        deleteAt(o, ['hooks', ev])
        const h = getAt(o, ['hooks']) as Record<string, unknown> | undefined
        if (h && !Object.keys(h).length) deleteAt(o, ['hooks'])
      }
    })
  }
  function addAction(ev: string, gi: number): void {
    mutate((o) => {
      const arr = getAt(o, ['hooks', ev, gi, 'hooks'])
      if (Array.isArray(arr)) arr.push({ type: 'command', command: '' })
      else setAt(o, ['hooks', ev, gi, 'hooks'], [{ type: 'command', command: '' }])
    })
  }
  function removeAction(ev: string, gi: number, ai: number): void {
    mutate((o) => {
      const arr = getAt(o, ['hooks', ev, gi, 'hooks']) as unknown[] | undefined
      if (Array.isArray(arr)) arr.splice(ai, 1)
    })
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      const { content: c } = await readFile(PATH)
      content.value = c
      original.value = c
    } catch (e) {
      if (e instanceof ClaudeApiError && e.status === 404) {
        content.value = '{}\n'
        original.value = ''
      } else {
        notifyError(e, t('pages.hooks.readError'))
      }
    } finally {
      loading.value = false
    }
  }

  async function propose(): Promise<void> {
    proposing.value = true
    try {
      proposal.value = await proposeWrite(PATH, content.value)
    } catch (e) {
      notifyError(e, t('common.proposeError'))
    } finally {
      proposing.value = false
    }
  }

  function onApplied(): void {
    original.value = content.value
    proposal.value = null
  }

  onMounted(async () => {
    await load()
    try {
      pluginHooks.value = await getPluginHooks()
    } catch {
      /* plugin hooks are optional */
    }
  })
</script>

<style scoped lang="scss">
  .hk {
    padding: var(--space-md) var(--space-xl) var(--space-xl);
    width: 100%;
    max-width: var(--page-max);
    // Centré, comme toute page bornée de l'application : calé à gauche, le vide
    // s'accumulait d'un seul côté et se lisait comme une colonne manquante.
    margin: 0 auto;
  }
  .hk-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    margin-bottom: var(--space-md);
  }
  .hk-head-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .hk-sub {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--dim);
    font-size: var(--fs-sm);
    margin: 0;
  }
  .hk-tools {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 0 0 auto;
    margin-left: auto;
  }
  .dirty-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--fs-xs);
    color: var(--brand);
    background: var(--brand-soft);
    border: 1px solid var(--brand-line);
    border-radius: var(--radius-sm);
    padding: var(--space-xs) var(--space-sm);
  }
  .hk-note {
    color: var(--muted);
    font-size: var(--fs-sm);
    margin: 0 0 var(--space-md);
    max-width: 80ch;
  }
  .hk-global {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-lg);
    margin-bottom: var(--space-lg);
  }
  .hk-global-name {
    font-size: var(--fs-md);
  }
  .hk-global-hint {
    font-size: var(--fs-sm);
    color: var(--muted);
  }
  .hk-empty {
    color: var(--dim);
    font-size: var(--fs-sm);
    padding: var(--space-md) 0;
  }
  .hk-plugins {
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
  }
  .hk-user-label {
    display: block;
    margin: var(--space-lg) 0 var(--space-sm);
  }
  .hk-plugin {
    border-top: 1px solid var(--line);
    padding: var(--space-md) 0;
  }
  .hk-plugin:first-of-type {
    border-top: none;
  }
  .hk-plugin-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }
  .hk-plugin-name {
    font-size: var(--fs-md);
    font-weight: 500;
  }
  .badge {
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    border: 1px solid transparent;
  }
  .badge--on {
    color: var(--pulse);
    background: rgba(110, 231, 168, 0.12);
    border-color: rgba(110, 231, 168, 0.3);
  }
  .badge--off {
    color: var(--dim);
    background: var(--surface-2);
    border-color: var(--line);
  }
  .hk-plugin-events {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-bottom: var(--space-xs);
  }
  .hk-chip {
    font-size: var(--fs-2xs);
    padding: 1px 6px;
    background: var(--brand-soft);
    color: var(--brand);
    border: 1px solid var(--brand-line);
    border-radius: var(--radius-xs);
  }
  .hk-cmds {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hk-cmds li {
    font-size: var(--fs-xs);
    color: var(--muted);
    word-break: break-all;
  }
  .hk-event {
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
  }
  .hk-event-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--muted);
    margin-bottom: var(--space-md);
  }
  .hk-event-name {
    margin: 0;
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--brand);
  }
  .hk-count {
    font-size: var(--fs-xs);
    color: var(--dim);
  }
  .hk-group {
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: var(--space-md);
    margin-bottom: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .hk-group-top {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .hk-lbl {
    font-size: var(--fs-xs);
    color: var(--muted);
    flex: 0 0 auto;
  }
  .hk-action {
    border-top: 1px solid var(--line);
    padding-top: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .hk-action-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .hk-input {
    flex: 1;
    min-width: 0;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    font-size: var(--fs-sm);
    outline: none;
    transition: border-color var(--motion-fast);
  }
  .hk-input:focus {
    border-color: var(--brand-line);
  }
  .hk-area {
    width: 100%;
    resize: vertical;
  }
  .hk-num {
    flex: 0 0 90px;
    text-align: right;
  }
  .hk-type {
    flex: 0 0 140px;
  }
  .hk-advanced {
    font-size: var(--fs-xs);
    color: var(--dim);
    margin: 0;
  }
  .hk-add {
    padding: var(--space-md) var(--space-lg);
  }
  .hk-add-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .hk-newev {
    min-width: 220px;
  }
  .hk-newev-desc {
    margin: var(--space-sm) 0 0;
    font-size: var(--fs-sm);
    color: var(--muted);
  }
</style>
