<template>
  <p class="empty-state" :class="[`empty-state--${pad}`, { 'empty-state--center': center }]">
    <slot>{{ message }}</slot>
  </p>
</template>

<script setup lang="ts">
// Le « rien à montrer » de l'application, en un seul endroit.
//
// Pourquoi : dix-neuf classes locales (`hud-sessions-empty`, `sp-list-empty`,
// `mc-empty`…) disaient toutes la même chose à un cran d'espacement près, et
// dérivaient chacune de leur côté. Ce n'est pas qu'une dédup de CSS : c'est la
// surface où AURA parle le plus souvent, et elle n'existait nulle part en un
// morceau — donc personne ne la relisait.
//
// Volontairement pauvre en options. Le motif canonique de
// `frontend-rules/async-states.md` (icône + titre + corps + action) est plus
// riche que ce que ce projet emploie : ici un état vide tient en une phrase, et
// c'est un parti pris de l'app, pas un oubli. Un état vide qui mérite un bouton
// se compose par le slot.

withDefaults(
  defineProps<{
    /** La phrase. Ignorée si le slot par défaut est fourni. */
    message?: string;
    /** Centre le texte — pour un panneau, pas pour une ligne dans une liste. */
    center?: boolean;
    /** Respiration verticale. `none` quand le conteneur la porte déjà. */
    pad?: 'none' | 'sm' | 'md' | 'lg';
  }>(),
  { message: '', center: false, pad: 'md' },
);
</script>

<style scoped lang="scss">
.empty-state {
  margin: 0;
  color: var(--dim);
  font-size: var(--fs-sm);
}
.empty-state--none {
  padding: 0;
}
.empty-state--sm {
  padding: var(--space-sm) 0;
}
.empty-state--md {
  padding: var(--space-md) 0;
}
.empty-state--lg {
  padding: var(--space-lg) 0;
}
.empty-state--center {
  text-align: center;
}
</style>
