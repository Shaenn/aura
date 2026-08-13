<template>
  <q-btn-toggle
    v-model="model"
    :options="renderedOptions"
    no-caps
    unelevated
    dense
    :spread="spread"
    :clearable="clearable"
    :toggle-color="toggleColor"
    color="transparent"
    :text-color="$q.dark.isActive ? 'grey-4' : 'grey-8'"
    class="seg-control"
    :class="{ 'seg-control--wide': wide, 'seg-control--spread': spread }"
    :aria-label="ariaLabel"
  >
    <!-- Per-segment tooltips: options carrying a `tooltip` get a named slot that
         re-renders their label and anchors a q-tooltip to that button. -->
    <template v-for="opt in tooltipSlots" :key="opt.slot" #[opt.slot]>
      <!-- An option's `icon` is rendered by q-btn-toggle itself, alongside this
           slot rather than replaced by it: re-rendering it here would show it
           twice. Only the label and the tooltip belong in the slot. -->
      <span>{{ opt.label }}</span>
      <q-tooltip anchor="top middle" self="bottom middle">{{ opt.tooltip }}</q-tooltip>
    </template>
  </q-btn-toggle>
</template>

<script setup lang="ts" generic="T extends string | number | boolean">
// Design-system primitive: the "tech" segmented control — mono labels riding a
// recessed track, each segment a rounded pill, salmon fill on select. Encapsulates
// the dark-aware Quasar colors that were otherwise copy-pasted at every call site.
// The track carries the surface and border; segments are transparent until active.
import { computed } from 'vue';
import { useQuasar } from 'quasar';

const props = withDefaults(
  defineProps<{
    /**
     * Choices, e.g. [{ label: 'Non', value: false }, …]. Add `tooltip` for a
     * per-segment hint, `icon` for a Material name — q-btn-toggle draws it
     * before the label, which stays: a segment is never icon-only, so it always
     * has a readable name.
     */
    options: { label: string; value: T; tooltip?: string; icon?: string }[];
    /** Accessible name for the group. */
    ariaLabel?: string;
    /** Wider segments (easier hit targets); height stays compact. */
    wide?: boolean;
    /** Stretch segments to fill the container, each taking an equal share. */
    spread?: boolean;
    /** Allow clicking the already-selected segment to emit `null` (re-fires the active option). */
    clearable?: boolean;
    /** Quasar color of the selected segment (default salmon). */
    toggleColor?: string;
  }>(),
  { toggleColor: 'primary' },
);

const model = defineModel<T>({ required: true });
const $q = useQuasar();

// Options with a tooltip are rendered through a named slot (q-btn-toggle's
// per-option `slot` field); the rest render their label normally.
const renderedOptions = computed(() =>
  // When an option uses a slot, drop its `label` — q-btn-toggle would otherwise
  // render both the label and the slot content (duplicated text). The slot re-emits the label.
  props.options.map((o, i) => (o.tooltip ? { ...o, label: '', slot: `seg-${String(i)}` } : o)),
);
const tooltipSlots = computed(() =>
  props.options.map((o, i) => ({ ...o, slot: `seg-${String(i)}` })).filter((o) => o.tooltip),
);
</script>

<style scoped lang="scss">
/* The track: a recessed surface with a gutter, so segments read as pills sitting
   inside it rather than as one bar sliced by dividers. */
.seg-control {
  flex-wrap: wrap; // let segments wrap in narrow containers (e.g. the docked form)
  gap: var(--space-xs);
  padding: var(--space-xs);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
/* Spread: fill the container, equal-width segments, no wrap. */
.seg-control--spread {
  width: 100%;
  flex-wrap: nowrap;
}
/* `.q-btn-item.q-btn` outranks q-btn-group's own `:not(:first-child)` radius
   resets, which would otherwise square off every segment but the outer two. */
.seg-control :deep(.q-btn-item.q-btn) {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-sm);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums; // digit labels (years, counts) stay aligned
  border-radius: var(--radius-xs);
}
/* An option rendered through its tooltip slot loses the spacing Quasar puts
   between a native icon and its label — the slot's span is not that label. The
   selector only bites when both are present, so icon-less segments are untouched. */
.seg-control :deep(.q-btn__content > .q-icon + span) {
  margin-left: var(--space-xs);
}

/* Wider hit targets — horizontal only, height stays compact. The "Facturable"
   use is a touch larger (its labels are short), so bump it one step. */
.seg-control--wide :deep(.q-btn) {
  min-width: 96px;
  padding: var(--space-xs) 28px;
  font-size: var(--fs-base);
}
</style>
