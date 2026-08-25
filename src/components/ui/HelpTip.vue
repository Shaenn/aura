<template>
  <span class="tip" tabindex="0" @focus="open = true" @blur="open = false" @keydown.esc="open = false">
    <slot />
    <q-icon name="help_outline" size="14px" aria-hidden="true" />
    <q-tooltip v-model="open" anchor="top start" self="bottom start" max-width="360px" class="tip-body">
      <span class="tip-what">{{ what }}</span>
      <span v-if="reading" class="tip-read">{{ reading }}</span>
    </q-tooltip>
  </span>
</template>

<script setup lang="ts">
  // Un libellé qui explique ce qu'il désigne.
  //
  // `q-tooltip` ne s'ouvre qu'au survol — Quasar ne pose que `mouseenter` /
  // `mouseleave` sur son ancre. L'ancre est donc focusable et pilote le tooltip
  // par `v-model`, ce qui laisse Quasar gérer la souris (il écrit dans le même
  // modèle) tout en rendant l'explication atteignable au clavier.
  //
  // Les styles scoped d'un composant sont enregistrés globalement par Vue : ils
  // atteignent donc le contenu du tooltip, que Quasar téléporte dans `<body>` —
  // ce qu'un scoped de la page appelante ne ferait pas. Même raison que
  // `LabelValueRow`.
  import { ref } from 'vue'

  defineProps<{
    /** Ce que la chose désigne — le fond de l'explication. */
    what: string
    /**
     * Comment lire le chiffre affiché, quand cela demande une seconde phrase.
     * Séparé de `what` par un filet, pour qu'on puisse s'arrêter au premier bloc.
     */
    reading?: string | undefined
  }>()

  const open = ref(false)
</script>

<style scoped lang="scss">
  // Le pointillé annonce qu'il y a quelque chose à survoler sans emprunter le
  // soulignement plein, qui promet un lien.
  .tip {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-xs);
    cursor: help;
    border-bottom: 1px dotted var(--line);

    > .q-icon {
      color: var(--faint);
      align-self: center;
    }
    &:hover > .q-icon,
    &:focus-visible > .q-icon {
      color: var(--brand);
    }
  }
  // La taille se pose sur les deux blocs et non sur `.tip-body` : cette classe-là
  // part en prop vers `QTooltip`, dont la racine est un `Teleport` — l'attribut de
  // scope ne la suit pas, et le `font-size: 10px` de Quasar l'emporterait. Ces
  // deux spans, eux, naissent dans ce template et portent bien le scope.
  .tip-what,
  .tip-read {
    display: block;
    font-size: var(--fs-xs);
    line-height: 1.55;
  }
  .tip-read {
    margin-top: var(--space-xs);
    padding-top: var(--space-xs);
    border-top: 1px solid var(--glow-line);
    opacity: 0.82;
  }
</style>
