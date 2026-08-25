<template>
  <!--
    Trois points qui s'allument l'un après l'autre : le signe qu'un travail est
    en cours, partout où AURA en montre un.

    Décoratif au sens strict — l'information est portée par le texte qui suit et
    par la présence même de la ligne. Rien à annoncer à une synthèse vocale.
  -->
  <span class="pd" aria-hidden="true">
    <span class="pd-dot" />
    <span class="pd-dot" />
    <span class="pd-dot" />
  </span>
</template>

<style scoped lang="scss">
  .pd {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: none;
  }

  /*
  `opacity` et `transform` seulement : les deux propriétés que le compositeur
  anime sans recalculer la mise en page, dans des écrans qui redessinent déjà
  une timeline à chaque token.
*/
  .pd-dot {
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: var(--pulse);
    opacity: 0.25;
    animation: pd-blink 1.4s ease-in-out infinite;
  }
  .pd-dot:nth-child(2) {
    animation-delay: 0.2s;
  }
  .pd-dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes pd-blink {
    0%,
    60%,
    100% {
      opacity: 0.25;
      transform: scale(0.85);
    }
    30% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /*
  Sans mouvement, les points restent visibles et fixes : le signal passe alors
  par la présence de la ligne, qui suffit — elle n'existe que pendant le travail.
*/
  @media (prefers-reduced-motion: reduce) {
    .pd-dot {
      animation: none;
      opacity: 0.7;
    }
  }
</style>
