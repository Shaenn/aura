<template>
  <q-page class="pd">
    <h1 class="sr-only">{{ t('pages.project.title', { name: detail?.name ?? slug }) }}</h1>
    <header class="pd-header">
      <q-icon
        v-if="detail?.path"
        name="folder"
        size="14px"
        class="pd-path-icon"
        aria-hidden="true"
      />
      <span v-if="detail?.path" class="pd-path font-mono" :title="winPath">{{ winPath }}</span>
      <span class="pd-ro font-mono">
        <q-icon name="lock" size="12px" />
        <i18n-t keypath="pages.project.readOnlyBanner" scope="global">
          <template #dir><span class="font-mono">.claude</span></template>
        </i18n-t>
      </span>
      <q-btn
        flat
        dense
        no-caps
        icon="refresh"
        :label="t('common.refresh')"
        class="pd-refresh"
        :disable="loading"
        @click="refresh"
      />
    </header>

    <!-- Loading -->
    <div v-if="loading" class="pd-skel">
      <q-skeleton type="rect" height="72px" class="q-mb-md" />
      <div class="pd-skel-split">
        <q-skeleton type="rect" height="360px" />
        <q-skeleton type="rect" height="360px" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="pd-state" role="alert">
      <q-icon name="error_outline" size="28px" color="negative" />
      <p>{{ error }}</p>
      <q-btn flat no-caps :label="t('common.retry')" @click="refresh" />
    </div>

    <template v-else-if="detail">
      <!-- Stats -->
      <ul class="pd-stats" :aria-label="t('pages.project.statsAria')">
        <li class="surface-card pd-stat">
          <q-icon name="tune" size="18px" aria-hidden="true" />
          <span class="pd-stat-val font-mono">{{ detail.resources.length }}</span>
          <span class="pd-stat-label">{{ t('pages.project.stats.resources') }}</span>
        </li>
        <li class="surface-card pd-stat">
          <q-icon name="forum" size="18px" aria-hidden="true" />
          <span class="pd-stat-val font-mono">{{ detail.transcripts.length }}</span>
          <span class="pd-stat-label">{{ t('pages.project.stats.sessions') }}</span>
        </li>
        <li class="surface-card pd-stat">
          <q-icon name="bolt" size="18px" aria-hidden="true" />
          <span class="pd-stat-val font-mono">{{ detail.hooks.length }}</span>
          <span class="pd-stat-label">{{ t('pages.project.stats.hooks') }}</span>
        </li>
        <li class="surface-card pd-stat">
          <q-icon name="data_usage" size="18px" aria-hidden="true" />
          <span class="pd-stat-val font-mono">{{ fmtBytes(claudeSize) }}</span>
          <span class="pd-stat-label">{{ t('pages.project.stats.claudeSize') }}</span>
        </li>
      </ul>

      <!-- Master-detail : navigateur de ressources + visionneuse inline -->
      <section class="pd-split" :aria-label="t('pages.project.splitAria')">
        <!-- Navigateur -->
        <nav class="surface-card pd-nav" :aria-label="t('pages.project.navAria')">
          <header class="pd-nav-head">
            <q-icon name="folder_open" size="16px" aria-hidden="true" />
            <span class="section-label">{{ t('pages.project.navTitle') }}</span>
            <span class="pd-count font-mono">{{ navCount }}</span>
          </header>

          <ProjectResourcesNav
            :resources="detail.resources"
            :memories="detail.memories"
            :repo-docs="detail.repoDocs"
            :folders="detail.folders"
            can-include
            :has-claude-dir="detail.hasClaudeDir"
            :active-resource-rel="activeResourceRel"
            :active-memory-rel="activeMemoryRel"
            :active-included-rel="activeIncludedRel"
            :plans="projectPlans"
            :active-plan-name="viewer.planName"
            @open-resource="openResource"
            @open-memory="openMemory"
            @open-included="openIncluded"
            @open-plan="openPlan"
            @include-folder="folderPicker = true"
            @exclude-folder="excludeFolder"
          />
        </nav>

        <!-- Visionneuse inline (remplace la popup) -->
        <article class="surface-card pd-viewer" :aria-label="t('pages.project.viewerAria')">
          <template v-if="hasSelection">
            <header class="pd-viewer-head">
              <q-icon :name="viewerIcon" size="16px" aria-hidden="true" />
              <span class="pd-viewer-name font-mono">
                {{ viewer.source === 'plan' ? viewer.planName : viewer.rel }}
              </span>
              <q-space />
              <!-- Un plan se supprime ; une ressource .claude reste en lecture seule. -->
              <q-btn
                v-if="viewer.source === 'plan'"
                flat
                dense
                no-caps
                color="negative"
                icon="delete"
                :label="t('common.delete')"
                @click="confirmPlanDelete = true"
              />
              <span v-else class="pd-ro font-mono"
                ><q-icon name="lock" size="12px" /> {{ t('common.readOnly') }}</span
              >
            </header>
            <div class="pd-viewer-body">
              <div v-if="viewer.loading" class="pd-viewer-loading">
                <q-spinner size="24px" /> {{ t('common.loading') }}
              </div>
              <div v-else-if="viewer.error" class="pd-state" role="alert">
                <q-icon name="error_outline" size="24px" color="negative" />
                <p>{{ viewer.error }}</p>
              </div>
              <template v-else>
                <!-- Même carte que les pages Skills et Agents. -->
                <FrontmatterCard
                  v-if="parsed.present"
                  class="pd-fm"
                  :entries="parsed.entries"
                  :keys="fmKeys"
                  :fallback-name="viewer.name"
                  :icon="categoryMeta?.icon ?? 'description'"
                  :no-description="t('pages.project.noDescription')"
                />
                <!-- Un fichier du disque : son balisage brut se rend, il ne
                     s'affiche pas. -->
                <MarkdownView :source="renderedBody" allow-html />
              </template>
            </div>
          </template>
          <div v-else class="pd-viewer-placeholder">
            <q-icon name="visibility" size="30px" aria-hidden="true" />
            <p>{{ t('pages.project.placeholder') }}</p>
          </div>
        </article>
      </section>

      <q-dialog v-model="confirmPlanDelete">
        <q-card class="pd-del surface-card">
          <div class="pd-del-title">{{ t('pages.project.deletePlanTitle') }}</div>
          <div class="pd-del-path font-mono">{{ viewer.planName }}</div>
          <div class="pd-del-actions">
            <q-btn
              flat
              no-caps
              dense
              :label="t('common.cancel')"
              @click="confirmPlanDelete = false"
            />
            <q-btn
              unelevated
              no-caps
              dense
              color="negative"
              :label="t('common.delete')"
              :loading="deletingPlan"
              @click="doDeletePlan"
            />
          </div>
        </q-card>
      </q-dialog>

      <!-- Hooks -->
      <section
        v-if="detail.hooks.length"
        class="surface-card pd-section"
        aria-labelledby="pd-hooks-title"
      >
        <header class="pd-section-head">
          <q-icon name="bolt" size="20px" aria-hidden="true" />
          <h2 id="pd-hooks-title">{{ t('nav.hooks') }}</h2>
          <span class="pd-count font-mono">{{ detail.hooks.length }}</span>
        </header>
        <ul class="pd-hooks">
          <li v-for="(h, i) in detail.hooks" :key="i" class="pd-hook">
            <span class="pd-hook-event font-mono">{{ h.event }}</span>
            <span v-if="h.matcher" class="pd-hook-matcher font-mono">{{ h.matcher }}</span>
            <span class="pd-hook-cmd font-mono">{{ h.command }}</span>
          </li>
        </ul>
      </section>

      <!-- Transcripts -->
      <section class="surface-card pd-section" aria-labelledby="pd-tr-title">
        <header class="pd-section-head">
          <q-icon name="forum" size="20px" aria-hidden="true" />
          <h2 id="pd-tr-title">{{ t('pages.project.sessions') }}</h2>
          <span class="pd-count font-mono">{{ detail.transcripts.length }}</span>
        </header>

        <q-table
          :rows="detail.transcripts"
          :columns="columns"
          :visible-columns="visibleColumns"
          row-key="id"
          :filter="trFilter"
          flat
          dense
          :rows-per-page-options="[15, 30, 50, 0]"
          class="pd-table"
          @row-click="onRowClick"
        >
          <template #top>
            <q-input
              v-model="trFilter"
              dense
              outlined
              clearable
              debounce="150"
              :placeholder="t('pages.project.filterPlaceholder')"
              class="pd-table-search"
              :aria-label="t('pages.project.filterAria')"
            >
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </template>

          <template #header-cell-cost="head">
            <q-th :props="head">
              {{ head.col.label }}
              <q-tooltip>{{ t('pages.project.costTooltip') }}</q-tooltip>
            </q-th>
          </template>

          <template #body-cell-session="cell">
            <q-td :props="cell">
              <router-link
                :to="{ name: 'session', params: { slug, id: cell.row.id } }"
                class="pd-session-link pd-prompt"
                >{{ cell.value || '—' }}</router-link
              >
              <q-icon
                v-if="cell.row.titleSource === 'custom'"
                name="label"
                size="13px"
                class="pd-title-badge"
              >
                <q-tooltip>{{ t('pages.project.customTitle') }}</q-tooltip>
              </q-icon>
              <q-icon
                v-if="cell.row.hasSidechain"
                name="account_tree"
                size="13px"
                class="pd-sub-badge"
              >
                <q-tooltip>{{ t('pages.project.hasSidechain') }}</q-tooltip>
              </q-icon>
              <!-- Untitled sessions show their opening prompt; say so, or the
                   column silently mixes two different kinds of text. -->
              <q-tooltip v-if="!cell.row.title && cell.row.firstPrompt">
                {{ t('pages.project.untitled') }}
              </q-tooltip>
            </q-td>
          </template>
          <!-- Les quatre colonnes du relevé. Une session jamais lancée n'en a
               aucune : elle affiche « — » plutôt qu'un zéro qu'on n'a pas mesuré. -->
          <template #body-cell-userTurns="cell">
            <q-td :props="cell" class="font-mono">
              {{ cell.row.metrics ? cell.value : '—' }}
            </q-td>
          </template>
          <template #body-cell-tokens="cell">
            <q-td :props="cell" class="font-mono">
              {{ cell.row.metrics ? fmtNum(cell.value) : '—' }}
            </q-td>
          </template>
          <template #body-cell-cost="cell">
            <q-td :props="cell" class="font-mono">
              <template v-if="cell.row.metrics">
                <span v-if="cell.row.metrics.costPartial" aria-hidden="true">≥&nbsp;</span>
                {{ fmtCost(cell.value) }}
                <q-tooltip v-if="cell.row.metrics.costPartial">
                  Un modèle de cette session n’a pas de tarif connu : le total est un plancher
                </q-tooltip>
              </template>
              <template v-else>—</template>
            </q-td>
          </template>
          <template #body-cell-duration="cell">
            <q-td :props="cell" class="font-mono">
              {{ cell.row.metrics ? fmtDuration(cell.value) : '—' }}
            </q-td>
          </template>
          <template #body-cell-mtime="cell">
            <q-td :props="cell" class="font-mono">{{ fmtDate(cell.value) }}</q-td>
          </template>
          <template #body-cell-size="cell">
            <q-td :props="cell" class="font-mono">{{ fmtBytes(cell.value) }}</q-td>
          </template>
          <template #no-data>
            <div class="pd-empty">{{ t('pages.project.noSession') }}</div>
          </template>
        </q-table>
      </section>
    </template>

    <!-- Hors du bloc conditionnel : appliquer une sélection recharge le projet,
         et `loading` démonterait le dialogue au moment même où l'on s'en sert. -->
    <IncludeFolderDialog
      v-model="folderPicker"
      :slug="slug"
      :included="settings.foldersOf(slug)"
      @apply="applyFolders"
    />
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar, type QTableColumn } from 'quasar';
import { useNotify } from '@/composables/useNotify';
import {
  getProjectDetail,
  getProjectPlans,
  readResource,
  readMemory,
  readIncludedFile,
  type ProjectDetail,
  type ResourceNode,
  type ResourceCategory,
  type TranscriptSummary,
} from '@/services/projects';
import { readPlan, deletePlan, type PlanInfo } from '@/services/system';
import { fmtBytes, fmtCost, fmtDate, fmtDuration, fmtNum } from '@/utils/format';
import { setBreadcrumbs } from '@/composables/useBreadcrumbs';
import MarkdownView from '@/components/replay/MarkdownView.vue';
import FrontmatterCard from '@/components/resources/FrontmatterCard.vue';
import ProjectResourcesNav from '@/components/resources/ProjectResourcesNav.vue';
import IncludeFolderDialog from '@/components/resources/IncludeFolderDialog.vue';
import {
  CATEGORY_META,
  FM_KEYS,
  renderBody,
  treeCount,
} from '@/components/resources/projectResources';
import { parseDoc, type KeySpec } from '@/utils/resourceFrontmatter';
import { useSettingsStore } from '@/stores/settings';

const props = defineProps<{ slug: string }>();
const { t } = useI18n();
// Les dossiers inclus sont une préférence, et le BFF relit cette même clé pour
// décider de ce qu'il ouvre. D'où le magasin plutôt qu'un état local.
const settings = useSettingsStore();
const router = useRouter();
const $q = useQuasar();
const { notifyError, notifyDone } = useNotify();

const detail = ref<ProjectDetail | null>(null);
const loading = ref(true);
const error = ref('');
const trFilter = ref('');

// Plans this project produced. They live in ~/.claude/plans, NOT in the project's
// .claude — so they stay out of `detail.resources`, whose length and sizes feed
// the « Ressources » and « Poids .claude » stats.
const projectPlans = ref<PlanInfo[]>([]);

// Le compteur de l'arbre annonce ce que l'arbre montre — plans et dossiers
// inclus compris, puisque cette page les affiche. Le carré « Ressources » de
// l'en-tête, lui, ne compte que le `.claude` : il fait la paire avec son poids.
const navCount = computed(() =>
  detail.value ? treeCount({ ...detail.value, plans: projectPlans.value }) : 0,
);

const winPath = computed(() => (detail.value?.path ? detail.value.path.replace(/\//g, '\\') : ''));
const claudeSize = computed(() =>
  detail.value ? detail.value.resources.reduce((sum, r) => sum + r.size, 0) : 0,
);

// L'ordre et le vocabulaire des catégories viennent du même module que le
// navigateur : la page ne s'en sert plus que pour la présélection au chargement
// et pour l'icône de la visionneuse.
const resourceGroups = computed(() => {
  const d = detail.value;
  if (!d) return [];
  return CATEGORY_META.map((m) => ({
    ...m,
    items: d.resources.filter((r) => r.category === m.key),
  })).filter((g) => g.items.length);
});

/**
 * Ce que vaut une session sans relevé de coût, pour le tri.
 *
 * Une session jamais lancée n'a pas consommé zéro : on ne sait rien d'elle. Ce
 * sentinelle la range sous toutes les autres, donc en bloc à une extrémité du
 * tri, plutôt que mêlée aux sessions réellement mesurées à 0.
 */
const NO_METRIC = -1;

const columns = computed<QTableColumn[]>(() => [
  // Sessions carry a real title (typed, or generated and kept current); the
  // opening prompt is only the fallback for the ones that were never named.
  {
    name: 'session',
    label: t('pages.project.columns.session'),
    field: (row: TranscriptSummary) => row.title || row.firstPrompt,
    align: 'left',
    sortable: true,
  },
  // Les tours *de l'humain* : ni les échos de résultats d'outil, ni les
  // injections du harness. C'est le chiffre de la page Diagnostic, pas un
  // décompte de lignes du fichier.
  {
    name: 'userTurns',
    label: t('pages.project.columns.userTurns'),
    field: (row: TranscriptSummary) => row.metrics?.userTurns ?? NO_METRIC,
    align: 'right',
    sortable: true,
  },
  {
    name: 'tokens',
    label: t('pages.project.columns.tokens'),
    field: (row: TranscriptSummary) => row.metrics?.tokens ?? NO_METRIC,
    align: 'right',
    sortable: true,
  },
  {
    name: 'cost',
    label: t('pages.project.columns.cost'),
    field: (row: TranscriptSummary) => row.metrics?.costUsd ?? NO_METRIC,
    align: 'right',
    sortable: true,
  },
  {
    name: 'duration',
    label: t('pages.project.columns.duration'),
    field: (row: TranscriptSummary) => row.metrics?.durationMs ?? NO_METRIC,
    align: 'right',
    sortable: true,
  },
  {
    name: 'gitBranch',
    label: t('pages.project.columns.gitBranch'),
    field: 'gitBranch',
    align: 'left',
    sortable: true,
  },
  {
    name: 'size',
    label: t('pages.project.columns.size'),
    field: 'size',
    align: 'right',
    sortable: true,
  },
  {
    name: 'mtime',
    label: t('pages.project.columns.mtime'),
    field: 'mtime',
    align: 'right',
    sortable: true,
  },
]);

// Huit colonnes tiennent sur un écran large, pas sur un étroit. Les deux qui
// partent les premières sont celles qu'on peut retrouver dans la session ouverte.
const visibleColumns = computed(() =>
  columns.value
    .map((c) => c.name)
    .filter((n) => !($q.screen.lt.md && (n === 'gitBranch' || n === 'size'))),
);

// `source` says which store the shown file came from: a `.claude` resource, a
// source-tree CLAUDE.md, a document of an included folder — all three keyed by
// `rel` — or a plan, keyed by its flat file name. Each resolves through its own
// endpoint, and a `rel` only means something within its own store, hence the
// `active*Rel` below. Only a plan can be deleted from here.
type ViewerSource = 'resource' | 'memory' | 'included' | 'plan';
interface Viewer {
  source: ViewerSource;
  rel: string;
  planName: string;
  name: string;
  category: string;
  content: string;
  ext: string;
  loading: boolean;
  error: string;
}
const viewer = reactive<Viewer>({
  source: 'resource',
  rel: '',
  planName: '',
  name: '',
  category: '',
  content: '',
  ext: '',
  loading: false,
  error: '',
});

const hasSelection = computed(() =>
  viewer.source === 'plan' ? Boolean(viewer.planName) : Boolean(viewer.rel),
);

// `.claude/CLAUDE.md` et `<racine>/CLAUDE.md` ont le même `rel` : on ne surligne
// une ligne que si la sélection vient bien de son propre magasin.
const activeResourceRel = computed(() => (viewer.source === 'resource' ? viewer.rel : ''));
const activeMemoryRel = computed(() => (viewer.source === 'memory' ? viewer.rel : ''));
const activeIncludedRel = computed(() => (viewer.source === 'included' ? viewer.rel : ''));

const VIEWER_ICON: Record<ViewerSource, string> = {
  resource: 'description',
  memory: 'psychology',
  included: 'description',
  plan: 'assignment',
};
// Mémoire et documents du dépôt se lisent par la même route, donc portent la même
// `source` ; seule la catégorie les distingue, et un README n'est pas un cerveau.
const viewerIcon = computed(() =>
  viewer.category === 'repo' ? 'article' : VIEWER_ICON[viewer.source],
);

function resetViewer(): void {
  viewer.source = 'resource';
  viewer.rel = '';
  viewer.planName = '';
  viewer.name = '';
  viewer.category = '';
  viewer.content = '';
  viewer.ext = '';
  viewer.error = '';
}

/** Ces trois-là ne diffèrent que par leur lecteur — et donc par leur bac à sable. */
async function openFile(
  source: 'resource' | 'memory' | 'included',
  r: ResourceNode,
): Promise<void> {
  viewer.source = source;
  viewer.planName = '';
  viewer.rel = r.rel;
  viewer.name = r.name;
  viewer.category = r.category;
  viewer.content = '';
  viewer.error = '';
  viewer.loading = true;
  try {
    const read =
      source === 'memory' ? readMemory : source === 'included' ? readIncludedFile : readResource;
    const { content } = await read(props.slug, r.rel);
    viewer.content = content;
    viewer.ext = r.name.split('.').pop()?.toLowerCase() ?? '';
  } catch (e) {
    viewer.error = readError(e);
  } finally {
    viewer.loading = false;
  }
}

const openResource = (r: ResourceNode): Promise<void> => openFile('resource', r);
const openMemory = (r: ResourceNode): Promise<void> => openFile('memory', r);
const openIncluded = (r: ResourceNode): Promise<void> => openFile('included', r);

/**
 * Poser la liste des dossiers inclus, puis relire l'inventaire.
 *
 * La préférence est écrite avant le rechargement, et non après : c'est le
 * serveur qui relit la liste pour décider de ce qu'il ouvre, donc il doit voir la
 * nouvelle avant qu'on lui redemande l'arbre.
 */
async function applyFolders(folders: string[]): Promise<void> {
  await settings.setFolders(props.slug, [...new Set(folders)]);
  // Le fichier ouvert peut venir d'un dossier qu'on vient de retirer : sa lecture
  // serait maintenant refusée, et le garder à l'écran promettrait un contenu
  // qu'on ne saurait plus relire.
  const stillCovered = folders.some((f) => viewer.rel.startsWith(`${f}/`));
  if (viewer.source === 'included' && !stillCovered) resetViewer();
  await refresh();
}

/** Le retrait depuis l'arbre : un geste unique, donc appliqué tout de suite. */
const excludeFolder = (rel: string): Promise<void> =>
  applyFolders(settings.foldersOf(props.slug).filter((f) => f !== rel));

/** Plans are flat `.md` files read through the system API, never `readResource`. */
async function openPlan(p: PlanInfo): Promise<void> {
  viewer.source = 'plan';
  viewer.rel = ''; // no resource row stays highlighted
  viewer.planName = p.name;
  viewer.name = p.title || p.name;
  viewer.category = 'plans';
  viewer.content = '';
  viewer.error = '';
  viewer.ext = 'md';
  viewer.loading = true;
  try {
    viewer.content = (await readPlan(p.name)).content;
  } catch (e) {
    viewer.error = readError(e);
  } finally {
    viewer.loading = false;
  }
}

/** Le détail vient du serveur ; AURA n'ajoute sa voix que s'il est resté muet. */
const readError = (e: unknown): string =>
  e instanceof Error && e.message.trim() ? e.message : t('pages.project.readError');

const confirmPlanDelete = ref(false);
const deletingPlan = ref(false);
const folderPicker = ref(false);

async function doDeletePlan(): Promise<void> {
  if (viewer.source !== 'plan' || !viewer.planName) return;
  deletingPlan.value = true;
  try {
    await deletePlan(viewer.planName);
    notifyDone(t('pages.project.planDeleted'));
    confirmPlanDelete.value = false;
    resetViewer();
    await loadPlans();
  } catch (e) {
    notifyError(e, t('pages.project.planDeleteError'));
  } finally {
    deletingPlan.value = false;
  }
}

/** Plans are secondary: a failure here must not take the whole page down. */
async function loadPlans(): Promise<void> {
  try {
    projectPlans.value = (await getProjectPlans(props.slug)).plans;
  } catch {
    projectPlans.value = [];
  }
}

// ── Frontmatter ──────────────────────────────────────────────────────────────
// Même lecture et même carte que les pages Skills et Agents : `parseDoc` extrait
// le bloc `---…---`, `FrontmatterCard` l'explique. La page ouvre plusieurs types
// de ressources, alors le vocabulaire suit la catégorie du fichier ouvert.
const parsed = computed(() =>
  viewer.ext === 'md'
    ? parseDoc(viewer.content)
    : { present: false, entries: [], body: viewer.content },
);

const fmKeys = computed<KeySpec[]>(() => FM_KEYS[viewer.category as ResourceCategory] ?? []);

// Corps rendu en Markdown ; les fichiers non-.md restent affichés en bloc de code.
const renderedBody = computed(() => renderBody(viewer.ext, viewer.content, parsed.value.body));

const categoryMeta = computed(() => CATEGORY_META.find((m) => m.key === viewer.category));

function openSession(id: string): void {
  void router.push({ name: 'session', params: { slug: props.slug, id } });
}

/**
 * Le clic sur la ligne, qui ne doit jamais doubler celui sur le lien.
 *
 * La cellule Session porte un vrai lien : c'est lui qui donne le Ctrl+clic, le
 * clic milieu, le menu contextuel et l'accès clavier. Le clic sur la ligne n'est
 * qu'un confort par-dessus, et il doit s'effacer partout où le lien fait déjà le
 * travail — sans quoi un Ctrl+clic ouvrirait l'onglet *et* quitterait la page.
 */
function onRowClick(e: Event, row: TranscriptSummary): void {
  const me = e as MouseEvent;
  if (me.ctrlKey || me.metaKey || me.shiftKey || me.altKey || me.button === 1) return;
  if ((e.target as HTMLElement | null)?.closest('a')) return;
  openSession(row.id);
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = '';
  resetViewer();
  setBreadcrumbs([{ label: t('nav.projects'), to: { name: 'projects' } }, { label: props.slug }]);
  try {
    const [d] = await Promise.all([getProjectDetail(props.slug), loadPlans()]);
    detail.value = d;
    // Fil d'Ariane du haut : Projets > <nom lisible du projet>.
    setBreadcrumbs([
      { label: t('nav.projects'), to: { name: 'projects' } },
      { label: detail.value.name },
    ]);
    // Auto-sélection pour éviter un panneau vide. On suit l'ordre du navigateur :
    // le CLAUDE.md racine, sinon le README, sinon la première ressource, sinon le
    // premier plan (un projet peut n'avoir que des plans).
    const firstMemory = detail.value.memories[0] ?? detail.value.repoDocs[0];
    const firstResource = resourceGroups.value[0]?.items[0];
    if (firstMemory) void openMemory(firstMemory);
    else if (firstResource) void openResource(firstResource);
    else if (projectPlans.value[0]) void openPlan(projectPlans.value[0]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('pages.project.loadError');
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<style scoped lang="scss">
.pd {
  padding: var(--space-md) var(--space-xl) var(--space-xl);
  width: 100%;
}
.pd-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  margin-bottom: var(--space-md);
}
.pd-path-icon {
  color: var(--faint);
  flex: 0 0 auto;
}
// Le chemin occupe l'espace central (évite le grand vide) et tronque si besoin.
.pd-path {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-xs);
  color: var(--dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pd-refresh {
  flex: 0 0 auto;
  margin-left: auto;
}
.pd-ro {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--fs-2xs);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 2px 7px;
  border: 1px solid var(--line-2);
  border-radius: 999px;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
.pd-stats {
  list-style: none;
  margin: 0 0 var(--space-lg);
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-md);
}
.pd-stat {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  color: var(--muted);
}
.pd-stat .q-icon {
  color: var(--brand);
}
.pd-stat-val {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text);
}
.pd-stat-label {
  font-size: var(--fs-xs);
  color: var(--dim);
  margin-left: auto;
  text-align: right;
}

// ── Master-detail split ───────────────────────────────────────────────────────
.pd-split {
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: var(--space-lg);
  align-items: start;
  margin-bottom: var(--space-lg);
}
@media (max-width: 900px) {
  .pd-split {
    grid-template-columns: 1fr;
  }
}

.pd-nav {
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  position: sticky;
  top: var(--space-lg);
  max-height: calc(100vh - 80px);
  overflow: auto;
}
.pd-nav-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--muted);
}
// ── Viewer (inline, plus de popup) ────────────────────────────────────────────
.pd-viewer {
  display: flex;
  flex-direction: column;
  min-height: 360px;
  position: sticky;
  top: var(--space-lg);
  max-height: calc(100vh - 80px);
  overflow: hidden;
}
.pd-viewer-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--line);
}
.pd-viewer-name {
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pd-viewer-body {
  padding: var(--space-lg);
  overflow: auto;
}
.pd-viewer-loading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--muted);
  padding: var(--space-lg);
}
.pd-viewer-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  color: var(--faint);
  text-align: center;
}
.pd-viewer-placeholder p {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--dim);
}

// La carte frontmatter est autoportante (surface-card) : de cette page ne relève
// que son espacement dans le flux de la visionneuse.
.pd-fm {
  margin-bottom: var(--space-lg);
}

// ── Sections (hooks, sessions) ────────────────────────────────────────────────
.pd-section {
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.pd-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--muted);
}
.pd-section-head h2 {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text);
}
.pd-count {
  font-size: var(--fs-sm);
  color: var(--dim);
}
.pd-hooks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.pd-hook {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-sm);
  padding: var(--space-sm);
  font-size: var(--fs-xs);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.pd-hook-event {
  color: var(--brand);
}
.pd-hook-matcher {
  color: var(--muted);
}
.pd-hook-cmd {
  color: var(--dim);
  word-break: break-all;
}
.pd-prompt {
  display: inline-block;
  max-width: 60ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
/* Un vrai lien, mais qui ne doit pas se colorer comme un lien : c'est le titre de
   la ligne. Le soulignement au survol et l'anneau de focus disent le reste. */
.pd-session-link {
  color: inherit;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    border-radius: var(--radius-xs);
  }
}
.pd-sub-badge {
  color: var(--brand-muted);
  margin-left: var(--space-xs);
  vertical-align: middle;
}
.pd-title-badge {
  color: var(--brand);
  margin-left: var(--space-xs);
  vertical-align: middle;
}
.pd-table-search {
  width: 260px;
  max-width: 100%;
}
.pd-table {
  :deep(thead th) {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--dim);
  }
  :deep(tbody tr) {
    cursor: pointer;
  }
  :deep(tbody tr:hover) {
    background: var(--hover-overlay);
  }
  :deep(tbody td) {
    font-size: var(--fs-sm);
  }
}
.pd-empty {
  margin: 0;
  color: var(--dim);
  font-size: var(--fs-sm);
  padding: var(--space-md);
}
.pd-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xl);
  color: var(--muted);
  text-align: center;
}
.pd-state p {
  margin: 0;
}
.pd-skel-split {
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: var(--space-lg);
}
@media (max-width: 900px) {
  .pd-skel-split {
    grid-template-columns: 1fr;
  }
}
.pd-del {
  width: 420px;
  max-width: 92vw;
  padding: var(--space-lg);
}
.pd-del-title {
  font-size: var(--fs-lg);
  font-weight: 600;
}
.pd-del-path {
  font-size: var(--fs-sm);
  color: var(--muted);
  margin: var(--space-xs) 0 var(--space-lg);
  word-break: break-all;
}
.pd-del-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
</style>
