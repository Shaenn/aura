<template>
  <!-- Inline: caption sits on the same row as the control (e.g. "Facturable"). -->
  <div v-if="inline" class="row items-center q-gutter-sm">
    <span class="section-label">{{ label }}</span>
    <slot />
  </div>

  <!-- Block: caption above the control, optional hint below (e.g. "Durée"). -->
  <div v-else>
    <div class="section-label q-mb-xs">{{ label }}</div>
    <slot />
    <p v-if="hasHint" class="form-section__hint text-caption q-mt-xs q-mb-none">
      <slot name="hint">{{ hint }}</slot>
    </p>
  </div>
</template>

<script setup lang="ts">
  // Design-system primitive: a labelled form section. Pairs a mono uppercase
  // caption (.section-label) with a control, either stacked (default, with an
  // optional hint) or inline.
  import { computed, useSlots } from 'vue'

  const props = defineProps<{
    /** Caption text (rendered as .section-label). */
    label: string
    /** Inline layout: caption beside the control instead of above it. */
    inline?: boolean
    /** Optional hint text below the control (block layout). The #hint slot wins. */
    hint?: string
  }>()

  const slots = useSlots()
  const hasHint = computed(() => !!slots.hint || !!props.hint)
</script>

<style scoped lang="scss">
  .form-section__hint {
    color: var(--muted);
  }
</style>
