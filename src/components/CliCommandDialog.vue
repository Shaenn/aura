<template>
  <q-dialog :model-value="command !== null" @update:model-value="(v) => !v && emit('close')">
    <q-card class="cli-card surface-card">
      <div class="section-label">{{ title || t('cli.defaultTitle') }}</div>
      <p v-if="note" class="cli-note">{{ note }}</p>

      <div class="cli-box">
        <code class="cli-cmd font-mono">{{ command }}</code>
        <q-btn flat dense round size="sm" icon="content_copy" :aria-label="t('cli.copyAria')" @click="copy" />
      </div>
      <p class="cli-hint">
        <i18n-t keypath="cli.hint" scope="global">
          <template #cmd>
            <span class="font-mono">claude …</span>
          </template>
        </i18n-t>
      </p>

      <div class="cli-actions">
        <slot name="actions" />
        <q-space />
        <q-btn flat no-caps dense :label="t('common.close')" @click="emit('close')" />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
  // Read-only helper: shows a Claude Code CLI command with a copy button. AURA uses
  // it for actions it deliberately does NOT perform by writing files (plugin
  // install/uninstall, marketplace add/remove) — Claude Code manages ~/.claude/plugins.
  import { useNotify } from '@/composables/useNotify'
  import { copyToClipboard } from 'quasar'
  import { useI18n } from 'vue-i18n'

  const props = defineProps<{ command: string | null; title?: string; note?: string }>()
  const emit = defineEmits<{ close: [] }>()

  const { t } = useI18n()
  const { notifyDone, notifyWarn } = useNotify()

  async function copy(): Promise<void> {
    if (!props.command) return
    try {
      await copyToClipboard(props.command)
      notifyDone(t('cli.copied'))
    } catch {
      notifyWarn(t('cli.copyFailed'))
    }
  }
</script>

<style scoped lang="scss">
  .cli-card {
    width: 560px;
    max-width: 92vw;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .cli-note {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--muted);
  }
  .cli-box {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
  }
  .cli-cmd {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--fs-sm);
    color: var(--text);
    word-break: break-all;
    user-select: all;
  }
  .cli-hint {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--dim);
  }
  .cli-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
</style>
