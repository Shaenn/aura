<template>
  <dl v-if="entries.length" class="kv">
    <template v-for="e in entries" :key="e.key">
      <dt class="kv-k section-label">{{ e.key }}</dt>
      <dd class="kv-v">
        <span v-if="e.short" class="kv-inline font-mono">{{ e.value }}</span>
        <pre v-else class="kv-pre"><code>{{ e.value }}</code></pre>
      </dd>
    </template>
  </dl>
  <p v-else class="kv-empty font-mono">{{ t('replay.tools.params.empty') }}</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ input: unknown }>();

/** A value short enough to sit on the label's line rather than in a code block. */
const SHORT_MAX = 60;

const entries = computed(() => {
  const raw = props.input;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).map(([key, value]) => {
    const text =
      typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value));
    return { key, value: text, short: text.length <= SHORT_MAX && !text.includes('\n') };
  });
});
</script>

<style scoped lang="scss">
.kv {
  display: grid;
  grid-template-columns: minmax(6em, max-content) 1fr;
  align-items: baseline;
  gap: var(--space-xs) var(--space-md);
  margin: 0;
}
.kv-k {
  margin: 0;
}
.kv-v {
  margin: 0;
  min-width: 0;
}
.kv-inline {
  font-size: var(--fs-sm);
  color: var(--text);
  word-break: break-word;
}
.kv-pre {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  overflow-x: auto;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
}
.kv-empty {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--faint);
}
</style>
