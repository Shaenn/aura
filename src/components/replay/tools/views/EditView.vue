<template>
  <div class="tv">
    <DiffView
      v-if="hasDiff"
      :before="before"
      :after="after"
      :filename="filePath"
      :replace-all="replaceAll"
    />
    <KeyValueList v-else :input="block.input" />

    <OutputPane
      :content="block.result?.content ?? ''"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from 'src/services/projects';
import { asRecord, bool, str } from '../values';
import DiffView from '../DiffView.vue';
import KeyValueList from '../KeyValueList.vue';
import OutputPane from '../OutputPane.vue';

const props = defineProps<{ block: Block }>();

const input = computed(() => asRecord(props.block.input));
const filePath = computed(() => str(input.value.file_path));
const before = computed(() => str(input.value.old_string));
const after = computed(() => str(input.value.new_string));
const replaceAll = computed(() => bool(input.value.replace_all));

/** An edit with neither side is not an edit — fall back rather than draw an empty diff. */
const hasDiff = computed(() => Boolean(before.value || after.value));
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
</style>
