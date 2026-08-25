<template>
  <!-- Every figure here is recorded by the harness — none is an estimate. -->
  <section class="cm" :aria-labelledby="`cm-${compaction.uuid}`">
    <h3 :id="`cm-${compaction.uuid}`" class="cm-title font-mono">
      <q-icon name="compress" size="15px" />
      {{ t('replay.compaction.title') }}
      <span class="cm-trigger">{{ triggerLabel }}</span>
    </h3>

    <p class="cm-figures font-mono">
      <span class="cm-before">{{ fmtNum(compaction.preTokens) }}</span>
      <q-icon name="arrow_forward" size="14px" aria-hidden="true" />
      <span v-if="settled" class="cm-after">{{ fmtNum(compaction.postTokens) }}</span>
      <span v-else class="cm-pending" :title="t('replay.compaction.pending')">…</span>
      <span class="cm-unit">{{ t('replay.compaction.unit') }}</span>
    </p>

    <!-- `i18n-t` plutôt qu'un texte découpé : le montant porte le gras, et les
         deux incises sont facultatives — leur place dans la phrase n'est pas la
         même d'une langue à l'autre. -->
    <p v-if="settled" class="cm-loss">
      <i18n-t keypath="replay.compaction.removed" tag="span" scope="global">
        <template #amount>
          <strong>{{ t('replay.compaction.removedAmount', { n: fmtNum(lost) }) }}</strong>
        </template>
        <template #percent>{{ percentPart }}</template>
        <template #duration>{{ durationPart }}</template>
      </i18n-t>
      . {{ t('replay.compaction.note') }}
    </p>
    <p v-else class="cm-loss">{{ t('replay.compaction.pendingNote') }}</p>
  </section>
</template>

<script setup lang="ts">
  import type { Compaction } from '@/services/projects'
  import { fmtNum, fmtDuration, fmtPercent } from '@/utils/format'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'

  const props = defineProps<{ compaction: Compaction }>()

  const { t } = useI18n()

  /**
   * Le flux du SDK annonce la frontière avant d'en connaître l'issue :
   * `post_tokens` est facultatif et manque presque toujours à chaud. Une fenêtre
   * d'après ne vaut jamais zéro — le socle à lui seul pèse des milliers de
   * tokens —, donc zéro veut dire « pas encore su », pas « tout est parti ». On
   * s'abstient alors de chiffrer la perte plutôt que d'annoncer 100 %.
   */
  const settled = computed(() => props.compaction.postTokens > 0)

  const lost = computed(() => Math.max(0, props.compaction.preTokens - props.compaction.postTokens))

  const percentPart = computed(() =>
    props.compaction.preTokens > 0
      ? ` ${t('replay.compaction.removedPercent', {
          p: fmtPercent(lost.value / props.compaction.preTokens),
        })}`
      : '',
  )
  const durationPart = computed(() =>
    props.compaction.durationMs > 0 ? t('replay.compaction.removedIn', { d: fmtDuration(props.compaction.durationMs) }) : '',
  )
  const triggerLabel = computed(() => t(props.compaction.trigger === 'auto' ? 'replay.compaction.auto' : 'replay.compaction.manual'))
</script>

<style scoped lang="scss">
  .cm {
    border: 1px solid var(--warn);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    padding: var(--space-sm) var(--space-md);
  }

  .cm-title {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--warn);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .cm-trigger {
    color: var(--faint);
    text-transform: none;
    letter-spacing: 0;
  }

  .cm-figures {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    margin: var(--space-xs) 0 0;
    font-size: var(--fs-lg);
  }

  // Struck-through, because that window no longer exists.
  .cm-before {
    color: var(--dim);
    text-decoration: line-through;
  }

  .cm-after {
    color: var(--text);
  }

  .cm-pending {
    color: var(--faint);
  }

  .cm-unit {
    font-size: var(--fs-2xs);
    color: var(--faint);
  }

  .cm-loss {
    margin: var(--space-xs) 0 0;
    font-size: var(--fs-xs);
    color: var(--muted);
  }
</style>
