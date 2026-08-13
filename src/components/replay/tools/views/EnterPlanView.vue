<template>
  <div class="tv">
    <!-- L'appel n'a rien à montrer : entrée vide sur les 15 du parc, et un
         résultat identique 15 fois sur 15 — 581 caractères d'anglais impératif
         adressés au modèle (« DO NOT write or edit any files yet »). La vue
         `plan` en faisait un `KeyValueList` sur un objet vide suivi du pavé
         brut. Une phrase suffit ; ce que l'appel déclenche se lit à la borne
         qui suit dans le fil. -->
    <p class="ep">
      <q-icon name="lock" size="15px" aria-hidden="true" />
      {{ t('replay.tools.views.enterPlan.what') }}
    </p>

    <!-- Jamais vu au parc — zéro erreur sur 15 appels — mais un refus de passage
         en mode plan n'aurait aucune autre trace. -->
    <OutputPane
      v-if="failed"
      :content="block.result?.content ?? ''"
      :is-error="true"
      :tool-use-id="block.id ?? ''"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from '@/services/projects';
import OutputPane from '../OutputPane.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

const failed = computed(() => props.block.result?.isError === true);
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.ep {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--muted);
}
.ep > .q-icon {
  flex-shrink: 0;
  color: var(--faint);
}
</style>
