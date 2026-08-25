<template>
  <section class="tp" :aria-label="t('replay.tasks.planAria')">
    <p class="tp-head">
      <!-- Le nom de l'outil, comme sur toute autre carte : la série est faite de
           `TaskCreate`, et l'annoncer autrement obligerait le lecteur à deviner
           quel appel a produit ce bloc. -->
      <q-icon name="checklist" size="16px" class="tp-head-icon" aria-hidden="true" />
      <span class="tp-head-name font-mono">TaskCreate</span>
      <span class="tp-head-count font-mono">×{{ items.length }}</span>
      <span class="tp-head-label">{{ t('replay.tasks.planLabel') }}</span>
    </p>

    <ol class="tp-list">
      <!--
        L'ancre de la tâche vit sur sa ligne, pas sur un jalon séparé.

        Chaque création était son propre tour, donc son propre jalon « Tour 73 » ;
        les absorber pour ne montrer qu'un objet aurait laissé sans cible les
        renvois vers ces tours. En la posant ici, le renvoi tombe exactement sur
        la tâche née à ce tour — et non plus sur la ligne grise qui la précédait.
      -->
      <li v-for="(it, i) in items" :id="`rp-task-${it.uuid}`" :key="it.uuid" class="tp-item">
        <span class="tp-num font-mono">{{ it.id || i + 1 }}</span>
        <span class="tp-subject">{{ it.subject }}</span>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
  // La série de `TaskCreate` qui pose le plan, rendue d'un bloc.
  //
  // Cinq créations d'affilée sont un seul geste — « voilà comment je vais m'y
  // prendre ». Une ligne par appel en faisait cinq actions de même poids, séparées
  // par cinq jalons de tour, et la régularité se lisait comme du bruit. Les états
  // ne sont pas montrés ici : à cet instant du flux, tout est à faire, et afficher
  // l'état final trahirait le moment. C'est la colonne de droite qui le porte.

  import { useI18n } from 'vue-i18n'
  import type { PlanItem } from './taskList'

  defineProps<{ items: PlanItem[] }>()

  const { t } = useI18n()
</script>

<style scoped lang="scss">
  /*
  Les mesures d'une carte d'outil : même bordure, même fond, même rembourrage,
  même taille de titre. Le plan est un acte du même ordre qu'un `Read` ou un
  `Bash` — plus structurant, même — et doit peser autant dans la colonne.

  L'en-tête et le corps sont séparés comme dans `ToolCall`, mais rien ne se
  replie : la liste *est* le contenu, et la cacher derrière un chevron
  reviendrait à masquer la seule chose que le bloc a à dire.
*/
  .tp {
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    overflow: hidden;
  }
  .tp-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin: 0;
    padding: var(--space-sm) var(--space-md);
  }
  .tp-head-icon {
    color: var(--brand);
    flex: none;
  }
  .tp-head-name {
    flex: none;
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  .tp-head-count {
    flex: none;
    font-size: var(--fs-xs);
    color: var(--dim);
  }
  .tp-head-label {
    min-width: 0;
    font-size: var(--fs-xs);
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tp-list {
    list-style: none;
    margin: 0;
    padding: var(--space-sm) var(--space-md);
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .tp-item {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    min-width: 0;
    // Le lien du panneau de contexte vise cette ligne : sans marge, elle arriverait
    // collée au bord haut de la zone défilante.
    scroll-margin-block: var(--space-xl);
  }
  .tp-num {
    flex: none;
    width: 1.25em;
    text-align: right;
    font-size: var(--fs-2xs);
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  .tp-subject {
    min-width: 0;
    font-size: var(--fs-sm);
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
