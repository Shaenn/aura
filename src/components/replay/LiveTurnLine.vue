<template>
  <!--
    Ce qui se passe pendant que le fil ne bouge pas.
    Absente au repos : elle ne réserve pas de place sous le flux, et c'est son
    apparition même qui porte le signal.
  -->
  <div v-if="active" class="ltl" role="status">
    <PulseDots />
    <span class="ltl-label">{{ label }}</span>
    <!-- Retiré de la lecture d'écran : une seconde de plus n'est pas une
         nouvelle, et l'annoncer couvrirait le reste. -->
    <span v-if="silence" class="ltl-since font-mono" aria-hidden="true">{{ silence }}</span>
    <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
      {{ t('replay.live.hint') }}
    </q-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PulseDots from 'src/components/ui/PulseDots.vue';
import { fmtDuration } from 'src/utils/format';

const { t } = useI18n();

const props = defineProps<{
  /**
   * La session travaille-t-elle ? Décidé par l'appelant à partir du statut du
   * CLI, seul signal qui distingue « en train de produire » de « vous attend » —
   * le transcript, lui, se tait dans les deux cas.
   */
  active: boolean;
  /**
   * L'horodatage du dernier événement reçu, et non le début du tour.
   *
   * C'est la seule quantité qu'on connaisse exactement : une ligne arrêtée
   * atteint le disque en ~200 ms. Le début du tour viendrait du fichier d'état,
   * qui n'est réécrit qu'aux changements de statut et peut donc dater. Un
   * compteur qui repose sur une donnée fausse est pire qu'aucun compteur.
   */
  since: number | null;
  /** L'outil en vol, s'il y en a un : il se nomme mieux qu'il ne se décrit. */
  tool?: string | undefined;
}>();

/**
 * L'horloge du composant, qui n'avance que pendant qu'on regarde.
 *
 * Même choix que l'`ActivityLine` de l'Atelier : le compteur court côté client
 * à partir d'un instant, plutôt que de coûter une trame réseau par seconde.
 */
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;

watch(
  () => props.active,
  (running) => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
    if (!running) return;
    now.value = Date.now();
    ticker = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  },
  { immediate: true },
);

onUnmounted(() => {
  if (ticker) clearInterval(ticker);
});

/**
 * Un outil en vol se nomme ; sinon on dit ce qu'on sait, qui est peu.
 *
 * « Bash » apprend davantage que « travail en cours », et un nom qui tourne
 * depuis quinze secondes ne se lit pas comme un blocage — un compteur nu, si.
 */
const label = computed(() => props.tool || t('replay.live.label'));

/** Depuis quand rien n'est arrivé. Muet sous la seconde : il n'y a rien à dire. */
const silence = computed(() => {
  if (props.since === null) return '';
  const ms = now.value - props.since;
  return ms < 1000 ? '' : fmtDuration(ms);
});
</script>

<style scoped lang="scss">
.ltl {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  // Même respiration que l'`ActivityLine` de l'Atelier : la ligne prolonge le
  // flux, elle ne s'en détache pas.
  padding: var(--space-xs) var(--space-md);
  font-size: var(--fs-xs);
  color: var(--muted);
}

.ltl-label {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ltl-since {
  font-size: var(--fs-2xs);
  color: var(--faint);
  flex: none;
}
</style>
