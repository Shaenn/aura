<template>
  <details class="hk" :class="`hk--${run.status}`" :open="open" @toggle="onToggle">
    <summary class="hk-head">
      <q-icon :name="icon" size="14px" class="hk-icon" aria-hidden="true" />
      <span class="hk-event font-mono">{{ run.event }}</span>
      <span class="hk-name font-mono">{{ label }}</span>
      <span v-if="run.durationMs" class="hk-ms font-mono">{{ fmtDuration(run.durationMs) }}</span>
      <span class="hk-status">{{ statusLabel }}</span>
    </summary>

    <div class="hk-body">
      <!-- What the hook fed back to Claude: the reason this run matters. -->
      <div v-if="run.context?.length" class="hk-part">
        <div class="section-label">{{ t('replay.hook.injected') }}</div>
        <blockquote v-for="(c, i) in run.context" :key="i" class="hk-ctx">{{ c }}</blockquote>
      </div>

      <div v-if="run.error" class="hk-part">
        <div class="section-label">
          {{ run.status === 'blocked' ? t('replay.hook.blocked') : t('replay.hook.error') }}
        </div>
        <pre class="hk-pre hk-pre--err"><code>{{ run.error }}</code></pre>
      </div>

      <div v-if="run.command" class="hk-part">
        <div class="section-label">{{ t('replay.hook.command') }}</div>
        <pre class="hk-pre"><code>{{ run.command }}</code></pre>
      </div>

      <div v-if="run.stderr && run.stderr !== run.error" class="hk-part">
        <div class="section-label">{{ t('replay.hook.stderr') }}</div>
        <pre class="hk-pre"><code>{{ run.stderr }}</code></pre>
      </div>

      <p class="hk-meta font-mono">
        <span>{{ run.name }}</span>
        <span v-if="run.exitCode !== undefined">{{ t('replay.hook.exit', { n: run.exitCode }) }}</span>
      </p>
    </div>
  </details>
</template>

<script setup lang="ts">
  import { useExpandable, syncDetails } from '@/composables/useExpandAll'
  import type { HookRun } from '@/services/projects'
  import { fmtDuration } from '@/utils/format'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'

  const props = defineProps<{ run: HookRun }>()

  const open = useExpandable(false)
  const onToggle = syncDetails(open)

  const { t } = useI18n()

  // L'icône ne dépend pas de la langue ; le mot qui la double, si.
  const ICONS: Record<HookRun['status'], string> = {
    ok: 'bolt',
    context: 'bolt',
    error: 'warning',
    blocked: 'block',
  }

  const icon = computed(() => ICONS[props.run.status])
  const statusLabel = computed(() => t(`replay.hook.status.${props.run.status}`))

  /** Interpreters carry no meaning — the script they run is what identifies a hook. */
  const RUNNERS = new Set(['node', 'npx', 'pnpm', 'npm', 'python', 'python3', 'sh', 'bash', 'cmd'])

  /**
   * A readable name for the hook: `node .claude/tools/lsp-grep-hint/index.js` →
   * `lsp-grep-hint`. Falls back to the matcher (`PreToolUse:Bash` → `Bash`).
   */
  const label = computed((): string => {
    const command = props.run.command
    if (!command) return props.run.name.split(':')[1] ?? props.run.event

    const tokens = command.replace(/["']/g, '').split(/\s+/).filter(Boolean)
    const first = tokens[0] ?? ''
    const target = (RUNNERS.has(first.split(/[/\\]/).pop() ?? '') ? tokens[1] : first) ?? first

    const parts = target.split(/[/\\]/).filter(Boolean)
    let base = parts.pop() ?? target
    // `…/lsp-grep-hint/index.js` — the folder names the hook, not the entrypoint.
    if (/^(index|main)\.\w+$/.test(base) && parts.length) base = parts[parts.length - 1]!
    return base.replace(/\.\w+$/, '') || props.run.event
  })
</script>

<style scoped lang="scss">
  .hk {
    border: 1px solid var(--line-2);
    border-left: 2px solid var(--dim);
    border-radius: var(--radius-xs);
    background: var(--surface);
  }
  .hk--context {
    border-left-color: var(--brand);
  }
  .hk--error {
    border-left-color: var(--warn);
  }
  .hk--blocked {
    border-left-color: var(--danger);
  }
  .hk-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    cursor: pointer;
    list-style: none;
    font-size: var(--fs-xs);
    color: var(--muted);
  }
  .hk-head::-webkit-details-marker {
    display: none;
  }
  .hk-head:hover {
    background: var(--hover-overlay);
  }
  .hk-icon {
    flex-shrink: 0;
    color: var(--dim);
  }
  .hk--context .hk-icon {
    color: var(--brand);
  }
  .hk--error .hk-icon {
    color: var(--warn);
  }
  .hk--blocked .hk-icon {
    color: var(--danger);
  }
  .hk-event {
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--faint);
    flex-shrink: 0;
  }
  .hk-name {
    color: var(--text);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .hk-ms {
    color: var(--faint);
    font-size: var(--fs-2xs);
    flex-shrink: 0;
  }
  .hk-status {
    margin-left: auto;
    flex-shrink: 0;
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dim);
  }
  .hk--context .hk-status {
    color: var(--brand);
  }
  .hk--error .hk-status {
    color: var(--warn);
  }
  .hk--blocked .hk-status {
    color: var(--danger);
  }
  .hk-body {
    padding: var(--space-sm);
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .hk-part {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .hk-ctx {
    margin: 0;
    padding: var(--space-sm) var(--space-md);
    border-left: 2px solid var(--brand-line);
    background: var(--brand-soft);
    border-radius: var(--radius-xs);
    color: var(--text);
    font-size: var(--fs-sm);
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .hk-pre {
    margin: 0;
    padding: var(--space-sm);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    overflow-x: auto;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: var(--fs-xs);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 240px;
  }
  .hk-pre--err {
    color: color-mix(in srgb, var(--danger) 85%, var(--text));
  }
  .hk-meta {
    margin: 0;
    display: flex;
    gap: var(--space-md);
    color: var(--faint);
    font-size: var(--fs-2xs);
  }
</style>
