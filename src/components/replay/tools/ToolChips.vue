<template>
  <ul v-if="items.length" class="tch">
    <li v-for="c in items" :key="c.k" class="tch-item">
      <span class="tch-k">{{ c.k }}</span>
      <!-- La valeur est coupée par CSS quand elle déborde : 15,8 % des motifs de
           recherche dépassent 60 caractères, jusqu'à 411. Sans titre, elles sont
           illisibles ; avec, elles restent atteignables. -->
      <span class="tch-v font-mono" :title="c.v">{{ c.v }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
defineProps<{ items: { k: string; v: string }[] }>();
</script>

<style scoped lang="scss">
.tch {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}
.tch-item {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-xs);
  padding: 2px var(--space-sm);
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-radius: 999px;
  max-width: 100%;
}
.tch-k {
  font-size: var(--fs-2xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
  flex-shrink: 0;
}
.tch-v {
  font-size: var(--fs-xs);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
