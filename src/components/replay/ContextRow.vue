<template>
  <li class="cr">
    <!--
      Une ligne qui se déplie est un `<details>` ; une ligne qui ne le fait pas
      n'en est pas un. Un `<summary>` sans contenu à révéler promet un pli qui
      n'existe pas, et le clavier s'y arrête pour rien.
    -->
    <details v-if="row.detail.length" class="cr-fold" :open="open" @toggle="onToggle">
      <summary class="cr-head">
        <q-icon :name="open ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
        <ContextRowBody
          :row="row"
          :pill="pill"
          :color="color"
          @navigate="emit('navigate', $event)"
        />
      </summary>
      <ul class="cr-detail">
        <li v-for="(d, i) in row.detail" :key="i" class="cr-detail-line">
          <span class="cr-detail-label">{{ d.label }}</span>
          <!-- La couleur ne porte jamais seule : le mot « erreur » est là. -->
          <span v-if="d.isError" class="cr-error">{{ t('replay.context.rowError') }}</span>
          <span class="cr-tokens font-mono">~{{ fmtNum(d.tokens) }}</span>
        </li>
      </ul>
    </details>

    <div v-else class="cr-head cr-head--flat">
      <ContextRowBody :row="row" :pill="pill" :color="color" @navigate="emit('navigate', $event)" />
    </div>
  </li>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fmtNum } from 'src/utils/format';
import ContextRowBody from './ContextRowBody.vue';
import type { ContextRowModel } from './contextRows';

const { t } = useI18n();

defineProps<{
  row: ContextRowModel;
  /** Absent in the grouped view, where the section header already names the kind. */
  pill?: string | undefined;
  color?: string | undefined;
}>();

const emit = defineEmits<{ navigate: [uuid: string] }>();

const open = ref(false);
function onToggle(e: Event): void {
  open.value = (e.target as HTMLDetailsElement).open;
}
</script>

<style scoped lang="scss">
.cr {
  list-style: none;
}

.cr-fold > summary {
  list-style: none;
  cursor: pointer;
}
.cr-fold > summary::-webkit-details-marker {
  display: none;
}

.cr-head {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px var(--space-xs);
  border-radius: var(--radius-xs);
  color: var(--dim);

  &:hover {
    background: var(--surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
}

/* Sans chevron, le corps s'aligne quand même sur celui de ses voisines. */
.cr-head--flat {
  padding-left: calc(var(--space-xs) + 14px + var(--space-xs));
}

.cr-detail {
  list-style: none;
  margin: 0;
  padding: 2px 0 var(--space-xs) calc(var(--space-md) + var(--space-sm));
}

.cr-detail-line {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 1px var(--space-xs);
  font-size: var(--fs-2xs);
}

.cr-detail-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
}

.cr-error {
  flex: none;
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: var(--radius-xs);
  padding: 0 4px;
  line-height: 1.4;
}

.cr-tokens {
  flex: none;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
</style>
