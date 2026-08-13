<template>
  <q-dialog v-model="open" @hide="onHide">
    <!-- Bracé : c'est le moment où AURA demande une confirmation avant
         d'écrire. Un seul bloc à l'écran, et une décision à prendre. -->
    <q-card class="diff-card surface-card surface-card--braced">
      <div class="diff-head">
        <div>
          <div class="section-label">{{ t('diff.title') }}</div>
          <div class="diff-path font-mono">{{ proposal?.rel }}</div>
        </div>
        <div class="diff-stat font-mono">
          <span v-if="!proposal?.exists" class="badge badge--new">{{ t('diff.newFile') }}</span>
          <span class="add">+{{ stat.added }}</span>
          <span class="del">−{{ stat.removed }}</span>
        </div>
      </div>

      <q-separator :dark="$q.dark.isActive" />

      <div class="diff-body font-mono">
        <div v-if="!lines.length" class="diff-empty">{{ t('diff.noChange') }}</div>
        <div v-for="(l, i) in lines" :key="i" class="diff-line" :class="`diff-line--${l.op}`">
          <span class="gutter" aria-hidden="true">{{
            l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '
          }}</span>
          <span class="content">{{ l.text || ' ' }}</span>
        </div>
      </div>

      <q-separator :dark="$q.dark.isActive" />

      <div class="diff-actions">
        <span v-if="error" class="err font-mono">{{ error }}</span>
        <q-space />
        <q-btn flat no-caps dense :label="t('common.cancel')" @click="open = false" />
        <q-btn
          unelevated
          no-caps
          dense
          color="primary"
          text-color="dark"
          :loading="applying"
          :disable="!lines.length"
          :label="t('diff.apply')"
          @click="confirm"
        />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useNotify } from 'src/composables/useNotify';
import { apply, ClaudeApiError, type Proposal } from 'src/services/claude';
import { diffLines, diffStat } from 'src/utils/diff';

const props = defineProps<{
  proposal: Proposal | null;
  /**
   * Optional custom commit. When omitted, the dialog writes through the standard
   * `/api/claude/apply` flow. Pages that write elsewhere (e.g. ~/.claude.json)
   * pass their own apply here; it should throw a `ClaudeApiError` with status
   * 409 on a concurrency conflict so the same message is shown.
   */
  applyFn?: (p: Proposal) => Promise<{ rel: string; backupPath: string | null }>;
}>();
const emit = defineEmits<{ applied: [{ rel: string; backupPath: string | null }]; close: [] }>();

const { t } = useI18n();
const $q = useQuasar();
const { notifyDone } = useNotify();
const open = ref(false);
const applying = ref(false);
const error = ref('');

watch(
  () => props.proposal,
  (p) => {
    error.value = '';
    open.value = p !== null;
  },
);

const lines = computed(() =>
  props.proposal ? diffLines(props.proposal.before, props.proposal.after) : [],
);
const stat = computed(() => diffStat(lines.value));

async function confirm(): Promise<void> {
  if (!props.proposal) return;
  applying.value = true;
  error.value = '';
  try {
    const res = props.applyFn
      ? await props.applyFn(props.proposal)
      : await apply(props.proposal.rel, props.proposal.after, props.proposal.before);
    notifyDone(t('diff.applied'));
    open.value = false;
    emit('applied', { rel: res.rel, backupPath: res.backupPath });
  } catch (e) {
    error.value =
      e instanceof ClaudeApiError && e.status === 409
        ? t('diff.conflict')
        : e instanceof Error
          ? e.message
          : t('diff.failed');
  } finally {
    applying.value = false;
  }
}

function onHide(): void {
  emit('close');
}
</script>

<style scoped lang="scss">
.diff-card {
  width: 760px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  max-height: 82vh;
  // Quasar donne `overflow: auto` aux cartes de dialogue, et il le garde : le
  // pixel dont les renforts débordent par défaut suffisait alors à faire
  // apparaître deux barres de défilement autour du diff. Ici ils s'arrêtent au
  // ras de l'arête.
  --brace-inset: 0;
}
.diff-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  gap: var(--space-md);
}
.diff-path {
  font-size: var(--fs-sm);
  color: var(--text);
  margin-top: 2px;
}
.diff-stat {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--fs-sm);
}
.diff-stat .add {
  color: var(--pulse);
}
.diff-stat .del {
  color: var(--danger);
}
.badge {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  font-size: var(--fs-2xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.badge--new {
  background: var(--brand-soft);
  color: var(--brand);
}
.diff-body {
  overflow: auto;
  padding: var(--space-sm) 0;
  font-size: var(--fs-sm);
  line-height: 1.5;
  background: var(--bg);
}
.diff-empty {
  padding: var(--space-lg);
  color: var(--muted);
  text-align: center;
}
.diff-line {
  display: flex;
  padding: 0 var(--space-md);
  white-space: pre-wrap;
  word-break: break-word;
}
.diff-line .gutter {
  width: 1.4em;
  flex: 0 0 auto;
  color: var(--dim);
  user-select: none;
}
.diff-line--add {
  background: rgba(110, 231, 168, 0.1);
}
.diff-line--add .content {
  color: var(--pulse);
}
.diff-line--del {
  background: rgba(229, 72, 77, 0.1);
}
.diff-line--del .content {
  color: var(--danger);
}
.diff-line--same .content {
  color: var(--muted);
}
.diff-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
}
.err {
  color: var(--danger);
  font-size: var(--fs-sm);
}
</style>
