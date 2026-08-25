<template>
  <q-page class="mem">
    <h1 class="sr-only">{{ t('nav.memory') }}</h1>

    <div class="backdrop-grid" aria-hidden="true"></div>

    <header class="mem-head">
      <q-icon name="psychology" size="15px" class="mem-head-icon" aria-hidden="true" />
      <p class="mem-sub">{{ t('pages.memory.sub') }}</p>
    </header>

    <div class="mem-body">
      <!-- List -->
      <aside class="mem-list surface-card">
        <div v-if="loading" class="mem-empty">{{ t('common.loading') }}</div>

        <!-- La mémoire globale n'appartient à aucun projet : elle reste en tête,
             hors de l'arbre, comme le seul fichier que Claude Code lit partout. -->
        <div class="mem-group">
          <div class="section-label mem-global-label">{{ t('pages.memory.global') }}</div>
          <button class="mem-item" :class="{ 'mem-item--active': selected === 'CLAUDE.md' }" @click="selectPlain('CLAUDE.md')">
            <span class="mem-item-name"><q-icon name="public" size="14px" aria-hidden="true" /> CLAUDE.md</span>
            <span class="mem-item-desc">{{ t('pages.memory.globalHint') }}</span>
          </button>
        </div>

        <!-- Un projet par nœud, replié. La liste à plat faisait défiler vingt-deux
             projets pour atteindre le dernier ; repliée, elle tient à l'écran. -->
        <div v-for="p in projects" :key="p.slug" class="mem-group">
          <div class="mem-group-head">
            <button
              type="button"
              class="mem-group-toggle section-label"
              :aria-expanded="isOpen(p.slug)"
              :aria-label="isOpen(p.slug) ? t('common.collapse', { label: prettySlug(p.slug) }) : t('common.expand', { label: prettySlug(p.slug) })"
              @click="toggle(p.slug)"
            >
              <q-icon :name="isOpen(p.slug) ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
              <q-icon name="folder_open" size="13px" aria-hidden="true" />
              <span class="mem-group-name" :title="p.slug">{{ prettySlug(p.slug) }}</span>
              <span class="mem-group-count font-mono">{{ countOf(p) }}</span>
            </button>
            <q-btn
              flat
              dense
              round
              size="xs"
              icon="add"
              :aria-label="t('pages.memory.newIn', { project: prettySlug(p.slug) })"
              @click="startNew(p)"
            />
          </div>

          <div v-if="isOpen(p.slug)" class="mem-children">
            <button
              v-if="p.indexRel"
              class="mem-item mem-item--index"
              :class="{ 'mem-item--active': selected === p.indexRel }"
              @click="selectPlain(p.indexRel)"
            >
              <span class="mem-item-name"><q-icon name="toc" size="14px" aria-hidden="true" /> MEMORY.md</span>
              <span class="mem-item-desc">{{ t('pages.memory.indexHint') }}</span>
            </button>

            <!-- Le type se lit sur l'arête gauche plutôt que dans une étiquette :
                 à cette largeur, le badge prenait la place du titre. Sans
                 infobulle, il ne reste que la couleur à l'écran — le nom du type
                 passe donc par `aria-label`, qui le dit sans rien afficher. -->
            <button
              v-for="it in p.items"
              :key="it.rel"
              class="mem-item"
              :class="[{ 'mem-item--active': selected === it.rel }, it.type ? `mem-item--${it.type}` : '']"
              :aria-label="it.type ? `${it.title} — ${it.type}` : it.title"
              @click="selectStructured(it.rel)"
            >
              <span class="mem-item-name">{{ it.title }}</span>
              <span v-if="it.description" class="mem-item-desc">{{ it.description }}</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- Editor -->
      <section class="mem-editor surface-card">
        <div v-if="!editing" class="mem-empty mem-empty--big">
          {{ t('pages.memory.pick') }}
        </div>
        <template v-else>
          <div class="mem-toolbar">
            <div v-if="crumb" class="mem-crumb">
              <q-icon :name="crumb.icon" size="14px" class="mem-crumb-icon" aria-hidden="true" />
              <span class="mem-crumb-scope">{{ crumb.scope }}</span>
              <q-icon name="chevron_right" size="14px" class="mem-crumb-sep" aria-hidden="true" />
              <span class="mem-crumb-file font-mono">{{ crumb.file }}</span>
              <q-tooltip v-if="targetRel" class="font-mono">{{ targetRel }}</q-tooltip>
            </div>
            <span v-if="isNew" class="re-badge re-badge--new font-mono">
              {{ t('pages.memory.newBadge') }}
            </span>
            <q-space />
            <span v-if="dirty" class="dirty-pill font-mono">
              <span class="status-dot status-dot--brand" aria-hidden="true" />
              {{ t('common.unsaved') }}
            </span>
            <q-btn
              v-if="mode === 'structured'"
              flat
              dense
              no-caps
              icon="delete"
              color="negative"
              :label="t('common.delete')"
              :disable="isNew"
              @click="confirmDelete = true"
            />
            <q-btn flat dense no-caps :label="t('common.refresh')" :disable="isNew || loadingFile" @click="reload" />
            <q-btn
              unelevated
              no-caps
              dense
              color="primary"
              text-color="dark"
              :label="t('common.propose')"
              :disable="!dirty || proposing || !!nameError"
              :loading="proposing"
              @click="propose"
            />
          </div>

          <div class="mem-scroll">
            <!-- Structured memory: frontmatter fields -->
            <div v-if="mode === 'structured'" class="mem-fields">
              <div class="mem-field">
                <label class="mem-field-label">{{ t('pages.memory.fields.name') }} <code class="mem-field-key font-mono">name</code></label>
                <!-- Pour une mémoire neuve, ce champ nomme aussi le fichier :
                     d'où le message sous le champ plutôt qu'au moment d'écrire. -->
                <input
                  :value="name"
                  class="mem-ctl font-mono"
                  spellcheck="false"
                  :aria-label="t('pages.memory.fields.name')"
                  :placeholder="isNew ? t('pages.memory.namePlaceholder') : ''"
                  :aria-invalid="!!nameError"
                  :aria-describedby="nameError ? nameErrId : undefined"
                  @input="name = onVal($event)"
                />
                <p v-if="nameError" :id="nameErrId" class="mem-field-error" role="alert">
                  {{ nameError }}
                </p>
              </div>
              <div class="mem-field">
                <label class="mem-field-label"
                  >{{ t('pages.memory.fields.description') }} <code class="mem-field-key font-mono">description</code></label
                >
                <textarea
                  :value="description"
                  rows="2"
                  class="mem-ctl"
                  spellcheck="false"
                  :aria-label="t('pages.memory.fields.description')"
                  @input="description = onVal($event)"
                />
              </div>
              <div class="mem-field">
                <label class="mem-field-label">{{ t('pages.memory.fields.type') }} <code class="mem-field-key font-mono">metadata.type</code></label>
                <div class="type-chips">
                  <button
                    v-for="ty in TYPES"
                    :key="ty"
                    type="button"
                    class="badge type-chip"
                    :class="[`badge--${ty}`, { 'type-chip--on': type === ty }]"
                    :aria-pressed="type === ty"
                    @click="type = ty"
                  >
                    {{ ty }}
                    <q-tooltip max-width="300px">{{ typeInfo[ty] }}</q-tooltip>
                  </button>
                </div>
              </div>
            </div>

            <!-- Body (structured) or whole file (plain) -->
            <div class="mem-bodyfield">
              <div class="mem-bodyfield-head">
                <label class="mem-field-label" :for="bodyId">
                  {{ mode === 'structured' ? t('pages.memory.fields.content') : t('pages.memory.fields.file') }}
                  <code class="mem-field-key font-mono">markdown</code>
                </label>
                <SegmentedControl v-model="view" :options="viewOptions" :aria-label="t('pages.memory.viewAria')" />
              </div>
              <textarea
                v-if="view === 'edit'"
                :id="bodyId"
                v-model="source"
                class="mem-editor-area font-mono"
                spellcheck="false"
                :aria-label="mode === 'structured' ? t('pages.memory.fields.content') : t('pages.memory.fields.file')"
                :placeholder="bodyPlaceholder"
              />
              <!-- Relative links (MEMORY.md's pointer lines) select their target instead of navigating. -->
              <div v-else class="mem-preview" @click="onPreviewClick">
                <div v-if="!source.trim()" class="mem-empty">
                  {{ t('pages.memory.emptyBody') }}
                </div>
                <MarkdownView v-else :source="source" />
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>

    <ConfirmDiffDialog :proposal="proposal" @applied="onApplied" @close="proposal = null" />

    <q-dialog v-model="confirmDelete">
      <q-card class="cfm-card surface-card">
        <div class="cfm-head">
          <q-icon name="warning" color="negative" size="22px" />
          <div>
            <div class="cfm-title">{{ t('pages.memory.deleteTitle') }}</div>
            <div class="cfm-path font-mono">{{ selected }}</div>
          </div>
        </div>
        <p class="cfm-note">{{ t('pages.memory.deleteNote') }}</p>
        <div class="cfm-actions">
          <q-btn flat no-caps dense :label="t('common.cancel')" @click="confirmDelete = false" />
          <q-btn unelevated no-caps dense color="negative" :label="t('common.delete')" :loading="deleting" @click="doDelete" />
        </div>
      </q-card>
    </q-dialog>

    <!--
      Quitter un travail en cours est une décision : elle se prend dans la même
      carte que les autres, pas dans la boîte grise du navigateur.
    -->
    <q-dialog :model-value="pending !== null" @update:model-value="(v) => !v && (pending = null)">
      <q-card class="cfm-card surface-card">
        <div class="cfm-head">
          <q-icon name="warning" color="warning" size="22px" />
          <div>
            <div class="cfm-title">{{ t('pages.memory.discard') }}</div>
            <div v-if="targetRel" class="cfm-path font-mono">{{ targetRel }}</div>
          </div>
        </div>
        <p class="cfm-note">{{ t('pages.memory.discardNote') }}</p>
        <div class="cfm-actions">
          <q-btn flat no-caps dense :label="t('common.cancel')" @click="pending = null" />
          <q-btn unelevated no-caps dense color="negative" :label="t('pages.memory.discardConfirm')" @click="runPending" />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
  import ConfirmDiffDialog from '@/components/ConfirmDiffDialog.vue'
  import MarkdownView from '@/components/replay/MarkdownView.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import { useFrontmatterForm } from '@/composables/useFrontmatterForm'
  import { useNotify } from '@/composables/useNotify'
  import {
    getMemories,
    readFile,
    propose as proposeWrite,
    deleteResource,
    syncMemoryIndex,
    ClaudeApiError,
    type MemoryProject,
    type Proposal,
  } from '@/services/claude'
  import { slug, prettyProjectSlug } from '@/utils/slug'
  import { onMounted, ref, reactive, computed, watch, useId } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()

  // Les quatre types du format, dans leur ordre de déclaration. Ce sont des clés
  // écrites telles quelles dans le fichier : seule leur explication se traduit.
  const TYPES = ['user', 'feedback', 'project', 'reference'] as const

  const typeInfo = computed<Record<string, string>>(() => Object.fromEntries(TYPES.map((k) => [k, t(`pages.memory.types.${k}`)])))

  const viewOptions = computed(() => [
    { label: t('pages.memory.viewEdit'), value: 'edit' as const },
    { label: t('pages.memory.viewPreview'), value: 'preview' as const },
  ])

  const { notifyError, notifyDone, notifyWarn } = useNotify()
  const bodyId = useId()
  const nameErrId = useId()

  const projects = ref<MemoryProject[]>([])
  const loading = ref(true)

  const selected = ref<string | null>(null)
  const mode = ref<'plain' | 'structured'>('plain')
  const content = ref('')
  const original = ref('')
  const isNew = ref(false)
  const loadingFile = ref(false)
  const proposing = ref(false)
  const proposal = ref<Proposal | null>(null)
  const confirmDelete = ref(false)
  const deleting = ref(false)

  /** Le dossier `memory/` qui accueille la mémoire en cours de création. */
  const newDir = ref<string | null>(null)

  // L'ossature attendue des mémoires qui doivent se justifier. Ces deux libellés
  // sont du format, pas de l'interface : ils restent en anglais, non traduits.
  const STARTERS: Record<string, string> = {
    feedback: '\n\n**Why:**\n\n**How to apply:**\n',
    project: '\n\n**Why:**\n\n**How to apply:**\n',
  }

  const bodyPlaceholder = computed(() => {
    if (loadingFile.value) return t('common.loading')
    return isNew.value ? t('pages.memory.bodyPlaceholder') : ''
  })

  const { field, nestedField, body } = useFrontmatterForm(content)
  const name = field('name')
  const description = field('description')
  const type = nestedField('metadata', 'type', 'project')

  // Une mémoire neuve n'a pas encore de fichier : son chemin se déduit du champ
  // `name`, tant qu'elle n'est pas appliquée. C'est ce qui permet de la créer dans
  // l'éditeur lui-même, sans écran intermédiaire pour réclamer un nom de fichier.
  const targetRel = computed(() => {
    if (!isNew.value) return selected.value ?? ''
    const s = slug(name.value)
    return newDir.value && s ? `${newDir.value}/${s}.md` : ''
  })
  const editing = computed(() => isNew.value || selected.value !== null)

  // L'index vit dans le même dossier et Windows ignore la casse : un `name` de
  // `memory` entrerait en collision avec `MEMORY.md`.
  const nameTaken = computed(() => {
    const rel = targetRel.value.toLowerCase()
    if (!isNew.value || !rel) return false
    return projects.value.some((p) => p.indexRel?.toLowerCase() === rel || p.items.some((i) => i.rel.toLowerCase() === rel))
  })
  /** Ce qui empêche encore d'écrire une mémoire neuve, le cas échéant. */
  const nameError = computed(() => {
    if (!isNew.value) return ''
    if (!targetRel.value) return t('pages.memory.nameRequired')
    return nameTaken.value ? t('pages.memory.nameTaken') : ''
  })

  // Le type décide de l'ossature du corps. On ne la repose que sur un corps encore
  // vierge — sinon changer d'avis effacerait ce qui vient d'être écrit.
  watch(type, (ty, prev) => {
    if (!isNew.value) return
    const current = body.value.trim()
    if (current === '' || current === (STARTERS[prev] ?? '').trim()) {
      body.value = STARTERS[ty] ?? ''
    }
  })

  // A structured memory edits/previews its body only — the frontmatter is already
  // bound to the fields above. A plain file (CLAUDE.md, MEMORY.md) works as a whole.
  // Reading is the common case, so a memory opens rendered; `startNew` flips to edit.
  const view = ref<'edit' | 'preview'>('preview')
  const source = computed<string>({
    get: () => (mode.value === 'structured' ? body.value : content.value),
    set: (v) => {
      if (mode.value === 'structured') body.value = v
      else content.value = v
    },
  })

  const dirty = computed(() => content.value !== original.value)
  function onVal(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement).value
  }

  const prettySlug = prettyProjectSlug

  // ── Arbre des projets ───────────────────────────────────────────────────────
  //
  // Replié par défaut, et non l'inverse : vingt-deux projets dépliés font une
  // colonne qu'on parcourt au défilement, alors que leurs noms tiennent tous à
  // l'écran. Le projet dont une mémoire est ouverte s'ouvre de lui-même — au
  // chargement comme après un clic sur un lien du sommaire.
  const opened = reactive<Record<string, boolean>>({})
  function isOpen(slug: string): boolean {
    return opened[slug] === true
  }
  function toggle(slug: string): void {
    opened[slug] = !opened[slug]
  }

  /** Ce que le projet contient : ses mémoires, plus son index s'il en a un. */
  function countOf(p: MemoryProject): number {
    return p.items.length + (p.indexRel ? 1 : 0)
  }

  watch([selected, projects], () => {
    const rel = selected.value
    if (!rel) return
    const owner = projects.value.find((p) => rel === p.indexRel || p.items.some((i) => i.rel === rel))
    if (owner) opened[owner.slug] = true
  })

  // The stored path carries an encoded project slug ("C--…-projets-aura"), unreadable
  // as-is. Show "projet › fichier"; the real path stays available in the tooltip.
  const crumb = computed(() => {
    if (!editing.value) return null
    const rel = targetRel.value
    // Le nom du fichier suit le champ `name` : tant qu'il est vide, il n'y a pas
    // encore de fichier à nommer.
    const file = rel ? (rel.split('/').pop() ?? rel) : t('pages.memory.unnamed')
    if (rel === 'CLAUDE.md') return { icon: 'public', scope: t('pages.memory.global'), file }

    const dir = isNew.value ? newDir.value : null
    const p = projects.value.find((x) => (dir ? x.memRel === dir : rel === x.indexRel || rel.startsWith(`${x.memRel}/`)))
    const scope = p ? prettySlug(p.slug) : t('pages.memory.projectScope')
    const icon = p && rel === p.indexRel ? 'toc' : 'article'
    return { icon, scope, file }
  })

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      projects.value = (await getMemories()).projects
    } catch (e) {
      notifyError(e, t('pages.memory.readError'))
    } finally {
      loading.value = false
    }
  }

  async function load(rel: string): Promise<void> {
    loadingFile.value = true
    try {
      const { content: c } = await readFile(rel)
      content.value = c
      original.value = c
    } catch (e) {
      if (e instanceof ClaudeApiError && e.status === 404) {
        content.value = ''
        original.value = ''
      } else {
        notifyError(e, t('pages.memory.openError'))
      }
    } finally {
      loadingFile.value = false
    }
  }

  // Changer de fichier abandonnerait ce qui n'a pas été appliqué : l'action est
  // mise en attente le temps que l'utilisateur tranche, puis rejouée telle quelle.
  const pending = ref<(() => void) | null>(null)

  function guardDirty(action: () => void): void {
    if (dirty.value) pending.value = action
    else action()
  }

  function runPending(): void {
    const action = pending.value
    pending.value = null
    action?.()
  }

  async function openFile(rel: string, m: 'plain' | 'structured'): Promise<void> {
    selected.value = rel
    mode.value = m
    isNew.value = false
    newDir.value = null
    await load(rel)
  }

  function selectPlain(rel: string): void {
    return guardDirty(() => void openFile(rel, 'plain'))
  }
  function selectStructured(rel: string): void {
    return guardDirty(() => void openFile(rel, 'structured'))
  }

  function reload(): Promise<void> {
    return selected.value ? load(selected.value) : Promise.resolve()
  }

  /** Resolve a relative href against a directory, honouring `.` and `..` segments. */
  function resolveRel(dir: string, href: string): string {
    const parts = dir ? dir.split('/') : []
    for (const seg of href.split('/')) {
      if (seg === '' || seg === '.') continue
      if (seg === '..') parts.pop()
      else parts.push(seg)
    }
    return parts.join('/')
  }

  /** Open the memory a relative link points at; leave external links to the browser. */
  function onPreviewClick(e: MouseEvent): void {
    const a = (e.target as Element | null)?.closest('a[href]')
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    // Absolute URLs, protocol-relative URLs and in-page anchors keep their behaviour.
    if (!href || href.startsWith('#') || href.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return

    e.preventDefault()
    // Root-level files (CLAUDE.md) have no directory, hence slice() over a regex strip.
    const dir = (selected.value ?? '').split('/').slice(0, -1).join('/')
    const target = resolveRel(dir, decodeURIComponent(href.split(/[#?]/)[0] ?? ''))

    if (target === 'CLAUDE.md') return void selectPlain(target)
    for (const p of projects.value) {
      if (p.indexRel === target) return void selectPlain(target)
      if (p.items.some((i) => i.rel === target)) return void selectStructured(target)
    }
    notifyWarn(t('pages.memory.targetNotFound', { target }))
  }

  /**
   * Créer, c'est ouvrir un brouillon vide dans le même éditeur que la lecture —
   * rien n'est écrit sur le disque avant le cycle proposer / appliquer.
   */
  function startNew(p: MemoryProject): void {
    guardDirty(() => {
      selected.value = null
      newDir.value = p.memRel
      mode.value = 'structured'
      isNew.value = true
      view.value = 'edit' // a fresh memory opens on its body, ready to type
      original.value = ''
      // Les trois clés sont posées vides pour que les champs les remplacent *en
      // place* : ajoutées après coup, elles atterriraient sous le bloc `metadata`.
      content.value = `---
name:
description:
metadata:
  type: project
---
${STARTERS.project ?? ''}`
    })
  }

  async function propose(): Promise<void> {
    if (!targetRel.value || nameError.value) return
    // `name` est la cible des liens `[[nom]]` entre mémoires : il doit rejoindre
    // le nom du fichier plutôt que garder le texte libre de la saisie.
    if (isNew.value) name.value = slug(name.value)
    proposing.value = true
    try {
      proposal.value = await proposeWrite(targetRel.value, content.value)
    } catch (e) {
      notifyError(e, t('common.proposeError'))
    } finally {
      proposing.value = false
    }
  }

  async function onApplied(): Promise<void> {
    const created = isNew.value
    const rel = targetRel.value
    original.value = content.value
    // Le brouillon devient un fichier : le chemin cesse de suivre le champ `name`.
    selected.value = rel
    newDir.value = null
    isNew.value = false
    proposal.value = null
    // A brand-new structured memory: add its pointer line to MEMORY.md.
    if (created) await syncIndex(rel, 'add')
    await refresh()
  }

  /** Best-effort MEMORY.md maintenance (never blocks the main flow). */
  async function syncIndex(rel: string, action: 'add' | 'remove'): Promise<void> {
    const memRel = rel.replace(/\/[^/]+$/, '')
    const file = rel.split('/').pop() ?? ''
    try {
      const r = await syncMemoryIndex({
        memRel,
        action,
        file,
        title: name.value || file.replace(/\.md$/, ''),
        hook: description.value,
      })
      if (r.changed) {
        notifyDone(t('pages.memory.indexUpdated'))
      }
    } catch {
      /* index maintenance is best-effort */
    }
  }

  async function doDelete(): Promise<void> {
    if (selected.value === null) return
    const rel = selected.value
    deleting.value = true
    try {
      await deleteResource(rel)
      await syncIndex(rel, 'remove') // drop its pointer line from MEMORY.md
      notifyDone(t('pages.memory.deleted'), t('pages.memory.deletedNote'))
      confirmDelete.value = false
      selected.value = null
      content.value = ''
      original.value = ''
      await refresh()
    } catch (e) {
      notifyError(e, t('pages.memory.deleteError'))
    } finally {
      deleting.value = false
    }
  }

  onMounted(refresh)
</script>

<style scoped lang="scss">
  .mem {
    position: relative;
    padding: var(--space-md) var(--space-xl) var(--space-xl);
    width: 100%;

    // Une couleur par type de mémoire, déclarée une fois : l'étiquette et l'arête
    // gauche de la liste disent la même chose et ne peuvent plus diverger. Ces
    // teintes sont locales à cet écran — le vocabulaire global n'a pas de couleur
    // pour une taxonomie propre à un module.
    --type-user: #4aa8c0;
    --type-feedback: var(--warn);
    --type-project: var(--brand);
    --type-reference: #9b8cff;
  }
  .mem-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }
  .mem-head-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .mem-sub {
    color: var(--muted);
    font-size: var(--fs-sm);
    margin: 0;
  }

  .mem-body {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: var(--space-lg);
    align-items: start;
  }
  @media (max-width: 800px) {
    .mem-body {
      grid-template-columns: 1fr;
    }
  }

  /* ── List ─────────────────────────────────────────────────────────────────── */
  .mem-list {
    padding: var(--space-sm);
    max-height: calc(100vh - 180px);
    overflow: auto;
  }
  .mem-group {
    margin-bottom: var(--space-md);
  }
  .mem-group-head {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding-right: var(--space-sm);
  }
  .mem-global-label {
    display: block;
    padding: var(--space-xs) var(--space-sm);
  }
  /* Même anatomie que l'arbre des ressources d'un projet : chevron, icône, nom,
   compteur — pour que les deux colonnes se lisent de la même façon. */
  .mem-group-toggle {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast);
  }
  .mem-group-toggle:hover {
    background: var(--hover-overlay);
  }
  .mem-group-toggle:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .mem-group-toggle .q-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .mem-group-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mem-group-count {
    flex: 0 0 auto;
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
  /* Le trait d'appartenance de l'arbre, comme dans `RuleTree`. L'écart est plus
   large qu'ailleurs : les items portent eux-mêmes une arête colorée, et collée
   au trait de l'arbre elle se lisait comme un double filet. */
  .mem-children {
    display: flex;
    flex-direction: column;
    // Les mémoires sont des blocs de deux ou trois lignes : collées, leurs titres
    // et leurs descriptions se confondaient d'un item à l'autre.
    gap: var(--space-xs);
    margin-left: calc(var(--space-sm) + 6px);
    padding-left: var(--space-sm);
    border-left: 1px solid var(--line-2);
  }
  .mem-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    // L'arête porte le type ; transparente, elle réserve déjà sa place, si bien
    // qu'un fichier sans type ne décale pas les autres.
    border-left: 2px solid transparent;
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    cursor: pointer;
    color: var(--text);
    transition: background var(--motion-fast);
  }
  .mem-item--user {
    border-left-color: var(--type-user);
  }
  .mem-item--feedback {
    border-left-color: var(--type-feedback);
  }
  .mem-item--project {
    border-left-color: var(--type-project);
  }
  .mem-item--reference {
    border-left-color: var(--type-reference);
  }
  .mem-item:hover {
    background: var(--hover-overlay);
  }
  .mem-item--active {
    background: var(--brand-soft);
  }
  .mem-item--index .mem-item-name {
    color: var(--muted);
  }
  .mem-item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }
  .mem-item-name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--fs-base);
    font-weight: 500;
  }
  .mem-item-path {
    font-size: var(--fs-2xs);
    color: var(--dim);
  }
  .mem-item-desc {
    font-size: var(--fs-xs);
    color: var(--muted);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ── Type badges ──────────────────────────────────────────────────────────── */
  .badge {
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .badge--user {
    color: var(--type-user);
    background: rgba(74, 168, 192, 0.12);
    border-color: rgba(74, 168, 192, 0.3);
  }
  .badge--feedback {
    color: var(--type-feedback);
    background: rgba(224, 163, 62, 0.12);
    border-color: rgba(224, 163, 62, 0.3);
  }
  .badge--project {
    color: var(--type-project);
    background: var(--brand-soft);
    border-color: var(--brand-line);
  }
  .badge--reference {
    color: var(--type-reference);
    background: rgba(155, 140, 255, 0.12);
    border-color: rgba(155, 140, 255, 0.3);
  }

  /* ── Editor ───────────────────────────────────────────────────────────────── */
  .mem-editor {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 180px);
    overflow: hidden;
  }
  .mem-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  .mem-crumb {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
    font-size: var(--fs-sm);
    cursor: default;
  }
  .mem-crumb-icon,
  .mem-crumb-sep {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .mem-crumb-scope {
    color: var(--muted);
    white-space: nowrap;
  }
  .mem-crumb-file {
    color: var(--text);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .re-badge {
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 1px 6px;
    border-radius: var(--radius-xs);
  }
  .re-badge--new {
    background: var(--brand-soft);
    color: var(--brand);
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
  .mem-scroll {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
  .mem-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    border-bottom: 1px solid var(--line);
  }
  .mem-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .mem-field-label {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--text);
  }
  .mem-field-key {
    font-size: var(--fs-2xs);
    color: var(--dim);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    padding: 1px 5px;
  }
  .mem-field-error {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--danger);
  }
  .mem-ctl {
    width: 100%;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    font-size: var(--fs-sm);
    outline: none;
    resize: vertical;
    transition: border-color var(--motion-fast);
  }
  .mem-ctl:focus {
    border-color: var(--brand-line);
  }
  .type-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .type-chip {
    cursor: pointer;
    opacity: 0.55;
    transition: opacity var(--motion-fast);
  }
  .type-chip:hover {
    opacity: 0.85;
  }
  .type-chip--on {
    opacity: 1;
    box-shadow: 0 0 0 1px currentColor inset;
  }
  .mem-bodyfield {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-lg);
    min-height: 320px;
  }
  .mem-bodyfield-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    flex-wrap: wrap;
    margin-bottom: var(--space-xs);
  }
  /* Mirrors .mem-editor-area's box so toggling Éditer/Aperçu doesn't shift the layout. */
  .mem-preview {
    flex: 1;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--bg);
    padding: var(--space-md);
  }
  .mem-editor-area {
    flex: 1;
    width: 100%;
    resize: none;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    outline: none;
    background: var(--bg);
    color: var(--text);
    padding: var(--space-md);
    font-size: var(--fs-sm);
    line-height: 1.55;
    tab-size: 2;
  }
  .mem-editor-area:focus {
    border-color: var(--brand-line);
  }
  .mem-empty {
    padding: var(--space-lg);
    color: var(--muted);
    font-size: var(--fs-sm);
    text-align: center;
  }
  .mem-empty--big {
    margin: auto;
  }

  /* ── Confirmation dialogs ────────────────────────────────────────────────────────── */
  .cfm-card {
    width: 460px;
    max-width: 92vw;
    padding: var(--space-lg);
  }
  .cfm-head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
  }
  .cfm-title {
    font-size: var(--fs-lg);
    font-weight: 600;
  }
  .cfm-path {
    font-size: var(--fs-sm);
    color: var(--muted);
    margin-top: 2px;
    word-break: break-all;
  }
  .cfm-note {
    color: var(--muted);
    font-size: var(--fs-sm);
    margin: var(--space-md) 0;
  }
  .cfm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }
</style>
