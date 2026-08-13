<template>
  <section class="tr" :style="accent ? { borderLeftColor: accent } : undefined">
    <header class="tr-head">
      <q-icon name="account_tree" size="16px" aria-hidden="true" />
      <span class="tr-name">{{ agentName }}</span>
      <span v-if="taskLabel" class="tr-task">{{ taskLabel }}</span>
      <q-badge
        v-if="block.status"
        :color="block.status === 'completed' ? 'positive' : 'grey-6'"
        :label="block.status"
        rounded
      />
    </header>

    <MarkdownView v-if="block.text" :source="block.text" />
    <p v-else class="tr-empty">{{ t('replay.report.empty') }}</p>

    <details
      v-if="block.outputFile || block.note"
      class="tr-meta"
      :open="metaOpen"
      @toggle="onMetaToggle"
    >
      <summary>
        <q-icon name="info" size="13px" aria-hidden="true" /> {{ t('replay.report.details') }}
      </summary>
      <p v-if="block.outputFile" class="font-mono">
        <span class="tr-meta-k">{{ t('replay.report.file') }}</span> {{ block.outputFile }}
      </p>
      <p v-if="block.note" class="tr-meta-note">{{ block.note }}</p>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Block } from '@/services/projects';
import { useExpandable, syncDetails } from '@/composables/useExpandAll';
import { agentColor } from '@/utils/agentColors';
import MarkdownView from './MarkdownView.vue';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

const metaOpen = useExpandable(false);
const onMetaToggle = syncDetails(metaOpen);

/**
 * The agent that produced the report, resolved from its sidecar during parsing.
 * Older transcripts carry no `<task-id>` to resolve, so fall back to the summary
 * — `Agent "Explorer …" finished` names the *task*, not the agent, but a real
 * label beats "Sous-agent".
 */
const agentName = computed((): string => {
  if (props.block.agentType) return props.block.agentType;
  const summary = props.block.summary;
  if (!summary) return 'Sous-agent';
  return summary.match(/"([^"]+)"/)?.[1] ?? summary;
});

/** With the agent named, the summary is free to say what it was asked to do. */
const taskLabel = computed((): string => {
  if (!props.block.agentType) return '';
  return props.block.summary?.match(/"([^"]+)"/)?.[1] ?? '';
});

/** Matches the stripe the run itself wears in the timeline. */
const accent = computed((): string | undefined => {
  const key = props.block.agentType ?? props.block.taskId;
  return key ? agentColor(key) : undefined;
});
</script>

<style scoped lang="scss">
.tr {
  border: 1px solid var(--line);
  border-left: 2px solid var(--brand-muted);
  border-radius: var(--radius-sm);
  background: var(--surface);
  padding: var(--space-sm) var(--space-md) var(--space-md);
}
.tr-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--brand-muted);
  font-size: var(--fs-sm);
  font-weight: 600;
  margin-bottom: var(--space-sm);
}
.tr-name {
  color: var(--text);
}
/* The task, beside the agent that ran it — muted, so the name stays the title. */
.tr-task {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 400;
}
.tr-empty {
  margin: 0;
  color: var(--dim);
  font-size: var(--fs-sm);
  font-style: italic;
}
.tr-meta {
  margin-top: var(--space-sm);
  border-top: 1px solid var(--line);
  padding-top: var(--space-sm);
}
.tr-meta > summary {
  cursor: pointer;
  color: var(--muted);
  font-size: var(--fs-xs);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  list-style: none;
}
.tr-meta > summary::-webkit-details-marker {
  display: none;
}
.tr-meta p {
  margin: var(--space-sm) 0 0;
  font-size: var(--fs-xs);
  color: var(--dim);
  word-break: break-all;
}
.tr-meta-k {
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-right: var(--space-xs);
}
.tr-meta-note {
  font-style: italic;
}
</style>
