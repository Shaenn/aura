<template>
  <q-page class="pg">
    <h1 class="sr-only">{{ t('pages.plugins.title') }}</h1>

    <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

    <header class="pg-header">
      <q-icon name="extension" size="15px" class="pg-head-icon" aria-hidden="true" />
      <p class="pg-sub font-mono">settings.json · plugins/</p>
      <div class="pg-tools">
        <span v-if="dirty" class="dirty-pill font-mono">
          <span class="status-dot status-dot--brand" aria-hidden="true" /> {{ t('common.unsaved') }}
        </span>
        <q-btn flat dense no-caps :label="t('common.refresh')" :disable="loading" @click="reload" />
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

    <!-- Marketplaces (source des plugins — vient en premier dans le parcours) -->
    <section class="surface-card pg-section" aria-labelledby="pg-mk-title">
      <header class="pg-section-head">
        <q-icon name="storefront" size="20px" aria-hidden="true" />
        <h2 id="pg-mk-title">{{ t('pages.plugins.marketplaces') }}</h2>
        <span class="pg-count font-mono">{{ marketplaces.length }}</span>
      </header>

      <ul class="mk-list">
        <li v-for="m in marketplaces" :key="m.name" class="mk-row">
          <div class="mk-info">
            <div class="mk-name">
              {{ m.name }}
              <span v-if="m.pending" class="badge badge--pending">
                {{ t('pages.plugins.badges.pending') }}
              </span>
              <span v-else-if="m.userAdded" class="badge badge--added">
                {{ t('pages.plugins.badges.added') }}
              </span>
              <span v-else class="badge badge--builtin">
                {{ t('pages.plugins.badges.builtin') }}
              </span>
            </div>
            <div class="mk-meta font-mono">
              {{ m.sourceType }}<span v-if="m.location"> · {{ m.location }}</span>
            </div>
          </div>
          <q-btn
            flat
            dense
            round
            size="sm"
            icon="delete"
            color="negative"
            :aria-label="t('pages.plugins.removeMarketplaceAria', { name: m.name })"
            @click="openMarketplaceRemove(m)"
          />
        </li>
      </ul>

      <q-form ref="mkForm" class="mk-add" @submit.prevent="openAddCommand">
        <q-input
          v-model="mkSource"
          dense
          outlined
          class="mk-field mk-field--wide font-mono"
          :placeholder="t('pages.plugins.sourcePlaceholder')"
          :aria-label="t('pages.plugins.sourceAria')"
          :rules="[(v) => !!v?.trim() || t('pages.plugins.sourceRequired')]"
          hide-bottom-space
        />
        <q-btn type="submit" unelevated no-caps dense color="primary" text-color="dark" icon="terminal" :label="t('pages.plugins.getCommand')" />
      </q-form>
      <p class="mk-hint">{{ t('pages.plugins.marketplaceHint') }}</p>
    </section>

    <!-- Plugins installés (ce qui provient des marketplaces ci-dessus) -->
    <section class="surface-card pg-section" aria-labelledby="pg-plugins-title">
      <header class="pg-section-head">
        <q-icon name="extension" size="20px" aria-hidden="true" />
        <h2 id="pg-plugins-title">{{ t('pages.plugins.installed') }}</h2>
        <span class="pg-count font-mono">{{ plugins.length }}</span>
      </header>

      <div v-if="!plugins.length" class="pg-empty">{{ t('pages.plugins.empty') }}</div>
      <SettingField v-for="p in plugins" :key="p.id" :label="pluginName(p.id)" :hint="`v${p.version} · ${p.scope} · ${pluginMarketplace(p.id)}`">
        <SegmentedControl
          :model-value="pluginEnabled(p.id)"
          :options="enabledOptions"
          :aria-label="t('pages.plugins.stateAria', { id: p.id })"
          @update:model-value="(v) => setPluginEnabled(p.id, v)"
        />
        <q-btn
          flat
          dense
          round
          size="sm"
          icon="delete"
          color="negative"
          :aria-label="t('pages.plugins.uninstallAria', { id: p.id })"
          @click="openUninstall(p.id)"
        />
      </SettingField>
    </section>

    <!-- settings.json write (enable/disable toggles + pending-marketplace removal) -->
    <ConfirmDiffDialog :proposal="proposal" @applied="onApplied" @close="proposal = null" />

    <!-- CLI command guidance (install/uninstall/marketplace add-remove) -->
    <CliCommandDialog :command="cliCommand" :title="cliTitle" :note="cliNote" @close="cliCommand = null">
      <template v-if="cliMarketplace?.userAdded" #actions>
        <q-btn flat no-caps dense color="negative" :label="t('pages.plugins.removeFromConfig')" @click="removeFromConfig" />
      </template>
    </CliCommandDialog>
  </q-page>
</template>

<script setup lang="ts">
  import CliCommandDialog from '@/components/CliCommandDialog.vue'
  import ConfirmDiffDialog from '@/components/ConfirmDiffDialog.vue'
  import SettingField from '@/components/settings/SettingField.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import { useJsonForm } from '@/composables/useJsonForm'
  import { useNotify } from '@/composables/useNotify'
  import { readFile, getPlugins, propose as proposeWrite, ClaudeApiError, type Proposal, type PluginsIndex } from '@/services/claude'
  import { getAt, setAt, deleteAt } from '@/utils/json-edit'
  import { type QForm } from 'quasar'
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
  const pluginsIndex = ref<PluginsIndex>({ installed: [], marketplaces: [] })

  const { valid, field, parsed, mutate } = useJsonForm(content)
  const dirty = computed(() => content.value !== original.value)

  const plugins = computed(() => pluginsIndex.value.installed)

  const enabledOptions = computed(() => [
    { label: t('common.enabled'), value: true },
    { label: t('common.disabled'), value: false },
  ])

  // id = "name@marketplace"
  function pluginName(id: string): string {
    return id.split('@')[0] ?? id
  }
  function pluginMarketplace(id: string): string {
    return id.split('@')[1] ?? '—'
  }

  // A plugin is enabled unless `enabledPlugins[id]` says otherwise, so "Actif" is the
  // key's absence — writing `true` would record a no-op. Dropping the last entry takes
  // the now-empty `enabledPlugins` object with it.
  function pluginEnabled(id: string): boolean {
    return field<boolean>(['enabledPlugins', id], true).value
  }
  function setPluginEnabled(id: string, v: boolean): void {
    mutate((o) => {
      if (!v) {
        setAt(o, ['enabledPlugins', id], false)
        return
      }
      const root = getAt(o, ['enabledPlugins']) as Record<string, unknown> | undefined
      if (!root) return
      delete root[id]
      if (!Object.keys(root).length) deleteAt(o, ['enabledPlugins'])
    })
  }

  // Marketplaces: merge the runtime registry with pending additions in settings.
  interface MkRow {
    name: string
    sourceType: string
    location: string
    userAdded: boolean
    pending: boolean
  }
  const marketplaces = computed<MkRow[]>(() => {
    const extra = (getAt(parsed.value, ['extraKnownMarketplaces']) ?? {}) as Record<
      string,
      { source?: { source?: string; path?: string; repo?: string } }
    >
    const extraNames = new Set(Object.keys(extra))
    const rows: MkRow[] = pluginsIndex.value.marketplaces.map((m) => ({
      ...m,
      userAdded: extraNames.has(m.name),
      pending: false,
    }))
    const known = new Set(rows.map((r) => r.name))
    for (const [name, def] of Object.entries(extra)) {
      if (known.has(name)) continue
      const s = def.source ?? {}
      rows.push({
        name,
        sourceType: s.source ?? '',
        location: s.path ?? s.repo ?? '',
        userAdded: true,
        pending: true,
      })
    }
    return rows
  })

  // Add-marketplace: AURA does not write plugins/ — it hands over the CLI command.
  const mkForm = ref<QForm | null>(null)
  const mkSource = ref('')

  // ── CLI command guidance ──────────────────────────────────────────────────────
  // Install/uninstall and marketplace add/remove touch the Claude-Code-managed
  // plugins/ tree, so AURA surfaces the exact `/plugin …` command instead of
  // writing those files. Only the declarative settings.json keys are edited here.
  const cliCommand = ref<string | null>(null)
  const cliTitle = ref('')
  const cliNote = ref('')
  const cliMarketplace = ref<MkRow | null>(null)

  function openUninstall(id: string): void {
    cliMarketplace.value = null
    cliTitle.value = t('pages.plugins.uninstallTitle')
    cliNote.value = t('pages.plugins.uninstallNote')
    cliCommand.value = `/plugin uninstall ${id}`
  }

  function openAddCommand(): void {
    const src = mkSource.value.trim()
    if (!src) return
    cliMarketplace.value = null
    cliTitle.value = t('pages.plugins.addTitle')
    cliNote.value = t('pages.plugins.addNote')
    cliCommand.value = `/plugin marketplace add ${src}`
    mkSource.value = ''
    void mkForm.value?.resetValidation()
  }

  function openMarketplaceRemove(m: MkRow): void {
    // A "pending" entry is only a settings.json declaration (never materialised):
    // removing it there is complete and correct — no CLI needed.
    if (m.pending) {
      removeFromConfigName(m.name)
      return
    }
    cliMarketplace.value = m
    cliTitle.value = t('pages.plugins.removeTitle')
    cliNote.value = t('pages.plugins.removeNote')
    cliCommand.value = `/plugin marketplace remove ${m.name}`
  }

  /** Drop a marketplace declaration from settings.json > extraKnownMarketplaces. */
  function removeFromConfigName(name: string): void {
    mutate((o) => {
      const root = o.extraKnownMarketplaces as Record<string, unknown> | undefined
      if (root) delete root[name]
    })
  }

  function removeFromConfig(): void {
    if (cliMarketplace.value) removeFromConfigName(cliMarketplace.value.name)
    cliCommand.value = null
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
        notifyError(e, t('pages.plugins.readError'))
      }
    } finally {
      loading.value = false
    }
  }

  async function reloadPlugins(): Promise<void> {
    try {
      pluginsIndex.value = await getPlugins()
    } catch {
      /* optional */
    }
  }

  async function reload(): Promise<void> {
    await Promise.all([load(), reloadPlugins()])
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
    await reloadPlugins()
  })
</script>

<style scoped lang="scss">
  .pg {
    padding: var(--space-md) var(--space-xl) var(--space-xl);
    width: 100%;
    max-width: var(--page-max);
    margin: 0 auto;
  }
  .pg-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    margin-bottom: var(--space-lg);
  }
  .pg-head-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .pg-sub {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--dim);
    font-size: var(--fs-sm);
    margin: 0;
  }
  .pg-tools {
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

  .pg-section {
    padding: var(--space-lg) var(--space-xl);
    // Pas de largeur propre : la page en a une, et une carte plus étroite qu'elle
    // se décalerait de son propre en-tête.
    margin-bottom: var(--space-lg);
  }
  .pg-section-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--muted);
    margin-bottom: var(--space-sm);
  }
  .pg-section-head h2 {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .pg-count {
    font-size: var(--fs-sm);
    color: var(--dim);
  }
  .pg-empty {
    padding: var(--space-md) 0;
    color: var(--dim);
    font-size: var(--fs-sm);
  }

  /* Marketplaces */
  .mk-list {
    list-style: none;
    margin: 0 0 var(--space-md);
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .mk-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    border-top: 1px solid var(--line);
  }
  .mk-row:first-child {
    border-top: none;
  }
  .mk-name {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--fs-md);
  }
  .mk-meta {
    font-size: var(--fs-xs);
    color: var(--dim);
    margin-top: 2px;
  }
  .badge {
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    border: 1px solid transparent;
  }
  .badge--builtin {
    color: var(--dim);
    background: var(--surface-2);
    border-color: var(--line);
  }
  .badge--added {
    color: var(--brand);
    background: var(--brand-soft);
    border-color: var(--brand-line);
  }
  .badge--pending {
    color: var(--warn);
    background: rgba(224, 163, 62, 0.12);
    border-color: rgba(224, 163, 62, 0.3);
  }
  .mk-add {
    display: flex;
    gap: var(--space-sm);
    align-items: flex-start;
    flex-wrap: wrap;
    padding-top: var(--space-md);
    border-top: 1px solid var(--line);
  }
  .mk-field {
    min-width: 140px;
  }
  .mk-field--wide {
    flex: 1;
    min-width: 200px;
  }
  .mk-hint {
    margin: var(--space-sm) 0 0;
    font-size: var(--fs-xs);
    color: var(--dim);
    max-width: 70ch;
  }
</style>
