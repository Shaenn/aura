<template>
  <div class="tv">
    <KeyValueList :input="block.input" />

    <OutputPane
      :content="block.result?.content ?? ''"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
import type { Block } from '@/services/projects';
import KeyValueList from '../KeyValueList.vue';
import OutputPane from '../OutputPane.vue';

defineProps<{ block: Block }>();
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
</style>
