<template>
  <ul class="rt-list">
    <li v-for="n in nodes" :key="n.key">
      <!-- Dossier : nœud repliable (comme les sous-dossiers d'un skill) -->
      <template v-if="n.type === 'dir'">
        <button
          type="button"
          class="rt-dir"
          :aria-expanded="isExpanded(n.path)"
          :aria-label="isExpanded(n.path) ? t('common.collapse', { label: n.name }) : t('common.expand', { label: n.name })"
          @click="toggle(n.path)"
        >
          <q-icon :name="isExpanded(n.path) ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
          <q-icon name="folder_open" size="13px" aria-hidden="true" />
          <span class="rt-dir-name font-mono">{{ n.name }}</span>
          <span class="rt-count font-mono">{{ n.fileCount }}</span>
        </button>
        <RuleTree
          v-if="isExpanded(n.path)"
          class="rt-children"
          :nodes="n.children"
          :active-rel="activeRel"
          :file-icon="fileIcon"
          :file-meta="fileMeta"
          @open="$emit('open', $event)"
        />
      </template>

      <!-- Fichier de règle : feuille cliquable -->
      <button
        v-else
        type="button"
        class="rt-file"
        :class="{ 'rt-file--active': activeRel === n.node.rel }"
        :aria-current="activeRel === n.node.rel ? 'true' : undefined"
        @click="$emit('open', n.node)"
      >
        <q-icon :name="fileIcon" size="13px" aria-hidden="true" />
        <span class="rt-file-name font-mono">{{ n.label }}</span>
        <span class="rt-file-size font-mono">{{ fileMeta(n.node) }}</span>
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
  import type { RuleNode } from '@/components/resources/projectResources'
  import type { ResourceNode } from '@/services/projects'
  import { fmtBytes } from '@/utils/format'
  import { reactive } from 'vue'
  import { useI18n } from 'vue-i18n'

  // Les nœuds sont déclarés avec `buildTree`, qui les produit : un module de
  // logique n'a pas à importer un composant pour nommer son résultat. On les
  // ré-exporte ici pour que les appelants historiques ne changent pas d'import.
  export type { RuleFileNode, RuleDirNode, RuleNode } from '@/components/resources/projectResources'

  // `fileMeta` : le chiffre en bout de ligne. C'est une taille partout, sauf sur
  // les Sauvegardes où un fichier vaut par son nombre de versions.
  withDefaults(
    defineProps<{
      nodes: RuleNode[]
      activeRel: string
      fileIcon?: string
      fileMeta?: (node: ResourceNode) => string
    }>(),
    {
      fileIcon: 'rule',
      fileMeta: (node: ResourceNode) => fmtBytes(node.size),
    },
  )
  defineEmits<{ open: [node: ResourceNode] }>()

  const { t } = useI18n()

  // Dossiers dépliés par défaut ; chaque instance gère l'état de ses enfants directs.
  const collapsed = reactive<Record<string, boolean>>({})
  function isExpanded(path: string): boolean {
    return !collapsed[path]
  }
  function toggle(path: string): void {
    collapsed[path] = !collapsed[path]
  }
</script>

<style scoped lang="scss">
  .rt-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  // Les enfants sont décalés sous leur dossier, avec un trait d'appartenance.
  .rt-children {
    margin-left: calc(var(--space-sm) + 6px);
    padding-left: var(--space-sm);
    border-left: 1px solid var(--line-2);
  }
  .rt-dir {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--fs-xs);
    color: var(--muted);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast);
  }
  .rt-dir:hover {
    background: var(--hover-overlay);
  }
  .rt-dir:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .rt-dir .q-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .rt-dir-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rt-count {
    flex: 0 0 auto;
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
  .rt-file {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    padding: var(--space-sm);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    border-radius: var(--radius-sm);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--motion-fast),
      border-color var(--motion-fast);
  }
  .rt-file:hover {
    background: var(--hover-overlay);
  }
  .rt-file:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .rt-file--active {
    background: var(--brand-soft);
    border-left-color: var(--brand);
  }
  .rt-file .q-icon {
    color: var(--brand);
    flex: 0 0 auto;
    align-self: center;
  }
  .rt-file-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--fs-sm);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rt-file-size {
    flex: 0 0 auto;
    font-size: var(--fs-2xs);
    color: var(--faint);
    white-space: nowrap;
  }
</style>
