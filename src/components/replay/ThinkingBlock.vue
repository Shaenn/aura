<template>
  <details class="tk" :open="open" @toggle="onToggle">
    <summary>
      <q-icon name="psychology" size="14px" aria-hidden="true" />
      {{ t('replay.thinking.title') }}
      <span class="tk-peek">{{ peek }}</span>
    </summary>
    <MarkdownView :source="text" />
  </details>
</template>

<script setup lang="ts">
  // A turn holds any number of reasoning blocks, so each needs its own fold —
  // hence a component rather than a `<details>` inside the turn's v-for, which
  // would have no per-block state to bind to.
  import { useExpandable, syncDetails } from '@/composables/useExpandAll'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import MarkdownView from './MarkdownView.vue'

  const { t } = useI18n()

  const props = withDefaults(defineProps<{ text?: string }>(), { text: '' })

  const open = useExpandable(false)
  const onToggle = syncDetails(open)

  /** First words, so a folded block still says what it is about. */
  const peek = computed((): string => {
    const t = props.text.replace(/\s+/g, ' ').trim()
    return t.length > 70 ? `${t.slice(0, 69)}…` : t
  })
</script>

<style scoped lang="scss">
  .tk {
    border: 1px dashed var(--line-3);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--surface);
  }
  .tk > summary {
    cursor: pointer;
    color: var(--muted);
    font-size: var(--fs-xs);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    list-style: none;
  }
  .tk > summary::-webkit-details-marker {
    display: none;
  }
  .tk-peek {
    color: var(--faint);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .tk[open] > summary {
    margin-bottom: var(--space-sm);
  }
  .tk[open] .tk-peek {
    display: none;
  }
</style>
