<template>
  <ol class="tl" :aria-label="label">
    <li v-for="t in tasks" :key="t.id" class="tl-item" :class="`tl-item--${cls(t.status)}`">
      <!--
        Le bouton porte la ligne entière : cliquer une tâche renvoie au tour où
        son travail a commencé. Viser son dernier mouvement tombait sur l'accusé
        de fin — la conclusion, jamais ce qui a été fait pour y arriver.
      -->
      <button type="button" class="tl-btn" @click="emit('navigate', t.startUuid)">
        <q-icon :name="icon(t.status)" size="14px" class="tl-icon" aria-hidden="true" />
        <span class="tl-label">{{ text(t) }}</span>
      </button>
    </li>
  </ol>
</template>

<script setup lang="ts">
  // Les lignes d'un plan. Un même rendu sert au plan en cours et à ceux qu'on
  // rouvre derrière leur repli : ce qui les distingue est leur place dans la
  // colonne, pas la façon dont une tâche s'écrit.

  import type { TaskStatus, TrackedTask } from './taskList'

  defineProps<{ tasks: TrackedTask[]; label: string }>()
  const emit = defineEmits<{ navigate: [uuid: string] }>()

  /** Un statut inconnu ne doit pas fabriquer une classe CSS au hasard. */
  function cls(status: TaskStatus): string {
    return status === 'in_progress' || status === 'completed' ? status : 'pending'
  }

  function icon(status: TaskStatus): string {
    if (status === 'completed') return 'check_circle'
    if (status === 'in_progress') return 'radio_button_checked'
    return 'radio_button_unchecked'
  }

  /**
   * En cours, le harness écrit une forme active — « Extraction du navigateur ».
   * C'est ce qui se passe maintenant : devant un direct, c'est la bonne phrase.
   */
  function text(t: TrackedTask): string {
    return t.status === 'in_progress' && t.activeForm ? t.activeForm : t.subject
  }
</script>

<style scoped lang="scss">
  .tl {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .tl-item {
    min-width: 0;
  }
  .tl-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-xs) var(--space-xs);
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: var(--fs-sm);
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast);
  }
  .tl-btn:hover {
    background: var(--hover-overlay);
  }
  .tl-btn:focus-visible {
    outline: 1px solid var(--brand);
    outline-offset: -1px;
  }
  .tl-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tl-icon {
    flex: none;
    color: var(--faint);
  }

  /* La tâche en cours est celle qu'on cherche : elle seule est à pleine encre. */
  .tl-item--in_progress .tl-btn {
    color: var(--text);
  }
  .tl-item--in_progress .tl-icon {
    color: var(--brand);
  }
  .tl-item--completed .tl-icon {
    color: var(--pulse);
  }
  .tl-item--completed .tl-label {
    color: var(--dim);
    text-decoration: line-through;
  }
</style>
