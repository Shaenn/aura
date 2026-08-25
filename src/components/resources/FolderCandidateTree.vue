<template>
  <ul class="fct">
    <li v-for="n in nodes" :key="n.rel">
      <div class="fct-row" :class="{ 'fct-row--on': state(n).on }">
        <button
          v-if="n.children.length"
          type="button"
          class="fct-twist"
          :aria-expanded="isOpen(n.rel)"
          :aria-label="isOpen(n.rel) ? t('common.collapse', { label: n.name }) : t('common.expand', { label: n.name })"
          @click="toggleOpen(n.rel)"
        >
          <q-icon :name="isOpen(n.rel) ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
        </button>
        <span v-else class="fct-twist-spacer" aria-hidden="true" />

        <q-icon name="folder" size="14px" class="fct-icon" aria-hidden="true" />
        <span class="fct-name font-mono">{{ n.name }}</span>
        <span class="fct-count font-mono">{{ t('resources.include.docs', n.docs) }}</span>

        <!-- Un sous-dossier d'un dossier retenu est emporté par lui : sa case est
             cochée mais figée, sinon on l'inclurait deux fois. -->
        <q-checkbox
          :model-value="state(n).on"
          :disable="Boolean(state(n).covered)"
          dense
          size="xs"
          :aria-label="
            state(n).covered ? t('resources.include.coveredAria', { folder: state(n).covered }) : t('resources.include.toggleAria', { folder: n.rel })
          "
          @update:model-value="(v: boolean) => emit('toggle', n.rel, v)"
        />
      </div>

      <FolderCandidateTree
        v-if="n.children.length && isOpen(n.rel)"
        :nodes="n.children"
        :selected="selected"
        @toggle="(rel, on) => emit('toggle', rel, on)"
      />
    </li>
  </ul>
</template>

<script setup lang="ts">
  /**
   * Une branche de l'arbre des dossiers à inclure — et, par récursion, l'arbre.
   *
   * Il ne connaît ni le projet ni le service : il reçoit des nœuds mesurés et
   * signale la bascule. C'est le dialogue hôte qui décide de ce qu'elle change.
   */
  import { reactive } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { CandidateNode } from './projectResources'

  const props = defineProps<{
    nodes: CandidateNode[]
    /** La sélection en cours, chemins complets. Rien n'est écrit tant qu'on n'applique pas. */
    selected: string[]
  }>()

  const emit = defineEmits<{ toggle: [rel: string, on: boolean] }>()

  const { t } = useI18n()

  // Un dossier de tête est déplié, ses descendants non : l'arbre s'ouvre sur ce
  // qu'on cherche neuf fois sur dix, sans dérouler le projet entier.
  const opened = reactive<Record<string, boolean>>({})
  const isOpen = (rel: string): boolean => Boolean(opened[rel])
  function toggleOpen(rel: string): void {
    opened[rel] = !opened[rel]
  }

  /**
   * L'état d'une case : cochée, et le cas échéant par quel ancêtre.
   *
   * Retenir `docs` emporte `docs/api` — le parcours du serveur est récursif. La
   * case du descendant doit donc le dire, et refuser d'être touchée : la décocher
   * ne retirerait rien, la cocher ajouterait un doublon.
   */
  function state(n: CandidateNode): { on: boolean; covered: string } {
    if (props.selected.includes(n.rel)) return { on: true, covered: '' }
    const parent = props.selected.find((f) => n.rel.startsWith(`${f}/`))
    return { on: Boolean(parent), covered: parent ?? '' }
  }
</script>

<style scoped lang="scss">
  // Le composant se rend lui-même : ses branches partagent donc le même scope CSS,
  // et l'imbrication se décrit d'une règle descendante plutôt que d'un compteur de
  // profondeur passé en prop.
  .fct {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .fct .fct {
    padding-left: var(--space-md);
  }
  .fct-row {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    align-items: center;
    gap: var(--space-xs);
    padding: 2px var(--space-xs);
    border-radius: var(--radius-xs);
    border-left: 2px solid transparent;
  }
  .fct-row:hover {
    background: var(--surface-2);
  }
  .fct-row--on {
    border-left-color: var(--brand-line);
  }
  .fct-twist,
  .fct-twist-spacer {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .fct-twist {
    background: none;
    border: none;
    padding: 0;
    color: var(--muted);
    cursor: pointer;
  }
  .fct-icon {
    color: var(--dim);
  }
  .fct-name {
    font-size: var(--fs-sm);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fct-count {
    font-size: var(--fs-2xs);
    color: var(--faint);
    white-space: nowrap;
  }
</style>
