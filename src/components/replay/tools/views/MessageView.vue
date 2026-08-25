<template>
  <div class="tv">
    <ToolChips :items="params" />

    <section v-if="message" class="mv-body">
      <MarkdownView :source="message" />
    </section>
    <KeyValueList v-else-if="!params.length" :input="block.input" />

    <OutputPane
      :content="block.result?.content ?? ''"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
  import MarkdownView from '@/components/replay/MarkdownView.vue'
  import type { Block } from '@/services/projects'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import KeyValueList from '../KeyValueList.vue'
  import OutputPane from '../OutputPane.vue'
  import ToolChips from '../ToolChips.vue'
  import { asRecord, chips, str } from '../values'

  const { t } = useI18n()

  const props = defineProps<{ block: Block }>()

  const input = computed(() => asRecord(props.block.input))
  const message = computed(() => str(input.value.message))

  const params = computed(() =>
    chips([
      [t('replay.tools.chips.to'), str(input.value.to)],
      ['objet', str(input.value.summary)],
      [t('replay.tools.chips.team'), str(input.value.team_name)],
      ['type', str(input.value.type)],
    ]),
  )
</script>

<style scoped lang="scss">
  .tv {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .mv-body {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    max-height: 420px;
    overflow: auto;
  }
</style>
