<template>
  <q-page class="settings-page">
    <h1 class="sr-only">{{ t('nav.settings') }}</h1>

    <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

    <!-- ── Module header ──────────────────────────────────────────────────── -->
    <header class="settings-header">
      <q-icon name="description" size="14px" class="settings-path-icon" aria-hidden="true" />
      <span class="settings-sub font-mono">settings.json</span>

      <div class="settings-tools">
        <span v-if="dirty" class="dirty-pill font-mono" :title="t('pages.settings.unsavedTitle')">
          <span class="status-dot status-dot--brand" aria-hidden="true" />
          {{ t('common.unsaved') }}
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

    <!-- ── Tab strip (single menu level) ──────────────────────────────────── -->
    <nav class="tabs" :aria-label="t('pages.settings.tabsAria')">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ 'tab--active': activeId === tab.id }"
        :aria-current="activeId === tab.id ? 'true' : undefined"
        @click="goTo(tab.id)"
      >
        <q-icon :name="tab.icon" size="17px" aria-hidden="true" />
        <span>{{ tab.title }}</span>
      </button>
    </nav>

    <p v-if="!valid" class="banner banner--warn font-mono"><q-icon name="warning" size="16px" /> {{ t('pages.settings.invalidBanner') }}</p>

    <!-- ── JSON tab ───────────────────────────────────────────────────────── -->
    <!-- En lecture seule : le fichier se modifie par les onglets, qui savent ce
         que chaque clé attend. Un éditeur de texte libre ouvrait la porte à un
         settings.json cassé, et doublait chaque champ d'une seconde façon de le
         saisir. Reste la vue du fichier réel, colorée, telle qu'il est sur le
         disque. -->
    <div v-if="activeId === 'json'" class="json-pane">
      <p v-if="jsonError" class="err font-mono">{{ jsonError }}</p>
      <CodeBlock :code="content" lang="json" filename="settings.json" icon="data_object" max-height="70vh" />
    </div>

    <!-- ── Form tabs ──────────────────────────────────────────────────────── -->
    <div v-else class="settings-content" :class="{ 'settings-content--disabled': !valid }">
      <!-- Général -->
      <section v-show="activeId === 'sec-general'" id="sec-general" class="surface-card settings-section" aria-labelledby="sec-general-title">
        <header class="settings-section-head">
          <q-icon name="tune" size="20px" aria-hidden="true" />
          <h2 id="sec-general-title">{{ t('pages.settings.sections.general') }}</h2>
        </header>

        <SettingField :label="t('pages.settings.fields.language')" json-key="language" :hint="t('pages.settings.fields.languageHint')">
          <input v-model="language" class="ctl-input" spellcheck="false" :aria-label="t('pages.settings.fields.language')" />
        </SettingField>

        <SettingField :label="t('pages.settings.fields.model')" json-key="model" :hint="t('pages.settings.fields.modelHint')">
          <input
            v-model="model"
            class="ctl-input font-mono"
            placeholder="auto"
            spellcheck="false"
            :aria-label="t('pages.settings.fields.modelAria')"
          />
        </SettingField>

        <SettingField :label="t('pages.settings.fields.effort')" json-key="effortLevel" :hint="t('pages.settings.fields.effortHint')">
          <SegmentedControl v-model="effortLevel" :options="effortOptions" :aria-label="t('pages.settings.fields.effort')" />
        </SettingField>

        <SettingField :label="t('pages.settings.fields.fastMode')" json-key="fastMode" :hint="t('pages.settings.fields.fastModeHint')">
          <SegmentedControl v-model="fastMode" :options="triDefaultOff" :aria-label="t('pages.settings.fields.fastMode')" />
        </SettingField>

        <SettingField :label="t('pages.settings.fields.thinking')" json-key="alwaysThinkingEnabled" :hint="t('pages.settings.fields.thinkingHint')">
          <SegmentedControl v-model="alwaysThinking" :options="triDefaultOff" :aria-label="t('pages.settings.fields.thinking')" />
        </SettingField>

        <SettingField :label="t('pages.settings.fields.editor')" json-key="editorMode" :hint="t('pages.settings.fields.editorHint')">
          <SegmentedControl v-model="editorMode" :options="editorOptions" :aria-label="t('pages.settings.fields.editorAria')" />
        </SettingField>
      </section>

      <!-- Permissions -->
      <section v-show="activeId === 'sec-perms'" id="sec-perms" class="surface-card settings-section" aria-labelledby="sec-perms-title">
        <header class="settings-section-head">
          <q-icon name="shield" size="20px" aria-hidden="true" />
          <h2 id="sec-perms-title">{{ t('pages.settings.sections.perms') }}</h2>
        </header>

        <SettingField
          :label="t('pages.settings.fields.defaultMode')"
          json-key="permissions.defaultMode"
          :danger="defaultMode === 'bypassPermissions'"
          :hint="t('pages.settings.fields.defaultModeHint')"
        >
          <q-select
            v-model="defaultMode"
            :options="defaultModeOptions"
            emit-value
            map-options
            outlined
            dense
            options-dense
            class="ctl-select"
            :aria-label="t('pages.settings.fields.defaultModeAria')"
          />
        </SettingField>

        <p v-if="defaultMode === 'bypassPermissions'" class="banner banner--danger">
          <q-icon name="dangerous" size="16px" />
          <span>
            <i18n-t keypath="pages.settings.bypassWarn" scope="global">
              <template #mode><strong>bypassPermissions</strong></template>
            </i18n-t>
          </span>
        </p>

        <RuleList
          :label="t('pages.settings.rules.allow')"
          :rules="stringArray(['permissions', 'allow'])"
          :placeholder="t('pages.settings.rules.allowPlaceholder')"
          @add="(v) => pushTo(['permissions', 'allow'], v)"
          @remove="(i) => removeFrom(['permissions', 'allow'], i)"
        />
        <RuleList
          :label="t('pages.settings.rules.deny')"
          tone="negative"
          :rules="stringArray(['permissions', 'deny'])"
          :placeholder="t('pages.settings.rules.denyPlaceholder')"
          @add="(v) => pushTo(['permissions', 'deny'], v)"
          @remove="(i) => removeFrom(['permissions', 'deny'], i)"
        />
        <RuleList
          :label="t('pages.settings.rules.ask')"
          :rules="stringArray(['permissions', 'ask'])"
          :placeholder="t('pages.settings.rules.askPlaceholder')"
          @add="(v) => pushTo(['permissions', 'ask'], v)"
          @remove="(i) => removeFrom(['permissions', 'ask'], i)"
        />
        <RuleList
          :label="t('pages.settings.rules.dirs')"
          :rules="stringArray(['permissions', 'additionalDirectories'])"
          :placeholder="t('pages.settings.rules.dirsPlaceholder')"
          @add="(v) => pushTo(['permissions', 'additionalDirectories'], v)"
          @remove="(i) => removeFrom(['permissions', 'additionalDirectories'], i)"
        />
      </section>

      <!-- Interface & mises à jour -->
      <section v-show="activeId === 'sec-ui'" id="sec-ui" class="surface-card settings-section" aria-labelledby="sec-ui-title">
        <header class="settings-section-head">
          <q-icon name="display_settings" size="20px" aria-hidden="true" />
          <h2 id="sec-ui-title">{{ t('pages.settings.sections.ui') }}</h2>
        </header>

        <SettingField :label="t('pages.settings.fields.tui')" json-key="tui">
          <SegmentedControl v-model="tui" :options="tuiOptions" :aria-label="t('pages.settings.fields.tui')" />
        </SettingField>

        <SettingField :label="t('pages.settings.fields.channel')" json-key="autoUpdatesChannel">
          <SegmentedControl v-model="channel" :options="channelOptions" :aria-label="t('pages.settings.fields.channel')" />
        </SettingField>

        <SettingField :label="t('pages.settings.fields.cleanup')" json-key="cleanupPeriodDays" :hint="t('pages.settings.fields.cleanupHint')">
          <input
            v-model.number="cleanupDays"
            type="number"
            min="1"
            class="ctl-input ctl-input--num font-mono"
            :aria-label="t('pages.settings.fields.cleanupAria')"
          />
        </SettingField>

        <SettingField v-for="f in booleanFlags" :key="f.key" :label="f.label" :json-key="f.key" :hint="f.hint">
          <SegmentedControl
            :model-value="triFlag(f.key)"
            :options="f.default ? triDefaultOn : triDefaultOff"
            :aria-label="f.label"
            @update:model-value="(v) => setTriFlag(f.key, v)"
          />
        </SettingField>

        <SettingField
          v-if="statusLineCommand"
          :label="t('pages.settings.fields.statusLine')"
          json-key="statusLine"
          :hint="t('pages.settings.fields.statusLineHint')"
        >
          <code class="ctl-readonly font-mono">{{ statusLineCommand }}</code>
        </SettingField>
      </section>
    </div>

    <ConfirmDiffDialog :proposal="proposal" @applied="onApplied" @close="proposal = null" />
  </q-page>
</template>

<script setup lang="ts">
  import ConfirmDiffDialog from '@/components/ConfirmDiffDialog.vue'
  import CodeBlock from '@/components/replay/tools/CodeBlock.vue'
  import RuleList from '@/components/settings/RuleList.vue'
  import SettingField from '@/components/settings/SettingField.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import { useJsonForm } from '@/composables/useJsonForm'
  import { useNotify } from '@/composables/useNotify'
  import { readFile, propose as proposeWrite, ClaudeApiError, type Proposal } from '@/services/claude'
  import { onMounted, ref, computed } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()
  const { notifyError } = useNotify()
  const PATH = 'settings.json'

  const content = ref('')
  const original = ref('')
  const loading = ref(true)
  const proposing = ref(false)
  const proposal = ref<Proposal | null>(null)

  const { valid, field, has, remove, stringArray, pushTo, removeFrom } = useJsonForm(content)

  const dirty = computed(() => content.value !== original.value)

  // ── JSON validation message (JSON mode) ──────────────────────────────────────
  const jsonError = computed(() => {
    if (!content.value.trim()) return ''
    try {
      JSON.parse(content.value)
      return ''
    } catch (e) {
      return e instanceof Error ? e.message : t('pages.settings.invalidJson')
    }
  })

  // ── Options ──────────────────────────────────────────────────────────────────
  const effortOptions = [
    { label: 'low', value: 'low' },
    { label: 'medium', value: 'medium' },
    { label: 'high', value: 'high' },
    { label: 'xhigh', value: 'xhigh' },
  ]
  const editorOptions = [
    { label: 'normal', value: 'normal' },
    { label: 'vim', value: 'vim' },
  ]
  const tuiOptions = [
    { label: 'fullscreen', value: 'fullscreen' },
    { label: 'inline', value: 'inline' },
  ]
  const channelOptions = [
    { label: 'stable', value: 'stable' },
    { label: 'latest', value: 'latest' },
  ]
  // La valeur est la clé écrite dans le fichier ; le libellé n'est que sa glose.
  const MODES = ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'] as const
  const defaultModeOptions = computed(() => MODES.map((value) => ({ label: t(`pages.settings.modes.${value}`), value })))

  // La clé du fichier et la valeur que Claude Code applique en son absence ; le
  // libellé et l'explication viennent du catalogue.
  const FLAGS: { key: string; default: boolean }[] = [
    { key: 'autoCompactEnabled', default: true },
    { key: 'autoMemoryEnabled', default: true },
    { key: 'fileCheckpointingEnabled', default: true },
    { key: 'spinnerTipsEnabled', default: true },
    { key: 'prefersReducedMotion', default: false },
    { key: 'agentPushNotifEnabled', default: false },
    { key: 'skipAutoPermissionPrompt', default: false },
    { key: 'remoteControlAtStartup', default: false },
    { key: 'includeCoAuthoredBy', default: false },
  ]
  const booleanFlags = computed(() =>
    FLAGS.map((f) => ({
      ...f,
      label: t(`pages.settings.flags.${f.key}`),
      hint: t(`pages.settings.flags.${f.key}Hint`),
    })),
  )

  // ── Tri-state booleans ───────────────────────────────────────────────────────
  // An absent key is not `false` — it means "Claude Code decides". A two-way switch
  // cannot express that third state, so it silently rewrote absence into whichever
  // default it displayed. These flags surface it: picking "Hérité" deletes the key.
  type Tri = 'inherit' | 'on' | 'off'

  function triOptions(def: boolean): { label: string; value: Tri; tooltip?: string }[] {
    return [
      {
        label: t('pages.settings.tri.inherit'),
        value: 'inherit',
        tooltip: t('pages.settings.tri.inheritTip', {
          default: t(def ? 'pages.settings.tri.yes' : 'pages.settings.tri.no'),
        }),
      },
      { label: t('pages.settings.tri.on'), value: 'on' },
      { label: t('pages.settings.tri.off'), value: 'off' },
    ]
  }
  const triDefaultOn = computed(() => triOptions(true))
  const triDefaultOff = computed(() => triOptions(false))

  function triFlag(key: string): Tri {
    if (!has([key])) return 'inherit'
    return field<boolean>([key], false).value ? 'on' : 'off'
  }
  function setTriFlag(key: string, v: Tri): void {
    if (v === 'inherit') remove([key])
    else field<boolean>([key], v === 'on').value = v === 'on'
  }
  /** Same, as a v-model target (for flags rendered outside the `booleanFlags` loop). */
  function triField(key: string) {
    return computed<Tri>({ get: () => triFlag(key), set: (v) => setTriFlag(key, v) })
  }

  // ── Bound fields ─────────────────────────────────────────────────────────────
  const language = field<string>(['language'], '')
  const model = field<string>(['model'], '')
  const effortLevel = field<string>(['effortLevel'], 'medium')
  const fastMode = triField('fastMode')
  const alwaysThinking = triField('alwaysThinkingEnabled')
  const editorMode = field<string>(['editorMode'], 'normal')
  const defaultMode = field<string>(['permissions', 'defaultMode'], 'default')
  const tui = field<string>(['tui'], 'fullscreen')
  const channel = field<string>(['autoUpdatesChannel'], 'latest')
  const cleanupDays = field<number>(['cleanupPeriodDays'], 30)

  const statusLineCommand = computed(() => {
    const v = field<string>(['statusLine', 'command'], '').value
    return v || ''
  })

  // ── Tabs (single menu level, panel swap — no scroll-spy) ─────────────────────
  const tabs = computed(() => [
    { id: 'sec-general', title: t('pages.settings.tabs.general'), icon: 'tune' },
    { id: 'sec-perms', title: t('pages.settings.tabs.perms'), icon: 'shield' },
    { id: 'sec-ui', title: t('pages.settings.tabs.ui'), icon: 'display_settings' },
    { id: 'json', title: t('pages.settings.tabs.json'), icon: 'data_object' },
  ])
  const activeId = ref('sec-general')
  function goTo(id: string): void {
    activeId.value = id
  }

  // ── Load / actions ───────────────────────────────────────────────────────────
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
        notifyError(e, t('pages.settings.readError'))
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

  // Touch `has`/`remove` so the linter keeps them if unused elsewhere.
  void has
  void remove

  onMounted(load)
</script>

<style scoped lang="scss">
  .settings-page {
    padding: var(--space-md) var(--space-xl) var(--space-xl);
    width: 100%;
    max-width: var(--page-max);
    margin: 0 auto;
  }

  .settings-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    margin-bottom: var(--space-md);
  }
  .settings-path-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .settings-sub {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--dim);
    font-size: var(--fs-xs);
  }
  .settings-tools {
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

  /* ── Tab strip ────────────────────────────────────────────────────────────── */
  .tabs {
    display: flex;
    gap: var(--space-xs);
    border-bottom: 1px solid var(--line);
    margin-bottom: var(--space-lg);
    overflow-x: auto;
  }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: var(--fs-base);
    font-weight: 500;
    padding: var(--space-sm) var(--space-md);
    white-space: nowrap;
    transition: color var(--motion-fast);
  }
  .tab:hover {
    color: var(--text);
  }
  .tab--active {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }

  .banner {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: var(--fs-sm);
    margin: 0 0 var(--space-md);
  }
  .banner--warn {
    background: rgba(224, 163, 62, 0.12);
    color: var(--warn);
    border: 1px solid rgba(224, 163, 62, 0.3);
  }
  .banner--danger {
    background: rgba(229, 72, 77, 0.1);
    color: var(--danger);
    border: 1px solid rgba(229, 72, 77, 0.3);
  }

  /* ── Content ──────────────────────────────────────────────────────────────── */
  .settings-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  .settings-content--disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  .settings-section {
    padding: var(--space-lg) var(--space-xl);
    // Pas de largeur propre : la page en a une, et une carte plus étroite qu'elle
    // se décalerait de son propre en-tête — les onglets d'un côté, le formulaire
    // de l'autre.
  }
  .settings-section-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--muted);
    margin-bottom: var(--space-sm);
  }
  .settings-section-head h2 {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text);
  }

  /* ── Controls ─────────────────────────────────────────────────────────────── */
  .ctl-input {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--fs-sm);
    min-width: 200px;
    outline: none;
    transition: border-color var(--motion-fast);
  }
  .ctl-input:focus {
    border-color: var(--brand-line);
  }
  .ctl-input--num {
    min-width: 90px;
    text-align: right;
  }
  .ctl-select {
    min-width: 300px;
  }
  .ctl-readonly {
    font-size: var(--fs-sm);
    color: var(--muted);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: var(--space-xs) var(--space-sm);
    max-width: 340px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* ── JSON pane ────────────────────────────────────────────────────────────── */
  .json-pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .err {
    margin: 0;
    color: var(--danger);
    font-size: var(--fs-sm);
  }
</style>
