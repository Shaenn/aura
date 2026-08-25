<template>
  <q-page class="rv">
    <h1 class="sr-only">{{ title }}</h1>

    <div class="backdrop-grid" aria-hidden="true"></div>

    <header class="rv-header">
      <q-icon :name="icon" size="15px" class="rv-header-icon" aria-hidden="true" />
      <p class="rv-sub">{{ subtitle }}</p>
      <span class="rv-ro font-mono"> <q-icon name="lock" size="12px" aria-hidden="true" /> {{ t('common.readOnly') }} </span>
    </header>

    <div class="rv-body">
      <aside class="rv-list surface-card">
        <div v-if="loading" class="rv-empty">{{ t('common.loading') }}</div>
        <div v-else-if="!items.length" class="rv-empty">{{ emptyLabel }}</div>
        <div v-for="it in items" :key="it.rel" class="rv-item">
          <button
            class="rv-item-btn"
            :class="{ 'rv-item-btn--active': selected?.rel === it.rel }"
            :aria-expanded="hasRefs ? selected?.rel === it.rel : undefined"
            @click="selectItem(it)"
          >
            <q-icon
              v-if="hasRefs"
              :name="selected?.rel === it.rel ? 'expand_more' : 'chevron_right'"
              size="16px"
              class="rv-item-chevron"
              aria-hidden="true"
            />
            <!-- An identity dot when the resource type has one; the name beside
                 it still carries the meaning, so colour never stands alone. -->
            <span v-else-if="accentFor" class="rv-item-dot" :style="{ backgroundColor: accentFor(it) }" aria-hidden="true" />
            <q-icon v-else :name="icon" size="16px" class="rv-item-chevron" aria-hidden="true" />
            <span class="rv-item-text">
              <span class="rv-item-name">{{ it.title || it.name }}</span>
              <span v-if="it.description" class="rv-item-desc">{{ it.description }}</span>
            </span>
          </button>

          <!-- Sibling files: the resource's progressive disclosure, made visible -->
          <ul v-if="hasRefs && selected?.rel === it.rel && refFiles.length" class="rv-refs">
            <li v-for="f in refFiles" :key="f.rel">
              <button class="rv-ref" :class="{ 'rv-ref--active': viewer.rel === f.rel }" @click="openFile(f.rel)">
                <q-icon name="description" size="13px" aria-hidden="true" />
                <span class="font-mono">{{ f.label }}</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <section class="rv-viewer">
        <div v-if="!selected" class="rv-placeholder surface-card">
          <q-icon name="visibility" size="30px" aria-hidden="true" />
          <p>{{ placeholder }}</p>
        </div>

        <template v-else>
          <div class="rv-toolbar surface-card">
            <span class="rv-path font-mono">{{ viewer.rel }}</span>
            <q-space />
            <q-btn flat dense no-caps icon="delete" color="negative" :label="t('common.delete')" @click="confirmDelete = true" />
          </div>

          <div v-if="viewer.loading" class="rv-state surface-card"><q-spinner size="24px" /> {{ t('common.loading') }}</div>
          <div v-else-if="viewer.error" class="rv-state surface-card" role="alert">
            <q-icon name="error_outline" size="24px" color="negative" aria-hidden="true" />
            <p>{{ viewer.error }}</p>
          </div>
          <template v-else>
            <!-- The frontmatter card describes the entry point, not its siblings -->
            <FrontmatterCard
              v-if="isMain && parsed.present"
              :entries="parsed.entries"
              :keys="keys"
              :fallback-name="selected.name"
              :icon="icon"
              :no-description="noDescription"
            />
            <article class="rv-content surface-card">
              <MarkdownView :source="renderedBody" />
            </article>
          </template>
        </template>
      </section>
    </div>

    <q-dialog v-model="confirmDelete">
      <q-card class="rv-del surface-card">
        <div class="rv-del-head">
          <q-icon name="warning" color="negative" size="22px" aria-hidden="true" />
          <div>
            <div class="rv-del-title">{{ deleteTitle }}</div>
            <div class="rv-del-path font-mono">
              {{ selected ? deletePathFor(selected.rel) : '' }}
            </div>
          </div>
        </div>
        <p class="rv-del-note">{{ deleteNote }}</p>
        <div class="rv-del-actions">
          <q-btn flat no-caps dense :label="t('common.cancel')" @click="confirmDelete = false" />
          <q-btn unelevated no-caps dense color="negative" :label="t('common.delete')" :loading="deleting" @click="doDelete" />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
  // Read-only browser for the Markdown resources Claude writes for itself (skills,
  // agents): a list, a frontmatter reference card, and the body as prose. The only
  // write is deletion, which the BFF backs up first. Editing lives with Claude, not
  // with this UI — which is why there is no form here.
  import MarkdownView from '@/components/replay/MarkdownView.vue'
  import FrontmatterCard from '@/components/resources/FrontmatterCard.vue'
  import { useNotify } from '@/composables/useNotify'
  import { listDir, readFile, deleteResource, ClaudeApiError, type ResourceItem } from '@/services/claude'
  import { parseDoc, type KeySpec } from '@/utils/resourceFrontmatter'
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useI18n } from 'vue-i18n'

  const props = defineProps<{
    title: string
    subtitle: string
    icon: string
    loader: () => Promise<{ items: ResourceItem[] }>
    /** The frontmatter vocabulary of this resource type. */
    keys: KeySpec[]
    /** What /delete removes for a given entry: the file itself, or its folder. */
    deletePathFor: (rel: string) => string
    /** When set, sibling files of the entry point are listed and browsable. */
    refsDir?: (rel: string) => string
    /** When set, each entry shows an identity dot of this colour instead of `icon`. */
    accentFor?: (it: ResourceItem) => string
    emptyLabel: string
    placeholder: string
    noDescription: string
    deleteTitle: string
    deleteNote: string
  }>()

  const { t } = useI18n()
  const { notifyError, notifyDone } = useNotify()

  const items = ref<ResourceItem[]>([])
  const loading = ref(true)
  const selected = ref<ResourceItem | null>(null)
  const confirmDelete = ref(false)
  const deleting = ref(false)
  const refFiles = ref<{ rel: string; label: string }[]>([])

  const viewer = reactive({ rel: '', content: '', ext: '', loading: false, error: '' })

  const hasRefs = computed(() => props.refsDir !== undefined)

  const EXT_LANG: Record<string, string> = {
    json: 'json',
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    bash: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    py: 'python',
  }

  const isMain = computed(() => selected.value !== null && viewer.rel === selected.value.rel)
  const parsed = computed(() => parseDoc(viewer.content))

  /** Markdown renders as prose; anything else is shown as a fenced code block. */
  const renderedBody = computed(() => {
    if (viewer.ext === 'md') return isMain.value ? parsed.value.body : viewer.content
    return `\`\`\`${EXT_LANG[viewer.ext] ?? ''}\n${viewer.content}\n\`\`\``
  })

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      items.value = (await props.loader()).items
    } catch (e) {
      notifyError(e, t('resources.errors.list'))
    } finally {
      loading.value = false
    }
  }

  /** Walk the resource folder (one level of sub-folders is enough in practice). */
  async function loadRefs(dir: string, mainRel: string): Promise<void> {
    refFiles.value = []
    const out: { rel: string; label: string }[] = []
    try {
      for (const e of (await listDir(dir)).entries) {
        if (e.kind === 'file') {
          if (e.rel !== mainRel) out.push({ rel: e.rel, label: e.name })
        } else {
          for (const f of (await listDir(e.rel)).entries.filter((x) => x.kind === 'file')) {
            out.push({ rel: f.rel, label: `${e.name}/${f.name}` })
          }
        }
      }
    } catch {
      // A resource with no readable sub-tree still shows its entry point.
    }
    refFiles.value = out.sort((a, b) => a.label.localeCompare(b.label))
  }

  async function selectItem(it: ResourceItem): Promise<void> {
    selected.value = it
    const refsDir = props.refsDir
    await Promise.all([openFile(it.rel), refsDir ? loadRefs(refsDir(it.rel), it.rel) : Promise.resolve()])
  }

  async function openFile(rel: string): Promise<void> {
    viewer.rel = rel
    viewer.content = ''
    viewer.error = ''
    viewer.ext = rel.split('.').pop()?.toLowerCase() ?? ''
    viewer.loading = true
    try {
      viewer.content = (await readFile(rel)).content
    } catch (e) {
      viewer.error = e instanceof ClaudeApiError && e.status === 404 ? 'Fichier introuvable.' : e instanceof Error ? e.message : 'Lecture impossible.'
    } finally {
      viewer.loading = false
    }
  }

  async function doDelete(): Promise<void> {
    if (!selected.value) return
    deleting.value = true
    try {
      await deleteResource(props.deletePathFor(selected.value.rel))
      notifyDone(t('resources.deleted'), t('resources.deletedNote'))
      confirmDelete.value = false
      selected.value = null
      refFiles.value = []
      viewer.rel = ''
      viewer.content = ''
      await refresh()
    } catch (e) {
      notifyError(e, t('resources.errors.delete'))
    } finally {
      deleting.value = false
    }
  }

  onMounted(refresh)
</script>

<style scoped lang="scss">
  .rv {
    position: relative;
    padding: var(--space-md) var(--space-xl) var(--space-xl);
    width: 100%;
  }
  .rv-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    margin-bottom: var(--space-md);
  }
  .rv-header-icon {
    color: var(--faint);
  }
  .rv-sub {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    margin: 0;
  }
  .rv-ro {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--fs-xs);
    color: var(--dim);
  }

  .rv-body {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: var(--space-lg);
    align-items: start;
  }
  @media (max-width: 800px) {
    .rv-body {
      grid-template-columns: 1fr;
    }
  }

  /* ── List ─────────────────────────────────────────────────────────────────── */
  .rv-list {
    padding: var(--space-xs);
    max-height: calc(100vh - 200px);
    overflow: auto;
  }
  .rv-item + .rv-item {
    margin-top: 2px;
  }
  .rv-item-btn {
    display: flex;
    align-items: flex-start;
    gap: var(--space-xs);
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    cursor: pointer;
    color: var(--text);
    transition: background var(--motion-fast);
  }
  .rv-item-btn:hover {
    background: var(--hover-overlay);
  }
  .rv-item-btn--active {
    background: var(--brand-soft);
  }
  .rv-item-btn:focus-visible {
    outline: 2px solid var(--brand-line);
    outline-offset: -2px;
  }
  .rv-item-chevron {
    color: var(--muted);
    margin-top: 2px;
    flex: 0 0 auto;
  }
  /* Sized and offset to sit where the 16px icon it replaces would have. */
  .rv-item-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
    margin: 6px 4px 0;
  }
  .rv-item-btn--active .rv-item-chevron {
    color: var(--brand);
  }
  .rv-item-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    min-width: 0;
  }
  .rv-item-name {
    font-size: var(--fs-base);
    font-weight: 500;
  }
  .rv-item-desc {
    font-size: var(--fs-xs);
    color: var(--muted);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Vertical rule ties the reference files to the resource that owns them. */
  .rv-refs {
    list-style: none;
    margin: 2px 0 var(--space-xs) calc(var(--space-md) + 8px);
    padding-left: var(--space-md);
    border-left: 1px solid var(--line-2);
  }
  .rv-ref {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    background: transparent;
    border: none;
    border-radius: var(--radius-xs);
    padding: var(--space-xs) var(--space-sm);
    color: var(--muted);
    font-size: var(--fs-xs);
    cursor: pointer;
    text-align: left;
    transition:
      color var(--motion-fast),
      background var(--motion-fast);
  }
  .rv-ref:hover {
    color: var(--text);
    background: var(--hover-overlay);
  }
  .rv-ref--active {
    color: var(--brand);
  }
  .rv-ref:focus-visible {
    outline: 2px solid var(--brand-line);
    outline-offset: -2px;
  }

  /* ── Viewer ───────────────────────────────────────────────────────────────── */
  .rv-viewer {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    min-width: 0;
  }
  .rv-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
  }
  .rv-path {
    font-size: var(--fs-sm);
    color: var(--muted);
    word-break: break-all;
  }
  .rv-content {
    padding: var(--space-lg);
    min-width: 0;
    overflow-x: auto;
  }
  .rv-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-xl);
    color: var(--muted);
    font-size: var(--fs-sm);
  }
  .rv-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-xl);
    min-height: 320px;
    color: var(--dim);
    font-size: var(--fs-sm);
  }
  .rv-empty {
    padding: var(--space-lg);
    color: var(--muted);
    font-size: var(--fs-sm);
    text-align: center;
  }

  /* ── Delete dialog ────────────────────────────────────────────────────────── */
  .rv-del {
    width: 460px;
    max-width: 92vw;
    padding: var(--space-lg);
  }
  .rv-del-head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
  }
  .rv-del-title {
    font-size: var(--fs-lg);
    font-weight: 600;
  }
  .rv-del-path {
    font-size: var(--fs-sm);
    color: var(--muted);
    margin-top: 2px;
    word-break: break-all;
  }
  .rv-del-note {
    color: var(--muted);
    font-size: var(--fs-sm);
    margin: var(--space-md) 0;
  }
  .rv-del-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }
</style>
