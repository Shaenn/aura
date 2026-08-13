<template>
  <li
    :id="`rp-node-${node.uuid}`"
    class="rp-node"
    :class="{
      'rp-node--sub': node.isSidechain,
      'rp-node--plan': inPlanMode,
      'rp-node--flash': flashed,
    }"
    :style="node.isSidechain ? { borderLeftColor: color } : undefined"
  >
    <!-- Names the run the moment it starts: the stripe alone says "a sub-agent
         ran", never which one. -->
    <p v-if="opensRun" class="rp-agent">
      <span class="rp-agent-dot" :style="{ backgroundColor: color }" aria-hidden="true" />
      {{ label }}
    </p>

    <!-- Un message reçu d'un équipier arrive dans une ligne `user` que rien ne
         marque : sans ce détour il se rendrait en bulle « Vous », et l'Atelier
         attribuerait à l'humain des mots qu'il n'a jamais écrits. -->
    <div v-if="node.kind === 'user' && node.event.origin === 'teammate'" class="rp-teammates">
      <template v-for="(b, i) in node.event.blocks" :key="i">
        <TeammateMessage v-if="b.kind === 'teammate_message'" :block="b" />
        <MarkdownView v-else-if="b.kind === 'text'" :source="b.text ?? ''" />
      </template>
    </div>

    <UserBubble v-else-if="node.kind === 'user'" :event="node.event" />

    <AssistantTurn
      v-else-if="node.kind === 'turn'"
      :turn="node"
      :card-context="cardContext"
      :live="live"
    />

    <!-- Hooks, compactions and summaries happened between turns: their place in
         the stream is what they mean. They never fold into a card. -->
    <template v-else>
      <HookRunView v-if="node.event.kind === 'hook' && node.event.hook" :run="node.event.hook" />
      <CompactionMarker
        v-else-if="node.event.kind === 'compaction' && node.event.compaction"
        :compaction="node.event.compaction"
      />
      <PlanModeMarker
        v-else-if="node.event.kind === 'planmode' && node.event.planMode"
        :mark="node.event.planMode"
      />
      <CompactSummary v-else-if="node.event.origin === 'compact-summary'" :event="node.event" />
      <CommandLine v-else-if="isCommand" :event="node.event" />
      <section v-else class="rp-loose">
        <p class="rp-loose-head">
          <q-icon :name="looseIcon" size="14px" aria-hidden="true" />
          {{ looseLabel }}
          <span class="rp-loose-time font-mono">{{ fmtTime(node.event.timestamp) }}</span>
        </p>
        <template v-for="(b, i) in node.event.blocks" :key="i">
          <MarkdownView v-if="b.kind === 'text'" :source="b.text ?? ''" />
          <TaskReport v-else-if="b.kind === 'task_notification'" :block="b" />
        </template>
      </section>
    </template>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TimelineNode } from '@/composables/useTranscriptTurns';
import type { CardContext } from './contextRows';
import { fmtTime } from '@/utils/format';
import MarkdownView from './MarkdownView.vue';
import UserBubble from './UserBubble.vue';
import AssistantTurn from './AssistantTurn.vue';
import TaskReport from './TaskReport.vue';
import TeammateMessage from './TeammateMessage.vue';
import HookRunView from './HookRunView.vue';
import CompactionMarker from './CompactionMarker.vue';
import PlanModeMarker from './PlanModeMarker.vue';
import CompactSummary from './CompactSummary.vue';
import CommandLine from './CommandLine.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    node: TimelineNode;
    /** La teinte du run, ou `undefined` sur le fil principal. */
    color?: string | undefined;
    /** Premier nœud d'un run : celui qui porte le nom de l'agent. */
    opensRun?: boolean;
    label?: string;
    cardContext?: CardContext | null;
    /** Le tour qui est en train de se dérouler : il s'ouvre en profondeur. */
    live?: boolean;
    /** On vient de s'y rendre — un liseré s'éteint tout seul. */
    flashed?: boolean;
  }>(),
  { color: undefined, opensRun: false, label: '', cardContext: null, live: false, flashed: false },
);

/**
 * Ce nœud s'est-il joué en mode plan ?
 *
 * Le filet qu'il pose est la seule chose qui distingue à l'écran une
 * exploration contrainte d'un travail ordinaire — jusqu'à 118 tours d'affilée,
 * pendant lesquels le modèle n'avait pas le droit d'écrire. Les bornes
 * elles-mêmes en sont exclues : elles disent déjà ce qu'elles sont.
 */
const inPlanMode = computed(() => {
  const node = props.node;
  if (node.kind === 'turn') return node.events.some((e) => e.inPlanMode);
  return node.event.kind !== 'planmode' && Boolean(node.event.inPlanMode);
});

/** A `/command` the user ran, or what it printed back. */
const isCommand = computed(() => {
  if (props.node.kind === 'turn') return false;
  const origin = props.node.event.origin;
  return origin === 'slash-command' || origin === 'command-output';
});

const looseIcon = computed(() =>
  props.node.kind !== 'turn' && props.node.event.kind === 'summary' ? 'summarize' : 'info',
);

const looseLabel = computed(() => {
  if (props.node.kind === 'turn') return '';
  const ev = props.node.event;
  if (ev.kind === 'summary') return t('replay.loose.summary');
  if (ev.kind === 'system' && ev.subtype) {
    return t('replay.loose.systemSub', { sub: ev.subtype });
  }
  return t('replay.loose.system');
});
</script>

<style scoped lang="scss">
.rp-node {
  min-width: 0;
  scroll-margin-block: var(--space-xl);
}

/* Jumped to from the context panel. The outline fades on its own; a reader who
   scrolled away meanwhile is not chased by it. */
.rp-node--flash {
  animation: rp-flash 1.4s ease-out;
  border-radius: var(--radius-sm);
}
@keyframes rp-flash {
  from {
    box-shadow: 0 0 0 2px var(--brand);
  }
  to {
    box-shadow: 0 0 0 2px transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rp-node--flash {
    animation-duration: 0.01ms;
    box-shadow: 0 0 0 2px var(--brand-line);
  }
}
/* A sub-agent runs its own conversation; indent it out of the main thread.
   The stripe takes the agent's hue inline; --line-2 is the fallback for a run
   with no identity at all. */
.rp-node--sub {
  margin-left: var(--space-lg);
  padding-left: var(--space-md);
  border-left: 2px solid var(--line-2);
}

/* Joué en mode plan : lecture seule. Le filet est discontinu là où celui d'un
   sous-agent est plein — ce n'est pas une autre conversation, c'est la même,
   sous contrainte. Les deux ne se rencontrent jamais : le régime d'un
   sous-agent n'est pas celui de la session, et le serveur ne marque pas ses
   lignes. */
.rp-node--plan {
  padding-left: var(--space-md);
  border-left: 2px dashed var(--brand-line);
}

/* The run's byline. Text names the agent — the dot only repeats it in colour,
   so the timeline stays readable without it. */
.rp-agent {
  margin: 0 0 var(--space-sm);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--fs-2xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.rp-agent-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.rp-teammates {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.rp-loose {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.rp-loose-head {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--fs-2xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
}
.rp-loose-time {
  text-transform: none;
  letter-spacing: 0;
}
</style>
