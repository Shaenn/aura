<template>
  <q-page class="pj">
    <h1 class="sr-only">{{ t('pages.projects.title') }}</h1>

    <header class="pj-header">
      <q-icon name="folder" size="15px" class="pj-head-icon" aria-hidden="true" />
      <p class="pj-sub font-mono">{{ t('pages.projects.count', projects.length) }}</p>
      <q-btn
        flat
        dense
        no-caps
        :label="t('common.refresh')"
        class="pj-refresh"
        :disable="loading"
        @click="refresh"
      />
    </header>

    <!-- Error -->
    <div v-if="error" class="pj-state" role="alert">
      <q-icon name="error_outline" size="28px" color="negative" />
      <p>{{ error }}</p>
      <q-btn flat no-caps :label="t('common.retry')" @click="refresh" />
    </div>

    <section v-else class="surface-card pj-card">
      <q-table
        :rows="projects"
        :columns="columns"
        row-key="slug"
        :loading="loading"
        :filter="filter"
        :filter-method="filterProjects"
        flat
        :rows-per-page-options="[15, 30, 50, 0]"
        class="pj-table"
        @row-click="(_e, row) => open(row.slug)"
      >
        <template #top>
          <div class="pj-table-top">
            <span class="section-label">{{ t('pages.projects.all') }}</span>
            <q-space />
            <q-input
              v-model="filter"
              dense
              outlined
              clearable
              debounce="150"
              :placeholder="t('pages.projects.filterPlaceholder')"
              class="pj-search"
              :aria-label="t('pages.projects.filterAria')"
            >
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </div>
        </template>

        <template #body-cell-name="cell">
          <q-td :props="cell">
            <div class="pj-name-cell">
              <q-icon name="folder" size="18px" class="pj-name-icon" aria-hidden="true" />
              <span class="pj-name">{{ cell.value }}</span>
              <q-icon v-if="cell.row.hasClaudeDir" name="verified" size="14px" class="pj-badge">
                <q-tooltip>{{ t('pages.projects.hasClaudeDir') }}</q-tooltip>
              </q-icon>
            </div>
          </q-td>
        </template>

        <template #body-cell-path="cell">
          <q-td :props="cell">
            <span class="pj-path font-mono">{{ winPath(cell.row) || cell.row.slug }}</span>
          </q-td>
        </template>

        <template #body-cell-sessions="cell">
          <q-td :props="cell" class="font-mono">{{ cell.value }}</q-td>
        </template>
        <template #body-cell-size="cell">
          <q-td :props="cell" class="font-mono">{{ fmtBytes(cell.value) }}</q-td>
        </template>
        <template #body-cell-lastActivity="cell">
          <q-td :props="cell" class="font-mono pj-time">{{ relTime(cell.value) }}</q-td>
        </template>

        <template #body-cell-actions="cell">
          <q-td :props="cell" auto-width>
            <q-icon name="chevron_right" size="18px" class="pj-chevron" aria-hidden="true" />
          </q-td>
        </template>

        <template #loading>
          <q-inner-loading showing color="primary" />
        </template>
        <template #no-data>
          <div class="pj-empty">
            <q-icon name="folder_off" size="24px" />
            {{ projects.length ? t('pages.projects.noMatch') : t('pages.projects.empty') }}
          </div>
        </template>
      </q-table>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { QTableColumn } from 'quasar';
import { getProjects, type ProjectSummary } from '@/services/projects';
import { fmtBytes, relTime } from '@/utils/format';

const { t } = useI18n();
const router = useRouter();
const projects = ref<ProjectSummary[]>([]);
const loading = ref(true);
const error = ref('');
const filter = ref('');

// Calculées, et non figées à l'import : le tableau reste monté quand la langue
// bascule, et un libellé posé une fois pour toutes garderait l'ancienne.
const columns = computed<QTableColumn<ProjectSummary>[]>(() => [
  {
    name: 'name',
    label: t('pages.projects.columns.name'),
    field: 'name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'path',
    label: t('pages.projects.columns.path'),
    field: 'path',
    align: 'left',
    sortable: true,
  },
  {
    name: 'sessions',
    label: t('pages.projects.columns.sessions'),
    field: 'sessions',
    align: 'right',
    sortable: true,
  },
  {
    name: 'size',
    label: t('pages.projects.columns.size'),
    field: 'size',
    align: 'right',
    sortable: true,
  },
  {
    name: 'lastActivity',
    label: t('pages.projects.columns.lastActivity'),
    field: 'lastActivity',
    align: 'right',
    sortable: true,
  },
  { name: 'actions', label: '', field: 'slug', align: 'right' },
]);

function filterProjects(rows: readonly ProjectSummary[], term: string): ProjectSummary[] {
  const q = term.trim().toLowerCase();
  if (!q) return rows as ProjectSummary[];
  return rows.filter((p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
}

function winPath(p: ProjectSummary): string {
  return p.path ? p.path.replace(/\//g, '\\') : '';
}

function open(slug: string): void {
  void router.push({ name: 'project', params: { slug } });
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    projects.value = (await getProjects()).projects;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('pages.projects.loadError');
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<style scoped lang="scss">
.pj {
  padding: var(--space-md) var(--space-xl) var(--space-xl);
  width: 100%;
}
.pj-header {
  display: flex;
  align-items: center;
  gap: var(--space-xs) var(--space-md);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}
.pj-head-icon {
  color: var(--faint);
  flex: 0 0 auto;
}
.pj-sub {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dim);
  font-size: var(--fs-sm);
  margin: 0;
}
.pj-refresh {
  flex: 0 0 auto;
  margin-left: auto;
}
.pj-card {
  padding: var(--space-sm);
}
.pj-table-top {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
}
.pj-search {
  width: 280px;
  max-width: 100%;
}
.pj-table {
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
.pj-name-cell {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.pj-name-icon {
  color: var(--brand);
}
.pj-name {
  font-weight: 600;
}
.pj-badge {
  color: var(--pulse);
}
.pj-path {
  font-size: var(--fs-xs);
  color: var(--dim);
  word-break: break-all;
}
.pj-time {
  color: var(--muted);
}
.pj-chevron {
  color: var(--faint);
}
.pj-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xl);
  width: 100%;
  color: var(--dim);
}
.pj-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xl);
  color: var(--muted);
  text-align: center;
}
.pj-state p {
  margin: 0;
}
</style>
