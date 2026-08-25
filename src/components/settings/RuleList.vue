<template>
  <div class="rules">
    <div class="rules-head">
      <span class="section-label">{{ label }}</span>
      <span class="rules-count font-mono">{{ rules.length }}</span>
    </div>

    <ul v-if="rules.length" class="rules-list">
      <li v-for="(r, i) in rules" :key="`${r}-${i}`" class="rule">
        <code class="rule-text font-mono">{{ r }}</code>
        <q-btn flat dense round size="sm" icon="close" :color="tone" :aria-label="t('rules.removeAria', { rule: r })" @click="emit('remove', i)" />
      </li>
    </ul>
    <p v-else class="rules-empty">{{ t('rules.empty') }}</p>

    <form class="rules-add" @submit.prevent="submit">
      <input
        v-model="draft"
        class="rules-input font-mono"
        :placeholder="placeholder ?? t('rules.placeholder')"
        spellcheck="false"
        :aria-label="t('rules.addAria', { label })"
      />
      <q-btn type="submit" flat dense no-caps color="primary" icon="add" :label="t('rules.add')" :disable="!draft.trim()" />
    </form>
  </div>
</template>

<script setup lang="ts">
  // Editor for a permissions rule array (allow / deny / ask). Presentational:
  // emits add/remove; the parent mutates the JSON document.
  import { ref } from 'vue'
  import { useI18n } from 'vue-i18n'

  const props = withDefaults(
    defineProps<{
      label: string
      rules: string[]
      /** Sans valeur, l'exemple générique du catalogue — traduit à l'usage, pas à l'import. */
      placeholder?: string
      /** Button colour tone: 'negative' for deny, else brand. */
      tone?: string
    }>(),
    // `placeholder` n'a délibérément pas de défaut ici : un texte posé dans
    // `withDefaults` est évalué à l'import, donc figé dans la langue du démarrage.
    { tone: 'primary' },
  )

  const { t } = useI18n()

  const emit = defineEmits<{ add: [string]; remove: [number] }>()

  const draft = ref('')
  function submit(): void {
    const v = draft.value.trim()
    if (!v || props.rules.includes(v)) {
      draft.value = ''
      return
    }
    emit('add', v)
    draft.value = ''
  }
</script>

<style scoped lang="scss">
  .rules {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .rules-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .rules-count {
    font-size: var(--fs-xs);
    color: var(--dim);
  }
  .rules-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .rule {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .rule-text {
    font-size: var(--fs-sm);
    color: var(--text);
    word-break: break-all;
  }
  .rules-empty {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--dim);
  }
  .rules-add {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }
  .rules-input {
    flex: 1;
    min-width: 0;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    font-size: var(--fs-sm);
    outline: none;
    transition: border-color var(--motion-fast);
  }
  .rules-input:focus {
    border-color: var(--brand-line);
  }
</style>
