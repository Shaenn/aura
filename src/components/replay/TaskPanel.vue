<template>
  <div class="tk">
    <!--
      Tout ce qui précède tient derrière un seul repli.

      Une session qui mène un plan à son terme puis en rouvre un autre affichait
      19 lignes dont 9 barrées, et poussait le travail du moment sous la ligne de
      flottaison de la colonne. Un repli par plan n'aurait fait que déplacer le
      problème : certaines sessions en posent six. Une ligne, quel que soit le
      nombre de plans — et ce qui a été fait reste à un clic.
    -->
    <button
      v-if="past.length"
      type="button"
      class="tk-past"
      :aria-expanded="open"
      :aria-controls="pastId"
      @click="open = !open"
    >
      <q-icon :name="open ? 'expand_less' : 'expand_more'" size="16px" aria-hidden="true" />
      <span class="tk-past-name">{{
        past.length > 1 ? t('replay.tasks.pastMany') : t('replay.tasks.pastOne')
      }}</span>
      <q-space />
      <span class="tk-past-count font-mono">{{ pastDone }} / {{ pastTotal }}</span>
    </button>

    <div v-if="past.length && open" :id="pastId" class="tk-past-body">
      <section v-for="w in past" :key="w.index" class="tk-past-wave">
        <!-- Le rang n'a de sens que s'il y en a plusieurs à distinguer. -->
        <h3 v-if="past.length > 1" class="tk-past-title">
          {{ t('replay.tasks.planN', { n: w.index }) }}
        </h3>
        <TaskLines
          :tasks="w.tasks"
          :label="t('replay.tasks.planTasks', { n: w.index })"
          @navigate="emit('navigate', $event)"
        />
      </section>
    </div>

    <TaskLines
      v-if="progress.currentWave"
      :tasks="progress.currentWave.tasks"
      :label="currentLabel"
      @navigate="emit('navigate', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import TaskLines from './TaskLines.vue';
import type { TaskProgress } from './taskList';

const { t } = useI18n();

const props = defineProps<{ progress: TaskProgress }>();
const emit = defineEmits<{ navigate: [uuid: string] }>();

const pastId = useId();
const open = ref(false);

/** Les plans menés à leur terme avant celui qui court. */
const past = computed(() => props.progress.waves.slice(0, -1));
const pastTotal = computed(() => past.value.reduce((n, w) => n + w.tasks.length, 0));
const pastDone = computed(() => past.value.reduce((n, w) => n + w.done, 0));

/**
 * Une session qui n'a posé qu'un plan n'a pas de « plan courant » : sa liste est
 * *la* liste, et la nommer autrement inventerait une couture qui n'existe pas.
 */
const currentLabel = computed(() =>
  props.progress.waves.length > 1 ? t('replay.tasks.currentPlan') : t('replay.tasks.sessionTasks'),
);
</script>

<style scoped lang="scss">
.tk {
  padding: var(--space-sm) var(--space-md) var(--space-md);
}

/*
  La ligne des plans clos : une couture, pas une tâche.

  Elle garde le rembourrage des lignes qu'elle coiffe pour rester dans la même
  colonne, mais s'écrit plus petite et sans icône d'état — ce n'est pas un
  travail de plus, c'est ce qui sépare deux travaux.
*/
.tk-past {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  width: 100%;
  padding: var(--space-xs);
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--faint);
  font: inherit;
  font-size: var(--fs-xs);
  text-align: left;
  cursor: pointer;
  transition: background var(--motion-fast);
}
.tk-past:hover {
  background: var(--hover-overlay);
}
.tk-past:focus-visible {
  outline: 1px solid var(--brand);
  outline-offset: -1px;
}
.tk-past-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tk-past-count {
  flex: none;
  font-size: var(--fs-2xs);
  font-variant-numeric: tabular-nums;
}

/* Ce qu'on rouvre s'enfonce d'un cran, et se sépare du plan courant par le trait
   qui dit où le travail d'aujourd'hui commence. */
.tk-past-body {
  padding-left: var(--space-sm);
  padding-bottom: var(--space-xs);
  margin-bottom: var(--space-xs);
  border-bottom: 1px solid var(--line);
}
.tk-past-wave + .tk-past-wave {
  margin-top: var(--space-xs);
}
.tk-past-title {
  margin: 0 0 2px var(--space-xs);
  font-size: var(--fs-2xs);
  font-weight: 600;
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
