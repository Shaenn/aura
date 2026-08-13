<template>
  <div class="tv">
    <AskUserQuestionView
      :input="block.input"
      :result="block.result?.content ?? null"
      :answers="answers"
      :notes="notes"
      :afk="afk"
      :rejected="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from '@/services/projects';
import AskUserQuestionView from '@/components/replay/AskUserQuestionView.vue';

const props = defineProps<{ block: Block }>();

/** La carte question → réponse écrite par le harness, quand elle existe. */
const answers = computed<Record<string, unknown> | null>(() => map('answers'));

/** Les notes libres ajoutées à une réponse — carte question → note. */
const notes = computed<Record<string, unknown> | null>(() => map('notes'));

/**
 * Le délai au bout duquel le harness a cessé d'attendre, en millisecondes.
 *
 * Sa seule présence dit que la question est restée sans réponse et que la suite
 * s'est décidée sans elle.
 */
const afk = computed<number>(() => {
  const v = props.block.result?.meta?.afkTimeoutMs;
  return typeof v === 'number' && v > 0 ? v : 0;
});

function map(key: string): Record<string, unknown> | null {
  const v = props.block.result?.meta?.[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
</style>
