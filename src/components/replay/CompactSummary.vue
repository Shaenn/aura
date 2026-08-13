<template>
  <details class="cs" :open="open" @toggle="onToggle">
    <summary>
      <q-icon name="inventory_2" size="14px" aria-hidden="true" />
      {{ t('replay.compaction.summary') }}
      <span class="cs-size font-mono">{{
        t('replay.compaction.summaryTokens', { n: fmtNum(tokens) })
      }}</span>
    </summary>
    <MarkdownView :source="text" />
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useExpandable, syncDetails } from 'src/composables/useExpandAll';
import type { TranscriptEvent } from 'src/services/projects';
import { estimateTokens } from 'app/shared/context';
import { fmtNum } from 'src/utils/format';
import MarkdownView from './MarkdownView.vue';

const { t } = useI18n();

const props = defineProps<{ event: TranscriptEvent }>();

const open = useExpandable(false);
const onToggle = syncDetails(open);

// What the harness re-sent as the conversation's whole past. It is the bulk of
// the window right after a compaction — worth showing, folded.
const text = computed(() =>
  props.event.blocks
    .filter((b) => b.kind === 'text')
    .map((b) => b.text ?? '')
    .join('\n\n'),
);

const tokens = computed(() => estimateTokens(text.value));
</script>

<style scoped lang="scss">
.cs {
  border: 1px dashed var(--warn);
  border-radius: var(--radius-sm);
  background: var(--surface);
  padding: var(--space-sm) var(--space-md);
}
.cs > summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--warn);
  font-size: var(--fs-xs);
}
.cs > summary::-webkit-details-marker {
  display: none;
}
.cs[open] > summary {
  margin-bottom: var(--space-sm);
}
.cs-size {
  margin-left: auto;
  color: var(--faint);
  font-size: var(--fs-2xs);
}
</style>
