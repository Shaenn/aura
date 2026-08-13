<template>
  <ul class="ct" :class="{ 'ct--root': depth === 0 }">
    <li v-for="node in nodes" :key="node.key" class="ct-node">
      <!-- Un dossier : se déplie, et porte la somme de ce qu'il contient. -->
      <details v-if="node.children.length" class="ct-dir" open>
        <summary class="ct-dir-head">
          <q-icon name="folder" size="13px" class="ct-dir-icon" aria-hidden="true" />
          <span class="ct-dir-name">{{ node.name }}</span>
          <span class="ct-dir-count">{{ leafCount(node) }}</span>
          <span class="ct-tokens font-mono">~{{ fmtNum(node.tokens) }}</span>
        </summary>
        <ContextTree
          :nodes="node.children"
          :depth="depth + 1"
          @navigate="emit('navigate', $event)"
        />
      </details>

      <!-- Une feuille : le fichier lui-même, avec son coût et son lien de tour. -->
      <div v-else-if="node.row" class="ct-file">
        <q-icon name="description" size="13px" class="ct-file-icon" aria-hidden="true" />
        <ContextRowBody
          :row="{ ...node.row, label: node.name }"
          @navigate="emit('navigate', $event)"
        />
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { fmtNum } from 'src/utils/format';
import ContextRowBody from './ContextRowBody.vue';
import type { TreeNode } from './contextTree';
import type { ContextRowModel } from './contextRows';

type Node = TreeNode<ContextRowModel>;

withDefaults(defineProps<{ nodes: Node[]; depth?: number }>(), { depth: 0 });

const emit = defineEmits<{ navigate: [uuid: string] }>();

/** Combien de fichiers sous un dossier — un décompte, pas une profondeur. */
function leafCount(node: Node): number {
  if (!node.children.length) return 1;
  return node.children.reduce((n, c) => n + leafCount(c), 0);
}
</script>

<style scoped lang="scss">
.ct {
  list-style: none;
  margin: 0;
  padding: 0;
}
/* Chaque niveau s'indente sous le précédent, avec un filet de rappel. */
.ct:not(.ct--root) {
  padding-left: var(--space-sm);
  margin-left: var(--space-xs);
  border-left: 1px solid var(--line);
}

.ct-node {
  min-width: 0;
}

.ct-dir > summary {
  list-style: none;
  cursor: pointer;
}
.ct-dir > summary::-webkit-details-marker {
  display: none;
}

.ct-dir-head {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px var(--space-xs);
  border-radius: var(--radius-xs);

  &:hover {
    background: var(--surface-2);
  }
  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
}
.ct-dir-icon {
  color: var(--faint);
  flex: none;
}
.ct-dir-name {
  color: var(--text);
  font-weight: 500;
}
.ct-dir-count {
  min-width: 16px;
  text-align: center;
  border-radius: var(--radius-xs);
  background: var(--surface-3);
  color: var(--muted);
  font-size: var(--fs-2xs);
  padding: 0 4px;
}

.ct-file {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 1px var(--space-xs);
}
.ct-file-icon {
  color: var(--faint);
  flex: none;
}

.ct-tokens {
  flex: none;
  margin-left: auto;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
