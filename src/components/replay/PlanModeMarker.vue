<template>
  <!-- Une borne, pas un tour : ce qui change ici, c'est ce que la session a le
       droit de faire. -->
  <section class="pm" :class="`pm--${mark.phase}`">
    <p class="pm-head">
      <q-icon :name="icon" size="15px" aria-hidden="true" />
      <span class="pm-title">{{ title }}</span>
      <span v-if="scope" class="pm-scope font-mono">{{ scope }}</span>
    </p>
    <p class="pm-what">{{ what }}</p>
    <p v-if="file" class="pm-file font-mono" :title="mark.planFilePath">
      <q-icon name="assignment" size="13px" aria-hidden="true" />
      {{ file }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PlanModeMark } from 'src/services/projects';

const props = defineProps<{ mark: PlanModeMark }>();

const { t } = useI18n();

const icon = computed(() =>
  props.mark.phase === 'exit' ? 'lock_open' : props.mark.phase === 'reentry' ? 'replay' : 'lock',
);

const title = computed(() => t(`replay.planMode.${props.mark.phase}`));

/**
 * Ce que le régime interdit, dit une fois. À l'entrée, `planExists` distingue le
 * plan neuf du plan repris — `false` 93 fois sur 142, `true` 49.
 */
const what = computed(() => {
  if (props.mark.phase === 'exit') return t('replay.planMode.whatExit');
  if (props.mark.phase === 'reentry') return t('replay.planMode.whatReentry');
  return t(props.mark.planExists ? 'replay.planMode.whatResume' : 'replay.planMode.whatNew');
});

/**
 * La portée, annoncée d'emblée. Absente quand le régime n'est pas clos — 12
 * sessions du parc finissent dedans, et rien ne dit combien de tours il aurait
 * couverts de plus.
 */
const scope = computed(() => {
  const n = props.mark.turns;
  if (props.mark.phase !== 'enter' || typeof n !== 'number' || n <= 0) return '';
  return t('replay.planMode.scope', n);
});

/** Le nom du fichier suffit : les plans sont tous dans `~/.claude/plans`. */
const file = computed(() => props.mark.planFilePath.replace(/\\/g, '/').split('/').pop() ?? '');
</script>

<style scoped lang="scss">
.pm {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--line);
  border-left: 2px solid var(--brand-line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.pm--exit {
  border-left-color: var(--line-2);
}
.pm-head {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--brand);
}
.pm--exit .pm-head {
  color: var(--muted);
}
.pm-scope {
  margin-left: auto;
  text-transform: none;
  letter-spacing: 0;
  color: var(--faint);
  font-size: var(--fs-2xs);
}
.pm-what {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--muted);
}
.pm-file {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: var(--fs-2xs);
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
