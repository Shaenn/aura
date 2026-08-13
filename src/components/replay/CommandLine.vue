<template>
  <div class="cl">
    <!-- The command the user ran in the CLI. -->
    <p v-if="command" class="cl-cmd">
      <q-icon :name="isBash ? 'terminal' : 'keyboard_command_key'" size="14px" aria-hidden="true" />
      <code class="cl-name">{{ command.name }}</code>
      <code v-if="command.text" class="cl-args">{{ command.text }}</code>
      <span class="cl-time font-mono">{{ time }}</span>
    </p>

    <!-- What it printed back. -->
    <template v-else>
      <p class="cl-out-head">
        <q-icon name="terminal" size="13px" aria-hidden="true" />
        {{ t('replay.command.output') }}
        <span class="cl-time font-mono">{{ time }}</span>
      </p>
      <pre class="cl-out"><code>{{ output }}</code></pre>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TranscriptEvent } from '@/services/projects';
import { fmtTime } from '@/utils/format';

const { t } = useI18n();

const props = defineProps<{ event: TranscriptEvent }>();

const command = computed(() => props.event.blocks.find((b) => b.kind === 'slash_command') ?? null);

/** `!git status` typed at the prompt, as opposed to a `/slash` command. */
const isBash = computed(() => command.value?.name === '!');

const output = computed(() =>
  props.event.blocks
    .filter((b) => b.kind === 'text')
    .map((b) => b.text ?? '')
    .join('\n'),
);

const time = computed(() => fmtTime(props.event.timestamp ?? 0));
</script>

<style scoped lang="scss">
.cl {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.cl-cmd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--dim);
}
.cl-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--brand);
  background: var(--brand-soft);
  border: 1px solid var(--brand-line);
  border-radius: var(--radius-xs);
  padding: 1px 8px;
}
.cl-args {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-xs);
  color: var(--muted);
}
.cl-time {
  margin-left: auto;
  font-size: var(--fs-2xs);
  color: var(--faint);
}
.cl-out-head {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--fs-2xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
}
.cl-out {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
}
</style>
