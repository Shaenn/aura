<template>
  <div class="tv">
    <div v-if="markdown" class="tv-toggle">
      <SegmentedControl
        v-model="mode"
        :options="MODES"
        :aria-label="t('replay.tools.views.write.display')"
      />
    </div>

    <MarkdownView v-if="markdown && mode === 'preview'" :source="content" />
    <CodeBlock
      v-else-if="content"
      :code="content"
      :lang="lang"
      :label="label"
      :filename="filePath"
      :stat="`${lineCount} ligne${lineCount > 1 ? 's' : ''}`"
      icon="note_add"
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
import { computed, ref } from 'vue';
import type { Block } from '@/services/projects';
import { asRecord, str } from '../values';
import { langOf, langLabel, isMarkdown } from '../language';
import CodeBlock from '../CodeBlock.vue';
import KeyValueList from '../KeyValueList.vue';
import OutputPane from '../OutputPane.vue';
import MarkdownView from '@/components/replay/MarkdownView.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

const MODES = [
  { label: 'Code', value: 'code' as const },
  { label: t('replay.tools.views.read.preview'), value: 'preview' as const },
];
const mode = ref<'code' | 'preview'>('preview');

const input = computed(() => asRecord(props.block.input));
const filePath = computed(() => str(input.value.file_path));
const content = computed(() => str(input.value.content));
const lang = computed(() => langOf(filePath.value));
const label = computed(() => langLabel(filePath.value));
const markdown = computed(() => isMarkdown(filePath.value));
const lineCount = computed(() => content.value.split('\n').length);
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.tv-toggle {
  display: flex;
}
</style>
