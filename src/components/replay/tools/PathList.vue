<template>
  <div class="pl">
    <p v-if="showCount" class="pl-count">
      {{ t('replay.tools.paths.count', total) }}
      <span v-if="order" class="pl-order">· {{ order }}</span>
    </p>
    <p v-if="root" class="pl-root font-mono" :title="root">{{ root }}</p>
    <ul class="pl-list">
      <li v-for="p in shown" :key="p" class="pl-item" :title="p">
        <q-icon :name="icon" size="13px" aria-hidden="true" />
        <span class="pl-dir font-mono">{{ dirOf(strip(p)) }}</span>
        <span class="pl-base font-mono">{{ baseOf(p) }}</span>
      </li>
    </ul>
    <p v-if="overflow" class="pl-note">
      {{ t('replay.tools.paths.overflow', overflow) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { basename, dirname } from './language';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// One rendering for every "here are the files" answer — Glob's, Grep's in
// `files_with_matches` mode, SendUserFile's. They used to drift apart.
const props = withDefaults(
  defineProps<{
    paths: string[];
    icon?: string;
    max?: number;
    showCount?: boolean;
    /**
     * Dossier commun à tous les chemins, écrit une fois au-dessus de la liste au
     * lieu d'ouvrir chaque ligne. La colonne du dossier est coupée par la droite
     * quand elle déborde : sans ce repli, un préfixe long mange justement le
     * segment qui distingue les fichiers entre eux.
     */
    root?: string;
    /** Ce que l'ordre de la liste veut dire, quand il en a un. */
    order?: string;
  }>(),
  { icon: 'insert_drive_file', max: 200, showCount: true, root: '', order: '' },
);

const total = computed(() => props.paths.length);
const shown = computed(() => props.paths.slice(0, props.max));
const overflow = computed(() => Math.max(0, total.value - shown.value.length));

/** Le chemin sans le dossier commun ; l'infobulle, elle, garde le chemin entier. */
const strip = (p: string): string =>
  props.root && p.startsWith(props.root) ? p.slice(props.root.length) : p;

const baseOf = (p: string): string => basename(p);
const dirOf = (p: string): string => {
  const d = dirname(p);
  return d ? `${d}/` : '';
};
</script>

<style scoped lang="scss">
.pl {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.pl-count {
  margin: 0;
  font-size: var(--fs-2xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--dim);
}
.pl-order {
  text-transform: none;
  letter-spacing: normal;
  color: var(--faint);
}
.pl-root {
  margin: 0;
  font-size: var(--fs-2xs);
  color: var(--faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow: auto;
}
.pl-item {
  display: flex;
  // Le chemin tient sur une ligne : `center` aligne le glyphe dessus sans avoir
  // à lui calculer une hauteur. Un `q-icon` n'a pas de ligne de base utile —
  // `baseline` le posait deux pixels trop bas sur chaque ligne de la liste.
  // Voir la même correction dans `GrepView` et `PlanView`.
  align-items: center;
  gap: var(--space-xs);
  padding: 1px var(--space-xs);
  font-size: var(--fs-xs);
  white-space: nowrap;
  overflow: hidden;
  color: var(--dim);
}
.pl-item:hover {
  background: var(--hover-overlay);
}
.pl-dir {
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-base {
  color: var(--text);
  flex-shrink: 0;
}
.pl-note {
  margin: 0;
  font-size: var(--fs-2xs);
  color: var(--faint);
  font-style: italic;
}
</style>
