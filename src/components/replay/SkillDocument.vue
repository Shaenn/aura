<template>
  <details class="sd" :open="open" @toggle="onToggle">
    <summary class="sd-head">
      <q-icon name="extension" size="15px" aria-hidden="true" />
      <span class="sd-name font-mono">{{ doc.name }}</span>
      <span class="sd-what">{{ t('replay.skillDoc.loaded') }}</span>
      <span v-if="doc.origin" class="sd-origin">{{
        t(`replay.skillDoc.origin.${doc.origin}`)
      }}</span>
      <span class="sd-size font-mono">{{ size }}</span>
    </summary>
    <!-- Rendu à l'ouverture seulement. Replié ne suffit pas : un `<details>`
         fermé garde ses enfants dans le DOM, et le manuel de `claude-api` y
         pesait 20 198 nœuds — 84 % de ceux de la page — pour rien. -->
    <div v-if="open" class="sd-body">
      <p v-if="doc.dir" class="sd-dir font-mono" :title="doc.dir">{{ doc.dir }}</p>
      <MarkdownView :source="doc.body" />
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MarkdownView from './MarkdownView.vue';
import { useExpandable, syncDetails } from '@/composables/useExpandAll';
import type { SkillDoc } from './skillDocument';
import { fmtInt } from '@/utils/format';

const { t } = useI18n();

const props = defineProps<{ doc: SkillDoc }>();

// Replié par défaut, et c'est tout l'objet du composant : le manuel de
// `claude-api` fait 8 831 lignes, et déplié il occupait 219 319 pixels de haut
// pour 20 198 nœuds — 95 % de la hauteur de la page et 84 % de son DOM, sous la
// seule étiquette « Système (contexte) ».
const open = useExpandable(false);
const onToggle = syncDetails(open);

const size = computed(() => {
  const n = props.doc.lines;
  return t('replay.skillDoc.lines', { n: fmtInt(n) }, n);
});
</script>

<style scoped lang="scss">
.sd {
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--surface-2);
}
.sd-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  cursor: pointer;
  font-size: var(--fs-sm);
  color: var(--muted);
  list-style: none;
}
.sd-head::-webkit-details-marker {
  display: none;
}
.sd-head > .q-icon {
  flex-shrink: 0;
  color: var(--faint);
}
.sd-name {
  color: var(--text);
  word-break: break-all;
}
.sd-origin {
  font-size: var(--fs-2xs);
  color: var(--faint);
  border: 1px solid currentcolor;
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
}
.sd-size {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--fs-xs);
  color: var(--faint);
}
.sd-body {
  padding: 0 var(--space-sm) var(--space-sm);
  border-top: 1px solid var(--line);
}
.sd-dir {
  margin: var(--space-sm) 0;
  font-size: var(--fs-2xs);
  color: var(--faint);
  word-break: break-all;
}
</style>
