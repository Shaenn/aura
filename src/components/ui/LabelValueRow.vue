<template>
  <div class="kv-row">
    <span class="kv-row__key">{{ label }}</span>
    <span class="kv-row__value"
      ><slot>{{ value }}</slot></span
    >
  </div>
</template>

<script setup lang="ts">
  // Design-system primitive: a two-column "key | value" row (mono uppercase key,
  // wrapping value). Used in the calendar event tooltip; the value slot lets the
  // caller keep custom markup (e.g. .font-mono on a duration).
  //
  // Scoped styles are registered globally by Vue, so this works inside a teleported
  // q-tooltip — unlike plain scoped CSS in the host page.
  defineProps<{
    /** Key shown in the left column. */
    label: string
    /** Value shown in the right column when no default slot is given. */
    value?: string | number | undefined
  }>()
</script>

<style scoped lang="scss">
  .kv-row {
    display: grid;
    grid-template-columns: 58px 1fr;
    gap: var(--space-sm);
    align-items: baseline;
  }
  .kv-row__key {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: var(--fs-2xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  /* Let the value column shrink and wrap instead of widening the container. */
  .kv-row__value {
    min-width: 0;
    overflow-wrap: break-word;
  }
</style>
