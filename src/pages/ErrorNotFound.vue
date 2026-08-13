<template>
  <!-- `main` et non `q-page` : cette route est la seule hors du MainLayout, et un
       QPage sans QLayout au-dessus de lui ne rend rien du tout. Invisible tant que
       le routeur était en mode hash — il fallait fauter dans le `#` pour y arriver ;
       en mode history, toute adresse erronée du domaine y mène. -->
  <main class="nf">
    <div class="backdrop-grid" aria-hidden="true"></div>

    <h1 class="sr-only">{{ t('pages.notFound.title') }}</h1>

    <section class="nf-panel surface-card surface-card--braced">
      <p class="nf-kicker font-mono">{{ t('pages.notFound.kicker') }}</p>

      <div class="nf-code">
        <span class="nf-code-text" aria-hidden="true">404</span>
        <span class="nf-scan" aria-hidden="true"></span>
      </div>

      <p class="nf-msg">{{ t('pages.notFound.message') }}</p>
      <p class="nf-detail">{{ t('pages.notFound.detail') }}</p>

      <div class="nf-actions">
        <q-btn
          unelevated
          no-caps
          color="primary"
          text-color="dark"
          :to="{ name: 'home' }"
          :label="t('pages.notFound.home')"
        />
        <q-btn flat no-caps :to="{ name: 'help' }" :label="t('pages.notFound.help')" />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<style scoped lang="scss">
.nf {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  // Pleine hauteur : hors layout, il n'y a pas de barre d'état à défalquer.
  min-height: 100vh;
  padding: var(--space-xl);
  overflow: hidden;
  // Pas de fond ici : la trame court sous le contenu, donc un fond opaque sur
  // le conteneur la masquerait. Celui du `body` suffit.
}

/* ── Panneau ──────────────────────────────────────────────────────────────── */
/* La surface, l'arrondi, la lueur et les renforts d'angle viennent des
   primitives `.surface-card` et `.surface-card--braced` ; il ne reste ici que
   la mise en page propre à cet écran. */
.nf-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  max-width: 560px;
  padding: var(--space-xl);
  text-align: center;
}

/* ── Le code ──────────────────────────────────────────────────────────────── */
.nf-kicker {
  font-size: var(--fs-xs);
  letter-spacing: 0.18em;
  color: var(--glow-text);
}

.nf-code {
  position: relative;
  overflow: hidden;
  line-height: 1;
}
.nf-code-text {
  display: block;
  font-size: clamp(96px, 18vw, 148px); // display size — hors de l'échelle, à dessein
  font-weight: 700;
  letter-spacing: -0.04em;
  // Le chiffre est creux : un contour de marque sur un remplissage à peine
  // teinté. Un aplat plein en ferait le sujet de l'écran, alors que le sujet
  // est la phrase en dessous — et un dégradé vers la lueur, peu saturée,
  // traverse un gris franc qui délave le tout.
  color: var(--brand-soft);
  -webkit-text-stroke: 2px var(--brand);
}
/* Un balayage lent, pas un scintillement : il passe une fois toutes les six
   secondes et se voit à peine. C'est le seul mouvement de l'écran. */
.nf-scan {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 30%;
  background: linear-gradient(180deg, transparent, var(--glow-soft), transparent);
  animation: nf-sweep 6s ease-in-out infinite;
}
@keyframes nf-sweep {
  0%,
  70% {
    transform: translateY(-100%);
  }
  100% {
    transform: translateY(400%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .nf-scan {
    animation: none;
    opacity: 0;
  }
}

/* ── Texte ────────────────────────────────────────────────────────────────── */
.nf-msg {
  margin: var(--space-sm) 0 0;
  font-size: var(--fs-lg);
  color: var(--text);
}
.nf-detail {
  max-width: 44ch;
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.5;
  color: var(--muted);
}

.nf-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  justify-content: center;
  margin-top: var(--space-md);
}
</style>
