<template>
  <div class="ub">
    <div class="ub-head">
      <span class="ub-time font-mono">{{ time }}</span>
      <span v-if="isQueued" class="ub-queued">
        <q-icon name="pending" size="12px" aria-hidden="true" />
        {{ t('replay.user.queued') }}
        <q-tooltip>
          {{ t('replay.user.queuedHint') }}
        </q-tooltip>
      </span>
      <span class="ub-who">{{ who }}</span>
      <q-icon :name="icon" size="14px" aria-hidden="true" />
    </div>

    <div class="ub-bubble" :class="{ 'ub-bubble--brief': isBrief }">
      <CopyButton v-if="text" :text="text" :label="copyLabel" class="ub-copy" />
      <template v-for="(b, i) in event.blocks" :key="i">
        <MarkdownView v-if="b.kind === 'text'" :source="b.text ?? ''" />
        <ImageStrip v-else-if="b.kind === 'image' && b.images?.length" :images="b.images" :label="t('replay.user.imageLabel')" />
        <p v-else-if="b.kind === 'image'" class="ub-image font-mono">
          {{ t('replay.user.imageMissing') }}
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
  import CopyButton from '@/components/ui/CopyButton.vue'
  import type { TranscriptEvent } from '@/services/projects'
  import { fmtTime } from '@/utils/format'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import ImageStrip from './ImageStrip.vue'
  import MarkdownView from './MarkdownView.vue'

  const { t } = useI18n()

  const props = defineProps<{ event: TranscriptEvent }>()

  /**
   * Une bulle dans le flux d'un sous-agent n'est pas de l'humain.
   *
   * C'est la consigne que l'orchestrateur a envoyée à son agent. Elle se rend du
   * même côté — c'est bien le donneur d'ordre qui parle — mais elle ne peut pas
   * s'annoncer par « Vous » : personne n'écrit dans la conversation d'un agent.
   */
  const isBrief = computed(() => props.event.isSidechain)

  /**
   * Tapé pendant que l'agent répondait, donc arrivé au milieu de son tour.
   *
   * Sans ce repère, la bulle laisse croire que l'agent avait fini de parler avant
   * qu'on lui écrive — alors que le tour d'avant est coupé en plein élan, et que
   * ce message est précisément ce qui l'a fait changer de cap.
   */
  const isQueued = computed(() => props.event.origin === 'queued')
  const who = computed(() => (isBrief.value ? t('replay.user.brief') : t('replay.user.you')))
  const icon = computed(() => (isBrief.value ? 'assignment' : 'person'))
  const copyLabel = computed(() => (isBrief.value ? t('replay.user.copyBrief') : t('replay.user.copyMine')))

  const text = computed(() =>
    props.event.blocks
      .filter((b) => b.kind === 'text')
      .map((b) => b.text ?? '')
      .join('\n\n'),
  )

  const time = computed(() => fmtTime(props.event.timestamp ?? 0))
</script>

<style scoped lang="scss">
  .ub {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-xs);
  }
  .ub-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--dim);
    font-size: var(--fs-2xs);
  }
  .ub-who {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--muted);
  }
  /* Une mention, pas une alerte : elle date le message, elle ne le qualifie pas. */
  .ub-queued {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0 var(--space-xs);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-xs);
    color: var(--dim);
    font-size: var(--fs-2xs);
    cursor: default;
  }
  .ub-bubble {
    position: relative;
    max-width: 85%;
    min-width: 0;
    padding: var(--space-sm) var(--space-lg);
    background: var(--surface-2);
    border: 1px solid var(--line-2);
    // The squared-off bottom-right corner points back at its author.
    border-radius: var(--radius-md) var(--radius-md) var(--radius-xs) var(--radius-md);
  }
  /* Une consigne fait souvent trente lignes là où un message humain en fait trois.
   Elle garde sa forme de bulle mais se plafonne et défile chez elle, pour ne pas
   repousser sous la ligne de flottaison ce que l'agent a répondu. */
  .ub-bubble--brief {
    max-width: 100%;
    max-height: 320px;
    overflow: auto;
  }
  .ub-copy {
    position: absolute;
    top: var(--space-xs);
    right: var(--space-xs);
    opacity: 0;
    transition: opacity var(--motion-fast);
  }
  .ub-bubble:hover .ub-copy,
  .ub-copy:focus-visible {
    opacity: 1;
  }
  .ub-image {
    margin: 0;
    color: var(--dim);
    font-size: var(--fs-sm);
  }
</style>
