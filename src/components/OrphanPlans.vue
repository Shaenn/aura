<template>
  <div class="orp">
    <!-- `i18n-t` plutôt qu'un texte découpé : le nom du champ est au milieu de la
         phrase en français comme en anglais, mais pas au même endroit. Le laisser
         dans la traduction, sous forme de fente, est ce qui garde la phrase
         traduisible sans figer l'ordre des mots. -->
    <i18n-t keypath="pages.maintenance.orphans.intro" tag="p" class="orp-intro" scope="global">
      <template #field><span class="font-mono">planFilePath</span></template>
    </i18n-t>

    <div v-if="loading" class="orp-skel">
      <q-skeleton type="rect" height="280px" />
      <q-skeleton type="rect" height="280px" />
    </div>

    <div v-else-if="error" class="orp-state" role="alert">
      <q-icon name="error_outline" size="24px" color="negative" />
      <p>{{ error }}</p>
      <q-btn flat no-caps :label="t('pages.maintenance.orphans.retry')" @click="refresh" />
    </div>

    <p v-else-if="!orphans.length" class="orp-empty">
      {{ t('pages.maintenance.orphans.empty') }}
    </p>

    <div v-else class="orp-body">
      <nav class="orp-list" :aria-label="t('pages.maintenance.orphanPlans')">
        <ul class="orp-items">
          <li v-for="p in orphans" :key="p.name">
            <button
              type="button"
              class="orp-item"
              :class="{ 'orp-item--active': selected === p.name }"
              :aria-current="selected === p.name ? 'true' : undefined"
              @click="select(p.name)"
            >
              <span class="orp-item-title">{{ p.title }}</span>
              <span class="orp-item-meta font-mono">
                {{ fmtDate(p.mtime) }} · {{ fmtBytes(p.size) }}
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <article class="orp-view" :aria-label="t('pages.maintenance.orphans.preview')">
        <template v-if="selected">
          <header class="orp-toolbar">
            <q-icon name="assignment" size="16px" aria-hidden="true" />
            <span class="orp-path font-mono">{{ selected }}</span>
            <q-space />
            <q-btn
              flat
              dense
              no-caps
              color="negative"
              icon="delete"
              :label="t('common.delete')"
              @click="confirmDelete = true"
            />
          </header>
          <div class="orp-content">
            <div v-if="reading" class="orp-loading">
              <q-spinner size="24px" /> {{ t('common.loading') }}
            </div>
            <div v-else-if="readError" class="orp-state" role="alert">
              <q-icon name="error_outline" size="24px" color="negative" />
              <p>{{ readError }}</p>
            </div>
            <MarkdownView v-else :source="content" />
          </div>
        </template>
        <div v-else class="orp-placeholder">
          <q-icon name="visibility" size="30px" aria-hidden="true" />
          <p>{{ t('pages.maintenance.orphans.placeholder') }}</p>
        </div>
      </article>
    </div>

    <q-dialog v-model="confirmDelete">
      <q-card class="orp-del surface-card">
        <div class="orp-del-title">{{ t('pages.maintenance.orphans.deleteTitle') }}</div>
        <div class="orp-del-path font-mono">{{ selected }}</div>
        <div class="orp-del-actions">
          <q-btn flat no-caps dense :label="t('common.cancel')" @click="confirmDelete = false" />
          <q-btn
            unelevated
            no-caps
            dense
            color="negative"
            :label="t('common.delete')"
            :loading="deleting"
            @click="doDelete"
          />
        </div>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotify } from 'src/composables/useNotify';
import { getPlans, readPlan, deletePlan, type PlanInfo } from 'src/services/system';
import { fmtBytes, fmtDate } from 'src/utils/format';
import MarkdownView from 'components/replay/MarkdownView.vue';

const { t } = useI18n();
const { notifyError, notifyDone } = useNotify();
const plans = ref<PlanInfo[]>([]);
const loading = ref(true);
const error = ref('');
const selected = ref<string | null>(null);
const content = ref('');
const reading = ref(false);
const readError = ref('');
const confirmDelete = ref(false);
const deleting = ref(false);

/** Plans no project claims. Server-side, an empty slug means no transcript named it. */
const orphans = computed(() => plans.value.filter((p) => !p.projectSlug));

const emit = defineEmits<{ count: [n: number] }>();

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    plans.value = (await getPlans()).plans;
    // A plan selected before a reload may be gone; drop a stale selection.
    if (selected.value && !orphans.value.some((p) => p.name === selected.value)) reset();
    emit('count', orphans.value.length);
  } catch (e) {
    error.value = msg(e);
  } finally {
    loading.value = false;
  }
}

async function select(name: string): Promise<void> {
  selected.value = name;
  content.value = '';
  readError.value = '';
  reading.value = true;
  try {
    content.value = (await readPlan(name)).content;
  } catch (e) {
    readError.value = msg(e);
  } finally {
    reading.value = false;
  }
}

function reset(): void {
  selected.value = null;
  content.value = '';
  readError.value = '';
}

async function doDelete(): Promise<void> {
  if (!selected.value) return;
  deleting.value = true;
  try {
    await deletePlan(selected.value);
    notifyDone(t('pages.maintenance.orphans.deleted'));
    confirmDelete.value = false;
    reset();
    await refresh();
  } catch (e) {
    notifyError(e, t('pages.maintenance.orphans.deleteError'));
  } finally {
    deleting.value = false;
  }
}

const msg = (e: unknown): string =>
  e instanceof Error && e.message.trim() ? e.message : t('common.noDetail');

defineExpose({ refresh });
onMounted(refresh);
</script>

<style scoped lang="scss">
.orp-intro {
  color: var(--dim);
  font-size: var(--fs-sm);
  line-height: 1.55;
  margin: 0 0 var(--space-md);
  max-width: 80ch;
}
.orp-skel {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--space-lg);
}
.orp-empty {
  color: var(--dim);
  font-size: var(--fs-sm);
  margin: 0;
}
.orp-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-lg);
  color: var(--dim);
  font-size: var(--fs-sm);
  margin: auto;
}
.orp-body {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--space-lg);
  align-items: start;
}
@media (max-width: 800px) {
  .orp-body,
  .orp-skel {
    grid-template-columns: 1fr;
  }
}
.orp-list {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);
  max-height: 60vh;
  overflow: auto;
}
.orp-items {
  list-style: none;
  margin: 0;
  padding: 0;
}
.orp-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
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
.orp-item:hover {
  background: var(--hover-overlay);
}
.orp-item--active {
  background: var(--brand-soft);
}
.orp-item-title {
  font-size: var(--fs-base);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.orp-item-meta {
  font-size: var(--fs-2xs);
  color: var(--dim);
}
.orp-view {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  min-height: 60vh;
  max-height: 60vh;
  overflow: hidden;
}
.orp-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--line);
}
.orp-path {
  font-size: var(--fs-sm);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.orp-content {
  flex: 1;
  overflow: auto;
  padding: var(--space-md);
}
.orp-loading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--dim);
  font-size: var(--fs-sm);
}
.orp-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  flex: 1;
  color: var(--faint);
  font-size: var(--fs-sm);
}
.orp-del {
  width: 420px;
  max-width: 92vw;
  padding: var(--space-lg);
}
.orp-del-title {
  font-size: var(--fs-lg);
  font-weight: 600;
}
.orp-del-path {
  font-size: var(--fs-sm);
  color: var(--muted);
  margin: var(--space-xs) 0 var(--space-lg);
  word-break: break-all;
}
.orp-del-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
</style>
