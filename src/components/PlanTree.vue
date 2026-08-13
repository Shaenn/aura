<template>
  <ul class="pt-years">
    <li v-for="y in years" :key="y.key">
      <button
        type="button"
        class="pt-node"
        :aria-expanded="isOpen(y.key)"
        :aria-label="
          isOpen(y.key)
            ? t('common.collapse', { label: t('pages.project.year', { year: y.label }) })
            : t('common.expand', { label: t('pages.project.year', { year: y.label }) })
        "
        @click="toggle(y.key)"
      >
        <q-icon
          :name="isOpen(y.key) ? 'expand_more' : 'chevron_right'"
          size="14px"
          aria-hidden="true"
        />
        <q-icon name="calendar_month" size="13px" aria-hidden="true" />
        <span class="pt-node-name font-mono">{{ y.label }}</span>
        <span class="pt-count font-mono">{{ y.count }}</span>
      </button>

      <ul v-if="isOpen(y.key)" class="pt-months">
        <li v-for="m in y.months" :key="m.key">
          <button
            type="button"
            class="pt-node"
            :aria-expanded="isOpen(m.key)"
            :aria-label="
              isOpen(m.key)
                ? t('common.collapse', { label: `${m.label} ${y.label}` })
                : t('common.expand', { label: `${m.label} ${y.label}` })
            "
            @click="toggle(m.key)"
          >
            <q-icon
              :name="isOpen(m.key) ? 'expand_more' : 'chevron_right'"
              size="14px"
              aria-hidden="true"
            />
            <span class="pt-node-name">{{ m.label }}</span>
            <span class="pt-count font-mono">{{ m.plans.length }}</span>
          </button>

          <ul v-if="isOpen(m.key)" class="pt-plans">
            <li v-for="p in m.plans" :key="p.name">
              <button
                type="button"
                class="pt-plan"
                :class="{ 'pt-plan--active': activeName === p.name }"
                :aria-current="activeName === p.name ? 'true' : undefined"
                @click="$emit('open', p)"
              >
                <q-icon name="assignment" size="13px" aria-hidden="true" />
                <span class="pt-plan-title">{{ p.title }}</span>
                <span class="pt-plan-meta font-mono">{{ dayOf(p.mtime) }}</span>
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PlanInfo } from '@/services/system';
import { fmtMonth } from '@/utils/format';

const { t } = useI18n();

const props = defineProps<{ plans: PlanInfo[]; activeName: string }>();
defineEmits<{ open: [plan: PlanInfo] }>();

interface PlanMonth {
  key: string; // `${year}-${month}`, also the expand key
  label: string; // « juillet »
  plans: PlanInfo[];
}
interface PlanYear {
  key: string; // `${year}`
  label: string;
  count: number;
  months: PlanMonth[];
}

/** Plans bucketed by year then month, newest first — they arrive already sorted. */
const years = computed<PlanYear[]>(() => {
  const byYear = new Map<number, Map<number, PlanInfo[]>>();
  for (const p of props.plans) {
    const d = new Date(p.mtime);
    const y = d.getFullYear();
    const m = d.getMonth();
    let months = byYear.get(y);
    if (!months) byYear.set(y, (months = new Map()));
    const bucket = months.get(m);
    if (bucket) bucket.push(p);
    else months.set(m, [p]);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, months]) => ({
      key: String(y),
      label: String(y),
      count: [...months.values()].reduce((n, arr) => n + arr.length, 0),
      months: [...months.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([m, plans]) => ({
          key: `${y}-${m}`,
          label: fmtMonth(new Date(y, m, 1).getTime()),
          plans,
        })),
    }));
});

/** The newest year and its newest month start open; everything else stays folded. */
const defaultOpen = computed(() => {
  const y = years.value[0];
  const m = y?.months[0];
  return new Set([y?.key, m?.key].filter((k): k is string => Boolean(k)));
});

const overrides = reactive<Record<string, boolean>>({});
const isOpen = (key: string): boolean => overrides[key] ?? defaultOpen.value.has(key);
function toggle(key: string): void {
  overrides[key] = !isOpen(key);
}

/** Day only — the month is already the parent node. */
const dayOf = (ms: number): string => String(new Date(ms).getDate()).padStart(2, '0');
</script>

<style scoped lang="scss">
.pt-years,
.pt-months,
.pt-plans {
  list-style: none;
  margin: 0;
  padding: 0;
}
// Chaque niveau est décalé sous son parent, avec un trait d'appartenance.
.pt-months,
.pt-plans {
  margin-left: calc(var(--space-sm) + 6px);
  padding-left: var(--space-sm);
  border-left: 1px solid var(--line-2);
}
.pt-node {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--fs-xs);
  color: var(--muted);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  text-align: left;
  cursor: pointer;
  transition: background var(--motion-fast);
}
.pt-node:hover {
  background: var(--hover-overlay);
}
.pt-node:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}
.pt-node .q-icon {
  color: var(--faint);
  flex: 0 0 auto;
}
.pt-node-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pt-count {
  flex: 0 0 auto;
  font-size: var(--fs-2xs);
  color: var(--faint);
}
.pt-plan {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  padding: var(--space-sm);
  background: none;
  border: none;
  border-left: 2px solid transparent;
  border-radius: var(--radius-sm);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--motion-fast),
    border-color var(--motion-fast);
}
.pt-plan:hover {
  background: var(--hover-overlay);
}
.pt-plan:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}
.pt-plan--active {
  background: var(--brand-soft);
  border-left-color: var(--brand);
}
.pt-plan .q-icon {
  color: var(--brand);
  flex: 0 0 auto;
  align-self: center;
}
.pt-plan-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pt-plan-meta {
  flex: 0 0 auto;
  font-size: var(--fs-2xs);
  color: var(--faint);
}
</style>
