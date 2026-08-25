<template>
  <!-- L'ancre du panneau de suivi. Elle ne peut pas être celle du jalon de tour :
       le harness écrit une ligne par bloc, donc une réponse qui parle avant
       d'appeler l'outil laisse cet appel sans jalon — et c'est justement là que
       le panneau voulait renvoyer. -->
  <div :id="`rp-task-${uuid}`" class="tm" :class="`tm--${tone}`">
    <p class="tm-head">
      <q-icon :name="icon" size="16px" class="tm-icon" aria-hidden="true" />
      <span class="tm-name font-mono">{{ block.name }}</span>
      <span v-if="id" class="tm-args font-mono">#{{ id }}</span>
      <span class="tm-subject">{{ label }}</span>
      <q-space />

      <!-- Le statut à droite, là où une carte d'outil pose `succès` : c'est la
           place que l'œil connaît déjà. La valeur reste celle du harnais. -->
      <span v-if="status" class="tm-status font-mono">{{ status }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
  import type { Block } from '@/services/projects'
  import { computed, inject } from 'vue'
  import { readTaskCall, TASK_INDEX } from './taskList'

  const props = defineProps<{
    block: Block
    /** `uuid` de l'événement qui porte l'appel — l'ancre que vise le panneau. */
    uuid: string
  }>()

  const index = inject(TASK_INDEX, null)

  const call = computed(() => readTaskCall(props.block))
  const id = computed(() => call.value.id)
  const status = computed(() => call.value.status)

  /**
   * Le sujet, jamais le numéro seul.
   *
   * À la création il est dans l'appel ; à la mise à jour il faut l'index — sans
   * lui, « #3 » n'apprend rien à qui lit le flux.
   */
  const label = computed(() => {
    if (call.value.subject) return call.value.subject
    return (id.value ? index?.value.get(id.value) : '') ?? ''
  })

  const icon = computed(() => {
    if (call.value.create) return 'add_task'
    if (status.value === 'completed') return 'check_circle'
    if (status.value === 'in_progress') return 'play_circle'
    // Une suppression retire la tâche du plan ; le cercle vide disait « pas encore
    // commencée », c'est-à-dire le contraire — la tâche ne commencera pas.
    if (status.value === 'deleted') return 'remove_circle_outline'
    return 'radio_button_unchecked'
  })

  /** Un début et une fin se voient ; le reste s'en tient au gris commun. */
  const tone = computed(() => {
    if (status.value === 'completed') return 'done'
    if (status.value === 'in_progress') return 'live'
    return 'plain'
  })
</script>

<style scoped lang="scss">
  /*
  Un bloc de plein droit, à la taille des cartes d'outil qui l'entourent.

  Il n'ouvre sur rien — l'appel tient en deux champs et son résultat est un
  accusé de réception — donc ni chevron, ni badge de tokens, ni pastille
  « succès » : ce chrome promettait un repli qui n'avait rien à montrer. Reste
  la ligne d'en-tête, aux mêmes mesures que celle d'un `Read` ou d'un `Bash`,
  pour que le début et la fin d'une tâche pèsent dans le flux ce que pèse le
  travail qu'ils encadrent.
*/
  .tm {
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    overflow: hidden;
    // Le renvoi du panneau vise ce bloc : sans marge, il arriverait collé au bord
    // haut de la zone défilante.
    scroll-margin-block: var(--space-xl);
  }
  .tm-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin: 0;
    padding: var(--space-sm) var(--space-md);
  }
  .tm-icon {
    flex-shrink: 0;
    color: var(--dim);
  }
  .tm-name {
    flex-shrink: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  .tm-args {
    flex-shrink: 0;
    font-size: var(--fs-xs);
    color: var(--dim);
  }
  /*
  Le statut, dans les termes du harnais mais tenu comme une étiquette.

  `in_progress` posé à la suite du sujet se lisait comme un mot de la phrase,
  alors que c'est une valeur. Encadré, à droite, il redevient ce qu'il est — et
  reprend la place où les cartes d'outil annoncent `succès`, si bien qu'une
  colonne de blocs aligne tous ses états sur la même verticale.
*/
  .tm-status {
    flex-shrink: 0;
    font-size: var(--fs-2xs);
    color: var(--faint);
    padding: 1px 6px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    background: var(--surface-3);
  }
  /* Le sujet est la seule prose de la ligne : c'est lui qui cède en premier. */
  .tm-subject {
    min-width: 0;
    font-size: var(--fs-xs);
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Le démarrage porte la teinte de marque, la fin celle du succès. La couleur ne
   dit jamais rien seule : le jeton l'écrit, et l'icône la redouble. */
  .tm--live {
    border-color: color-mix(in srgb, var(--brand) 30%, var(--line-2));
  }
  .tm--live .tm-icon,
  .tm--live .tm-status {
    color: var(--brand);
  }
  .tm--live .tm-status {
    border-color: var(--brand-line);
    background: var(--brand-soft);
  }
  .tm--live .tm-name,
  .tm--done .tm-name {
    color: var(--text);
  }
  .tm--done .tm-icon,
  .tm--done .tm-status {
    color: var(--pulse);
  }
  .tm--done .tm-status {
    border-color: color-mix(in srgb, var(--pulse) 30%, var(--line-2));
    background: color-mix(in srgb, var(--pulse) 12%, transparent);
  }
</style>
