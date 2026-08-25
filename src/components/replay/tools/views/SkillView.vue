<template>
  <div class="tv">
    <!-- Le résumé de la carte coupe à 80 caractères, et 7 des 12 consignes du
         parc sont plus longues — la plus longue fait 360 caractères et décrit
         toute une fonctionnalité à construire. Elle se relit ici en entier. -->
    <p v-if="args" class="skv-args">{{ args }}</p>

    <section v-if="allowed.length" class="skv-block">
      <h4 class="section-label">{{ t('replay.tools.views.skill.allowed') }}</h4>
      <ul class="skv-tools">
        <li v-for="name in allowed" :key="name" class="skv-tool font-mono">{{ name }}</li>
      </ul>
    </section>

    <!-- Le texte du résultat est toujours `Launching skill: <nom>` — 17 fois
         sur 17, à la lettre. Il redit le nom que porte déjà l'en-tête de la
         carte, et rien d'autre : ce qui se passe ensuite, c'est le manuel du
         skill versé dans la fenêtre, et il se lit là où il tombe. -->
    <OutputPane
      v-if="showOutput"
      :content="block.result?.content ?? ''"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
  import type { Block } from '@/services/projects'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import OutputPane from '../OutputPane.vue'
  import { asRecord, str } from '../values'

  const { t } = useI18n()

  const props = defineProps<{ block: Block }>()

  const input = computed(() => asRecord(props.block.input))
  const args = computed(() => str(input.value.args).trim())

  /** La restriction que le skill impose à la session — le sidecar seul la porte. */
  const allowed = computed(() => {
    const a = props.block.result?.meta?.allowedTools
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && Boolean(x)) : []
  })

  /**
   * Le lancement réussi ne se dit pas : la carte est là, c'est qu'il a eu lieu.
   *
   * Reste ce qui n'est pas ce cas-là — deux appels du parc, où le modèle a écrit
   * `name` au lieu de `skill` et où le harness a répondu une erreur de schéma.
   * Le nom demandé n'est alors nulle part ailleurs que dans le pavé.
   */
  const LAUNCH = /^Launching skill: /

  const showOutput = computed(() => {
    const t = props.block.result?.content ?? ''
    if (props.block.result?.isError) return true
    return Boolean(t.trim()) && !LAUNCH.test(t.trim())
  })
</script>

<style scoped lang="scss">
  .tv {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .skv-args {
    margin: 0;
    font-size: var(--fs-sm);
    line-height: 1.5;
    color: var(--text);
    white-space: pre-wrap;
  }
  .skv-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .skv-block > h4 {
    margin: 0;
  }
  .skv-tools {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .skv-tool {
    color: var(--brand);
    font-size: var(--fs-2xs);
    border: 1px solid var(--brand-line);
    border-radius: 999px;
    padding: 1px 8px;
  }
</style>
