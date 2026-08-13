<template>
  <!--
    La reconstruction du contexte, présentée à l'identique partout où on la montre.
    Un bouton ouvre un tiroir à droite ; le tiroir garde la largeur de lecture du
    flux intacte et reste visible pendant qu'on saute d'un tour à l'autre — ce que
    l'ancien encart inline, poussé hors de l'écran par le défilement, ne faisait
    pas. Les deux pages hôtes en partagent désormais cette seule source.
  -->
  <q-btn
    flat
    dense
    no-caps
    size="sm"
    icon="data_usage"
    :label="t('replay.context.drawer.open')"
    :aria-expanded="open"
    :aria-controls="drawerId"
    @click="open = !open"
  />

  <!--
    Téléporté au `body` : le bouton vit dans un en-tête à l'intérieur d'un
    conteneur `overflow-y: auto`, et la barre de défilement d'un scroller est
    peinte au-dessus de tous ses descendants — même en `position: fixed`. Elle
    passait donc devant le tiroir, et devant son fond cliquable. Teleport ne
    déplace que le DOM : le `QLayout` parent reste injecté normalement.
  -->
  <Teleport to="body">
    <q-drawer :id="drawerId" v-model="open" side="right" overlay bordered :width="360">
      <!-- Une fermeture explicite : le seul geste toujours disponible, quelle
           que soit la page hôte. -->
      <header class="cd-head">
        <h2 class="cd-title">{{ t('replay.context.drawer.title') }}</h2>
        <q-btn
          flat
          dense
          round
          size="sm"
          icon="close"
          :aria-label="t('replay.context.drawer.close')"
          @click="open = false"
        />
      </header>
      <ContextPanel
        :context="context"
        :cost-usd="costUsd"
        :cost-partial="costPartial"
        :live="live"
        @navigate="onNavigate"
      />
    </q-drawer>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import ContextPanel from './ContextPanel.vue';
import type { SessionContext } from 'src/services/projects';

withDefaults(
  defineProps<{
    context: SessionContext;
    costUsd?: number | null;
    costPartial?: boolean;
    /** Distingue les tiroirs si deux instances coexistaient un jour. */
    drawerId?: string;
    /** Session en cours : voir `ContextPanel`. Simplement transmis. */
    live?: boolean;
  }>(),
  { costUsd: null, costPartial: false, drawerId: 'context-drawer', live: false },
);

const { t } = useI18n();

const emit = defineEmits<{ navigate: [uuid: string] }>();

const open = ref(false);

/** Échap ferme le tiroir, comme n'importe quelle surface superposée. */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false;
}

watch(open, (v) => {
  if (v) window.addEventListener('keydown', onKeydown);
  else window.removeEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

/**
 * Relayer le saut vers un tour, et se fermer sur écran étroit — là, le tiroir
 * recouvre le flux, et l'on défilerait derrière lui.
 */
function onNavigate(uuid: string): void {
  emit('navigate', uuid);
  if (window.matchMedia('(max-width: 1023px)').matches) open.value = false;
}
</script>

<style scoped lang="scss">
// Même en-tête que HelpDrawer : titre à gauche, fermeture à droite.
.cd-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-sm) 0 var(--space-md);
}

.cd-title {
  flex: 1 1 auto;
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text);
}
</style>
