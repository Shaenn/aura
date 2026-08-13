<template>
  <div class="so">
    <p v-if="state.error" class="so-error">{{ state.error }}</p>

    <p v-else-if="state.loading" class="so-wait">{{ t('replay.shells.loading') }}</p>

    <p v-else-if="!state.text.trim()" class="so-wait">{{ t('replay.shells.empty') }}</p>

    <!--
      `v-html` sur une sortie de terminal : `ansiToHtml` échappe la source avant
      d'y poser ses `<span>`, c'est la garantie qui autorise ce rendu. Sans lui,
      un `pnpm dev` s'affiche truffé de `[32m` — la moitié de ce que Vite écrit
      est de la couleur.
    -->
    <pre v-else ref="pane" class="so-pane font-mono" v-html="html"></pre>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ansiToHtml } from '@/utils/ansi';

/** Ce que le panneau a réussi à charger, et où il en est. */
export interface OutputState {
  text: string;
  loading: boolean;
  error: string;
}

const { t } = useI18n();

const props = defineProps<{ state: OutputState }>();

const pane = useTemplateRef<HTMLElement>('pane');

const html = computed(() => ansiToHtml(props.state.text));

/**
 * Le pavé colle au bas.
 *
 * Ce qu'on vient lire d'un serveur qui tourne est sa dernière ligne — l'adresse
 * qu'il vient d'écrire, l'erreur qui vient de tomber. Un pavé qui reste en haut
 * demanderait de faire défiler à chaque rafraîchissement, c'est-à-dire toutes
 * les deux secondes.
 */
/**
 * La zone qui défile réellement au-dessus du pavé.
 *
 * Le pavé ne défile plus lui-même, donc `scrollTop` posé sur lui n'irait nulle
 * part. `scrollIntoView` non plus ne convient pas : il aligne le bas du pavé
 * sur le bord du conteneur, ce qui annule le rembourrage de celui-ci et colle
 * la dernière ligne au bord de la carte — mesuré à moins d'un pixel.
 */
function defileur(from: HTMLElement): HTMLElement | null {
  for (let node = from.parentElement; node; node = node.parentElement) {
    const flow = getComputedStyle(node).overflowY;
    if ((flow === 'auto' || flow === 'scroll') && node.scrollHeight > node.clientHeight)
      return node;
  }
  return null;
}

watch(
  () => props.state.text,
  async () => {
    await nextTick();
    const el = pane.value;
    if (!el) return;
    const zone = defileur(el);
    if (zone) zone.scrollTop = zone.scrollHeight;
  },
);
</script>

<style scoped lang="scss">
.so {
  margin-top: var(--space-xs);
}

/*
 * Le pavé ne défile pas lui-même.
 *
 * Il l'a fait, sur 220 px de haut, et cela mettait deux barres de défilement
 * l'une dans l'autre : la sienne et celle du panneau, qui est déjà borné à une
 * fraction de la colonne. On ne choisissait alors plus laquelle on faisait
 * glisser, et la dernière ligne restait coupée par le bord de la carte.
 * Une seule zone défile désormais, celle du panneau.
 */
.so-pane {
  margin: 0;
  padding: var(--space-sm);
  border-radius: var(--radius-xs);
  background: var(--surface);
  color: var(--text);
  font-size: var(--fs-2xs);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.so-wait,
.so-error {
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--fs-2xs);
  color: var(--faint);
}
.so-error {
  color: var(--danger);
}
</style>
