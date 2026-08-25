<template>
  <fieldset class="qf">
    <legend>
      <span class="qf-tag font-mono">{{ question.header }}</span>
      {{ question.question }}
      <span v-if="question.multiSelect" class="qf-multi font-mono">{{ t('agent.ask.multiSelect') }}</span>
    </legend>

    <q-option-group
      :model-value="modelValue"
      :options="options"
      :type="question.multiSelect ? 'checkbox' : 'radio'"
      :multiple="question.multiSelect ?? false"
      color="primary"
      dense
      class="qf-group"
      @update:model-value="(v) => emit('update:modelValue', v as string | string[])"
    >
      <template #label="opt">
        <span class="qf-opt">
          <span class="qf-opt-top">
            <!-- La marque est un repère, pas une commande : c'est la carte qui
                 se coche, et la même icône que le rejeu emploie pour dire ce qui
                 a été retenu. -->
            <q-icon :name="markOf(opt.value)" size="16px" class="qf-opt-mark" aria-hidden="true" />
            <span class="qf-opt-label">{{ opt.label }}</span>
          </span>
          <span v-if="opt.description" class="qf-opt-desc">{{ opt.description }}</span>
          <!-- La maquette qu'on est censé comparer : sans elle, la question se
               réduit à des libellés qui ne disent pas ce qu'ils désignent. -->
          <pre v-if="opt.preview" class="qf-opt-preview font-mono">{{ opt.preview }}</pre>
        </span>
      </template>
    </q-option-group>
  </fieldset>
</template>

<script setup lang="ts">
  // Une question et ses options — l'unité que le formulaire montre, seule ou par
  // étapes. Sortie d'`AskPrompt` parce que le stepper en rend une par étape et le
  // cas à une question la rend nue : deux appelants pour la même chose.
  //
  // L'option est une carte entière, et c'est la carte qui porte la sélection —
  // comme au rejeu, où une réponse retenue se lit à son cadre et non à un point
  // coché. Le contrôle dessiné par Quasar est donc masqué, jamais retiré : le
  // rôle, l'état et le clavier vivent sur la racine du composant (`role="radio"`,
  // `aria-checked`, `tabindex`), et c'est elle que l'on habille.
  import type { AskQuestion } from '@/services/agent'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'

  const props = defineProps<{ question: AskQuestion; modelValue: string | string[] | undefined }>()
  const emit = defineEmits<{ 'update:modelValue': [string | string[]] }>()

  const { t } = useI18n()

  /** La valeur d'une option est son libellé : c'est ce que le harness inscrit. */
  const options = computed(() =>
    props.question.options.map((o) => ({
      label: o.label,
      value: o.label,
      description: o.description,
      preview: o.preview ?? '',
    })),
  )

  function picked(value: string): boolean {
    return Array.isArray(props.modelValue) ? props.modelValue.includes(value) : props.modelValue === value
  }

  /** Le vocabulaire d'icônes suit la nature du choix : un rond, ou une case. */
  function markOf(value: string): string {
    if (props.question.multiSelect) {
      return picked(value) ? 'check_box' : 'check_box_outline_blank'
    }
    return picked(value) ? 'radio_button_checked' : 'radio_button_unchecked'
  }
</script>

<style scoped>
  /* `min-width: 0` sur un `fieldset` n'est pas une précaution : la feuille de
   style du navigateur lui pose `min-inline-size: min-content`, et lui seul. Une
   maquette ASCII de 120 colonnes lui donnait donc une largeur minimale de 951 px
   dans une carte qui en offre 912 — d'où un dialogue qui défilait
   horizontalement, et une option rognée dès qu'on y touchait. */
  .qf {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .qf legend {
    font-size: var(--fs-base);
    color: var(--text);
    padding: 0;
    margin-bottom: var(--space-xs);
  }

  .qf-tag {
    display: inline-block;
    font-size: var(--fs-2xs);
    color: var(--brand);
    background: var(--brand-soft);
    border-radius: var(--radius-xs);
    padding: 1px var(--space-xs);
    margin-right: var(--space-sm);
  }

  /* Dit ce que le nombre de cases ne dit pas encore : plusieurs réponses sont
   attendues. Le rejeu porte la même mention, au même endroit. */
  .qf-multi {
    margin-left: var(--space-sm);
    font-size: var(--fs-2xs);
    color: var(--dim);
  }

  /* Une colonne de cartes. Le gouttière de Quasar poserait des marges négatives
   qui feraient dépasser la première carte du cadre. */
  .qf-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin: 0;
  }
  .qf-group :deep(> div) {
    margin: 0;
    min-width: 0;
  }

  /* L'option elle-même : une carte pleine largeur, qui prend la couleur de la
   marque quand elle est retenue — l'aspect exact d'une réponse au rejeu. */
  .qf-group :deep(.q-radio),
  .qf-group :deep(.q-checkbox) {
    display: flex;
    align-items: flex-start;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 0;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    transition:
      border-color var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }
  .qf-group :deep(.q-radio:hover),
  .qf-group :deep(.q-checkbox:hover) {
    border-color: var(--line-3);
    background: var(--surface-2);
  }
  .qf-group :deep(.q-radio[aria-checked='true']),
  .qf-group :deep(.q-checkbox[aria-checked='true']) {
    border-color: var(--brand-line);
    background: var(--brand-soft);
  }
  /* Quasar retire le contour au clic ; il faut le rendre au clavier, où il est la
   seule chose qui dise où l'on est. */
  .qf-group :deep(.q-radio:focus-visible),
  .qf-group :deep(.q-checkbox:focus-visible) {
    outline: 2px solid var(--brand-line);
    outline-offset: 2px;
  }

  /* Le contrôle dessiné par Quasar disparaît : la carte le remplace. Masqué et
   non retiré — l'état accessible et le clavier vivent sur la racine, pas ici. */
  .qf-group :deep(.q-radio__inner),
  .qf-group :deep(.q-checkbox__inner) {
    display: none;
  }
  .qf-group :deep(.q-radio__label),
  .qf-group :deep(.q-checkbox__label) {
    min-width: 0;
    padding: 0;
  }

  .qf-opt {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .qf-opt-top {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    min-width: 0;
  }

  .qf-opt-mark {
    color: var(--faint);
    flex-shrink: 0;
    align-self: center;
  }
  .qf-group :deep(.q-radio[aria-checked='true']) .qf-opt-mark,
  .qf-group :deep(.q-checkbox[aria-checked='true']) .qf-opt-mark {
    color: var(--brand);
  }

  .qf-opt-label {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--text);
  }

  .qf-opt-desc {
    font-size: var(--fs-xs);
    color: var(--muted);
    line-height: 1.5;
    margin-top: 2px;
  }

  /* Une maquette se lit telle qu'elle a été écrite : les blancs sont porteurs, et
   elle défile chez elle plutôt que d'élargir le formulaire. */
  .qf-opt-preview {
    margin: var(--space-sm) 0 0;
    padding: var(--space-sm) var(--space-md);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    font-size: var(--fs-xs);
    line-height: 1.45;
    color: var(--muted);
    white-space: pre;
    overflow-x: auto;
  }
  .qf-group :deep(.q-radio[aria-checked='true']) .qf-opt-preview,
  .qf-group :deep(.q-checkbox[aria-checked='true']) .qf-opt-preview {
    color: var(--text);
  }
</style>
