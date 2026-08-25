<template>
  <div class="field" :class="{ 'field--danger': danger }">
    <div class="field-label">
      <div class="field-name">
        {{ label }}
        <code v-if="jsonKey" class="field-key font-mono">{{ jsonKey }}</code>
      </div>
      <p v-if="hint" class="field-hint">{{ hint }}</p>
      <slot name="hint" />
    </div>
    <div class="field-control">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
  // A labelled settings row: name + description on the left, the control on the
  // right. `jsonKey` shows the underlying settings.json key (mono chip) so the
  // mapping to the raw file is always legible.
  defineProps<{
    label: string
    hint?: string
    jsonKey?: string
    danger?: boolean
  }>()
</script>

<style scoped lang="scss">
  .field {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-md) var(--space-xl);
    align-items: center;
    padding: var(--space-md) 0;
    border-top: 1px solid var(--line);
  }
  .field:first-child {
    border-top: none;
  }
  .field-name {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--fs-md);
    color: var(--text);
  }
  .field-key {
    font-size: var(--fs-2xs);
    color: var(--dim);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    padding: 1px 5px;
  }
  .field-hint {
    margin: var(--space-xs) 0 0;
    font-size: var(--fs-sm);
    color: var(--muted);
    max-width: 60ch;
  }
  .field-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-sm);
    min-width: 0;
  }
  .field--danger .field-name {
    color: var(--warn);
  }
  @media (max-width: 640px) {
    .field {
      grid-template-columns: 1fr;
      gap: var(--space-sm);
    }
    .field-control {
      justify-content: flex-start;
    }
  }
</style>
