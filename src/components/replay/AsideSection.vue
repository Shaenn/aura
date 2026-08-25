<template>
  <section class="as surface-card" :class="{ 'as--open': open }">
    <!--
      Le titre est le bouton. Un `<details>` aurait suffi pour un repli isolé,
      mais l'exclusivité entre les trois cartes se décide au-dessus — et surtout
      « Tout déplier » pilote tous les `<details>` de la page : les trois cartes
      se seraient rouvertes ensemble, ce que ce repli existe précisément pour
      empêcher.
    -->
    <h2 class="as-head">
      <button type="button" class="as-btn" :aria-expanded="open" :aria-controls="bodyId" @click="emit('toggle')">
        <q-icon :name="open ? 'expand_less' : 'expand_more'" size="18px" aria-hidden="true" />
        <span :id="titleId" class="as-title">{{ title }}</span>
        <q-space />
        <!-- Le chiffre-clé reste lisible repliée : c'est ce qui rend le repli
             acceptable — on ne perd que le détail, jamais la mesure. -->
        <span class="as-summary font-mono"><slot name="summary" /></span>
      </button>
    </h2>

    <!--
      Masqué, jamais démonté : le diagnostic va chercher son montant au serveur
      et le contexte calcule son remplissage. Démonter les cartes fermées
      viderait les résumés ci-dessus de leur chiffre jusqu'au premier clic.
    -->
    <div v-show="open" :id="bodyId" class="as-body" role="region" :aria-labelledby="titleId" :class="{ 'as-body--pad': pad }">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useId } from 'vue'

  defineProps<{
    title: string
    open: boolean
    /** Le contenu ne porte pas son propre rembourrage (cas de `SessionCostPanel`). */
    pad?: boolean
  }>()
  const emit = defineEmits<{ toggle: [] }>()

  const bodyId = useId()
  const titleId = useId()
</script>

<style scoped lang="scss">
  .as {
    // Repliée, la carte ne prend que la hauteur de son titre.
    flex: 0 0 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    // Un enfant flex refuse de rétrécir sous son contenu sans cette permission —
    // et c'est le corps qui doit défiler, pas la carte qui doit grandir.
    min-height: 0;
  }
  // Ouverte, elle prend toute la place que les autres ne prennent pas.
  .as--open {
    flex: 1 1 auto;
  }

  .as-head {
    margin: 0;
    flex: 0 0 auto;
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  .as-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast);
  }
  .as-btn:hover {
    background: var(--hover-overlay);
  }
  .as-btn:focus-visible {
    outline: 1px solid var(--brand);
    outline-offset: -1px;
  }
  .as-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .as-summary {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--fs-xs);
    font-weight: 400;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }

  .as-body {
    overflow-y: auto;
    min-height: 0;
  }
  .as-body--pad {
    padding: var(--space-md);
  }

  // Sur une colonne, la carte ouverte se déroule à sa hauteur : rien ne la borne
  // plus, et un défilement dans le défilement de la page serait un piège.
  @media (max-width: 1279px) {
    .as-body {
      overflow: visible;
    }
  }
</style>
