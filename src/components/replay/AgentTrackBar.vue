<template>
  <!--
    Les pistes de la session : le fil principal, puis un onglet par sous-agent.

    `q-tabs` plutôt qu'une rangée de `q-chip` : il apporte `role="tablist"`,
    `aria-selected`, un seul arrêt de tabulation pour toute la barre (les flèches
    circulent dedans) et, au débordement, ses propres chevrons de défilement.
    Une session à douze agents tiendrait donc sur une ligne — ce qui est
    obligatoire ici : la barre est épinglée en haut du flux, et si elle passait à
    la ligne elle mangerait la lecture à chaque agent de plus.
  -->
  <q-tabs
    v-model="tab"
    dense
    no-caps
    align="left"
    outside-arrows
    mobile-arrows
    indicator-color="transparent"
    class="atb"
    :aria-label="t('replay.tracks.aria')"
  >
    <q-tab :id="trackTabId(MAIN_TRACK)" :name="MAIN_TAB" :ripple="false" class="atb-tab">
      <span class="atb-inner">
        <q-icon name="forum" size="14px" aria-hidden="true" />
        <span class="atb-name">{{ t('replay.tracks.main') }}</span>
        <span v-if="mainCount" class="atb-count font-mono" aria-hidden="true">{{ mainCount }}</span>
        <!-- La virgule sépare à l'oreille ce que la mise en page sépare à l'œil :
             sans elle, « Principal » et le compte se lisent d'un seul tenant. -->
        <span class="sr-only">, {{ t('replay.tracks.mainCount', mainCount) }}</span>
      </span>
    </q-tab>

    <q-tab
      v-for="run in runs"
      :id="trackTabId(run.agentId)"
      :key="run.agentId"
      :name="run.agentId"
      :ripple="false"
      class="atb-tab"
    >
      <span class="atb-inner">
        <!-- La teinte vient de `agentColorOf`, la même que le filet du flux : un
             agent se reconnaît d'une vue à l'autre. Le halo suit la teinte, sinon
             une piste bleue respirerait en vert. -->
        <span
          class="status-dot atb-dot"
          :class="{ 'status-dot--live': run.status === 'running' }"
          :style="{ background: colorOf(run), '--dot-glow': colorOf(run) }"
          aria-hidden="true"
        />
        <span class="atb-name">{{ nameOf(run) }}</span>
        <q-icon
          v-if="run.status === 'completed'"
          name="check"
          size="13px"
          class="atb-done"
          aria-hidden="true"
        />
        <q-icon
          v-else-if="run.status === 'failed'"
          name="error_outline"
          size="13px"
          class="atb-failed"
          aria-hidden="true"
        />
        <span class="atb-count font-mono" aria-hidden="true">{{ run.turns }}</span>
        <!-- Le nom visible entre déjà dans le nom accessible ; ceci le complète
             de ce que la couleur et l'icône disent à l'œil seul. -->
        <span class="sr-only">{{ srDetail(run) }}</span>
        <q-tooltip v-if="run.description" anchor="bottom middle" self="top middle">
          {{ run.description }}
        </q-tooltip>
      </span>
    </q-tab>
  </q-tabs>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SubagentRunSummary } from 'src/services/projects';
import { agentColorOf } from 'src/utils/agentColors';
import { MAIN_TRACK, trackTabId, type TrackId } from 'src/composables/useAgentTracks';

const props = withDefaults(
  defineProps<{
    /** Les runs de la session, du plus ancien au plus récent. */
    runs: SubagentRunSummary[];
    /** La piste affichée : `''` pour le fil principal, sinon un `agentId`. */
    modelValue: TrackId;
    /** Ce qui reste au fil principal, affiché sur son onglet. */
    mainCount?: number;
  }>(),
  { mainCount: 0 },
);

const emit = defineEmits<{ 'update:modelValue': [track: TrackId] }>();

const { t } = useI18n();

/**
 * `q-tabs` traite la chaîne vide comme « aucun onglet » et n'en surlignerait
 * aucun. Le fil principal prend donc un nom à lui dans la barre, traduit ici, et
 * la piste reste `''` partout ailleurs — c'est l'absence d'agent qui la définit.
 */
const MAIN_TAB = '__main__';

const tab = computed<string>({
  get: () => props.modelValue || MAIN_TAB,
  set: (v) => emit('update:modelValue', v === MAIN_TAB ? MAIN_TRACK : v),
});

const colorOf = (run: SubagentRunSummary): string => agentColorOf(run);

const nameOf = (run: SubagentRunSummary): string => run.agentType ?? t('replay.tracks.subagent');

/**
 * Les types d'agent portés par plusieurs runs.
 *
 * Huit teintes ne séparent pas plus de huit agents, et deux runs du *même* agent
 * partagent de toute façon la couleur et le nom : à l'écran ils se distinguent
 * par leur position, ce dont un lecteur d'écran ne dispose pas. On leur ajoute
 * alors le début de leur identifiant, et à eux seuls — l'ajouter partout
 * alourdirait chaque onglet pour un cas qui ne se produit pas.
 */
const ambiguous = computed(() => {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const run of props.runs) {
    const key = nameOf(run);
    if (seen.has(key)) twice.add(key);
    seen.add(key);
  }
  return twice;
});

function srDetail(run: SubagentRunSummary): string {
  const parts = [t(`replay.tracks.status.${run.status}`), t('replay.tracks.turns', run.turns)];
  if (ambiguous.value.has(nameOf(run))) {
    parts.unshift(t('replay.tracks.id', { id: run.agentId.slice(0, 8) }));
  }
  return `, ${parts.join(', ')}`;
}
</script>

<style scoped lang="scss">
/*
  Une barre de navigation, pas un bandeau : elle se pose sur le fond du flux et
  ne se sépare que par un filet, la carte du dessous portant déjà l'ombre.
*/
.atb {
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

.atb-tab {
  min-height: 0;
  padding: 0;
}
.atb-tab :deep(.q-tab__content) {
  min-width: 0;
  padding: var(--space-xs) var(--space-sm);
}

.atb-inner {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
  font-size: var(--fs-xs);
}

/* Le nom est ce qui se coupe en premier : l'état et le compte tiennent en
   quelques caractères et disent, eux, où en est la piste. */
.atb-name {
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.atb-dot {
  flex: none;
}

.atb-done {
  color: var(--pulse);
}
.atb-failed {
  color: var(--danger);
}

.atb-count {
  flex: none;
  font-size: var(--fs-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--faint);
}

/* L'onglet actif s'affirme par le texte, la teinte de la pastille restant celle
   de l'agent — deux couleurs concurrentes sur un même onglet ne se lisent pas. */
.atb :deep(.q-tab--active) {
  color: var(--text);
  background: var(--hover-overlay);
}
</style>
