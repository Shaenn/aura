<template>
  <ol class="rp-timeline">
    <!-- Un seul segment : rien à replier, rien à annoncer. Une session sans
         compaction ne doit pas payer un niveau d'emboîtement pour une frontière
         qui n'existe pas. -->
    <template v-if="segments.length === 1">
      <TimelineNodeView
        v-for="row in rows"
        :key="row.node.uuid"
        :node="row.node"
        :color="row.color"
        :opens-run="row.opensRun"
        :label="row.label"
        :card-context="cardContextOf(row.node)"
        :live="row.node.uuid === liveTurnUuid"
        :flashed="flashed === row.node.uuid"
      />
    </template>

    <!-- Après une compaction, le modèle ne connaît plus le détail de ce qui
         précède : chaque segment est, pour lui, une conversation distincte. Le
         fil le dit en le montrant. Replié, un segment n'est pas monté du tout —
         c'est ce qui rend une session de mille tours lisible. -->
    <li v-for="seg in segments" v-else :key="seg.phase" class="rp-phase">
      <details :open="isOpen(seg.phase)" @toggle="onPhaseToggle(seg.phase, $event)">
        <summary class="rp-phase-head">
          <q-icon name="chevron_right" size="16px" class="rp-phase-chev" aria-hidden="true" />
          <span class="rp-phase-name">{{ seg.title }}</span>
          <span class="rp-phase-meta font-mono">{{ seg.meta }}</span>
        </summary>
        <!-- `v-if`, et pas seulement le repli : un `<details>` fermé garde ses
             enfants dans le DOM. Mesuré sur une session à trois phases — 20 965
             nœuds dans les deux phases mortes, 61 % du document, rendus et
             mesurés à chaque redimensionnement pour n'être jamais vus. C'est le
             même constat que dans `SkillDocument`, et le même remède.

             Rien ne se perd : `scrollToEvent` ouvre la phase visée avant de
             sauter, et « tout déplier » monte ce qu'il ouvre. -->
        <ol v-if="isOpen(seg.phase)" class="rp-timeline rp-timeline--inner">
          <TimelineNodeView
            v-for="row in seg.rows"
            :key="row.node.uuid"
            :node="row.node"
            :color="row.color"
            :opens-run="row.opensRun"
            :label="row.label"
            :card-context="cardContextOf(row.node)"
            :live="row.node.uuid === liveTurnUuid"
            :flashed="flashed === row.node.uuid"
          />
        </ol>
      </details>
    </li>

    <!-- Hooks that ran without producing anything: tallied, not timelined. -->
    <li v-if="silentHooks?.count" class="rp-node">
      <details class="rp-silent" :open="silentOpen" @toggle="onSilentToggle">
        <summary>
          <q-icon name="bolt" size="13px" aria-hidden="true" />
          {{ silentLabel }}
        </summary>
        <ul class="rp-silent-list">
          <li v-for="g in silentHooks.groups" :key="g.command">
            <code class="rp-silent-cmd">{{ g.command }}</code>
            <span class="rp-silent-count font-mono">
              ×{{ g.count }} · {{ fmtDuration(g.durationMs) }}
            </span>
          </li>
        </ul>
        <p class="rp-silent-note">
          {{ t('replay.timeline.silentNote') }}
        </p>
      </details>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SessionContext, SilentHooks, TranscriptEvent } from '@/services/projects';
import { useTranscriptTurns, type TimelineNode } from '@/composables/useTranscriptTurns';
import { cardContext, type CardContext } from './contextRows';
import { useExpandable, syncDetails, onExpandAll } from '@/composables/useExpandAll';
import { agentColorOf } from '@/utils/agentColors';
import { fmtDuration, fmtNum } from '@/utils/format';
import TimelineNodeView from './TimelineNodeView.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    events: TranscriptEvent[];
    /** Silent hook runs, folded into a single tally at the end of the stream. */
    silentHooks?: SilentHooks | undefined;
    /** The reconstructed context, so each card can say what it added to the window. */
    context?: SessionContext | undefined;
    /** Suivre le direct : le dernier tour s'ouvre en profondeur, à mesure. */
    followLive?: boolean;
    /**
     * Montrer la consigne qui ouvre un run de sous-agent. À n'activer que
     * lorsque le run est montré seul — sinon elle double l'appel `Agent` qui
     * l'affiche déjà, quelques lignes plus haut dans le même flux.
     */
    showRunPrompt?: boolean;
  }>(),
  { silentHooks: undefined, context: undefined, followLive: false, showRunPrompt: false },
);

const nodes = useTranscriptTurns(() => props.events, { showRunPrompt: () => props.showRunPrompt });

/** Le dernier tour du flux — celui qui est en train de se dérouler. */
const liveTurnUuid = computed(() => {
  if (!props.followLive) return null;
  for (let i = nodes.value.length - 1; i >= 0; i--) {
    const n = nodes.value[i]!;
    if (n.kind === 'turn') return n.uuid;
  }
  return null;
});

/** UUID of a turn's first row → its 0-based turn index, to map cards onto turns. */
const turnIndexByUuid = computed(() => {
  const m = new Map<string, number>();
  for (const t of props.context?.turns ?? []) m.set(t.uuid, t.turnIndex);
  return m;
});

/**
 * What a card added to the window: the tokens of the turns it covers.
 *
 * A card holds several assistant responses, each its own context turn. We match
 * a turn to its card by the uuid of the response's first row, which the card
 * carries among its events.
 */
function cardContextOf(node: TimelineNode): CardContext | null {
  if (!props.context || node.kind !== 'turn') return null;
  const indices: number[] = [];
  for (const ev of node.events) {
    const idx = turnIndexByUuid.value.get(ev.uuid);
    if (idx !== undefined) indices.push(idx);
  }
  return cardContext(props.context, indices);
}

const silentOpen = useExpandable(false);
const onSilentToggle = syncDetails(silentOpen);

interface TimelineRow {
  node: TimelineNode;
  /** The run's hue, or undefined on the main thread. */
  color: string | undefined;
  /** First node of a run: the one that carries the agent's name. */
  opensRun: boolean;
  label: string;
}

/**
 * Colour a run by its agent's name, so the same agent reads the same in every
 * session. Two runs of that agent at once would then share a stripe, which is
 * why the *label* carries the id — the colour groups, the text disambiguates.
 * A run nobody could name falls back to its id, which at least separates it
 * from its neighbours.
 */
const rows = computed((): TimelineRow[] =>
  nodes.value.map((node, i) => {
    if (!node.isSidechain) return { node, color: undefined, opensRun: false, label: '' };
    const prev = nodes.value[i - 1];
    return {
      node,
      color: agentColorOf(node),
      opensRun: !prev?.isSidechain || prev.agentId !== node.agentId,
      label: node.agentType ?? t('replay.tracks.subagent'),
    };
  }),
);

interface PhaseSegment {
  phase: number;
  title: string;
  /** Ce que le segment pèse, en une ligne, lisible replié. */
  meta: string;
  rows: TimelineRow[];
}

/**
 * Le fil découpé par compaction.
 *
 * Le premier segment est celui de la session neuve ; chacun des suivants s'ouvre
 * sur le marqueur de sa compaction, puis sur le résumé conservé — tout ce que le
 * modèle garde de ce qui précède. L'en-tête ne répète pas ce marqueur : il dit ce
 * que le segment contient quand il est fermé, quand le marqueur, lui, n'est pas
 * à l'écran.
 */
const segments = computed((): PhaseSegment[] => {
  const out: PhaseSegment[] = [];
  for (const row of rows.value) {
    const phase = row.node.phase;
    let seg = out[out.length - 1];
    if (!seg || seg.phase !== phase) {
      seg = { phase, title: t('replay.timeline.phase', { n: phase + 1 }), meta: '', rows: [] };
      out.push(seg);
    }
    seg.rows.push(row);
  }
  for (const seg of out) seg.meta = metaOf(seg);
  return out;
});

/**
 * Ce qu'un segment fermé annonce : combien de tours il tient, et la fenêtre dont
 * il repart. Les deux chiffres de la compaction sont relevés par le harness —
 * une taille d'après nulle veut dire « pas encore su », jamais « tout est parti ».
 */
function metaOf(seg: PhaseSegment): string {
  const turns = seg.rows.filter((r) => r.node.kind === 'turn' && !r.node.isSidechain).length;
  const parts = [t('replay.tracks.turns', turns)];
  const opening = seg.rows[0]?.node;
  const compaction = opening && opening.kind === 'event' ? opening.event.compaction : undefined;
  if (compaction && compaction.postTokens > 0) {
    parts.push(
      t('replay.timeline.compacted', {
        before: fmtNum(compaction.preTokens),
        after: fmtNum(compaction.postTokens),
      }),
    );
  }
  return parts.join(' · ');
}

/**
 * Les segments ouverts. Le dernier l'est, les autres non : c'est la conversation
 * en cours qu'on vient lire, et une phase fermée n'est pas montée du tout.
 */
const openPhases = ref(new Set<number>());
const isOpen = (phase: number): boolean => openPhases.value.has(phase);

watch(
  () => segments.value.length,
  (n) => {
    if (!n) return;
    // Une compaction en direct ouvre la phase qu'elle inaugure — sans quoi le
    // flux semblerait s'arrêter là. Ce qui était ouvert le reste.
    const next = new Set(openPhases.value);
    next.add(segments.value[n - 1]!.phase);
    openPhases.value = next;
  },
  { immediate: true },
);

function onPhaseToggle(phase: number, e: Event): void {
  const next = new Set(openPhases.value);
  if ((e.target as HTMLDetailsElement).open) next.add(phase);
  else next.delete(phase);
  openPhases.value = next;
}

onExpandAll((open) => {
  openPhases.value = open ? new Set(segments.value.map((s) => s.phase)) : new Set();
});

/**
 * Where a given event ended up.
 *
 * The context panel points at an *assistant response* — one `message.id`, which
 * the timeline folded into a turn card along with everything else Claude did
 * between two human messages. Scrolling to the card is the honest target: the
 * response has no box of its own on screen.
 */
const nodeOfEvent = computed((): Map<string, TimelineNode> => {
  const out = new Map<string, TimelineNode>();
  for (const node of nodes.value) {
    if (node.kind === 'turn') for (const ev of node.events) out.set(ev.uuid, node);
    else out.set(node.uuid, node);
  }
  return out;
});

const nodeAnchor = (uuid: string): string => `rp-node-${uuid}`;

/** The card we just jumped to, briefly outlined so the eye finds it. */
const flashed = ref('');
const FLASH_MS = 1400;
let flashTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Bring the card holding `uuid` into view. Returns `false` when the event is not
 * on screen at all — a caller can then say so rather than fail silently.
 *
 * Le panneau de contexte navigue vers n'importe quelle phase, y compris une
 * phase morte et repliée : on l'ouvre d'abord, sinon la cible n'existe pas dans
 * le DOM et le saut échouerait sur une session que rien n'empêche de lire.
 *
 * Et on n'ouvre qu'elle. Se rendre dans une phase, c'est dire laquelle on vient
 * lire : les autres se replient, et leurs milliers de nœuds quittent le DOM au
 * lieu de s'y empiler saut après saut. Le lecteur qui en veut deux à la fois les
 * rouvre à la main — l'inverse, refermer une à une ce que la navigation a laissé
 * ouvert, n'a pas d'équivalent.
 */
async function scrollToEvent(uuid: string): Promise<boolean> {
  const node = nodeOfEvent.value.get(uuid);
  if (!node) return false;
  if (!isOpen(node.phase) || openPhases.value.size > 1) {
    openPhases.value = new Set([node.phase]);
    await nextTick();
  }
  // De préférence le bloc de tâche lui-même, puis le jalon du tour (présent si
  // la carte est dépliée), puis la carte entière. Dans une carte de soixante-dix
  // réponses, la nuance décide si l'on tombe sur le bon tour ou sur son début.
  //
  // Le bloc de tâche passe devant parce que le jalon peut manquer là même où on
  // en aurait besoin : le harness écrit une ligne par bloc de contenu, si bien
  // qu'une réponse qui dit une phrase avant d'appeler l'outil met le relevé
  // d'usage — donc le jalon — sur la phrase, et laisse l'appel sans ancre.
  const target =
    document.getElementById(`rp-task-${uuid}`) ??
    document.getElementById(`rp-turn-${uuid}`) ??
    document.getElementById(nodeAnchor(node.uuid));
  if (!target) return false;

  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  flashed.value = node.uuid;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flashed.value = ''), FLASH_MS);
  return true;
}

onUnmounted(() => clearTimeout(flashTimer));

defineExpose({ scrollToEvent });

const silentLabel = computed((): string => {
  const n = props.silentHooks?.count ?? 0;
  const total = fmtDuration(props.silentHooks?.durationMs ?? 0);
  return t('replay.timeline.silent', { n: fmtNum(n), total }, n);
});
</script>

<style scoped lang="scss">
.rp-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}
.rp-node {
  min-width: 0;
  scroll-margin-block: var(--space-xl);
}

/* Un segment de compaction. Le liseré tient lieu de frontière : ce qui est
   dedans est une fenêtre de contexte, et une seule. */
.rp-phase {
  min-width: 0;
  scroll-margin-block: var(--space-xl);
}
.rp-phase-head {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--line-2);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.rp-phase-head::-webkit-details-marker {
  display: none;
}
.rp-phase-head:hover {
  color: var(--text);
}
.rp-phase-name {
  font-weight: 600;
}
.rp-phase-meta {
  margin-left: auto;
  text-transform: none;
  letter-spacing: 0;
  color: var(--faint);
  font-size: var(--fs-2xs);
}
.rp-phase-chev {
  transition: transform var(--motion-fast);
  flex: 0 0 auto;
}
details[open] > .rp-phase-head .rp-phase-chev {
  transform: rotate(90deg);
}
@media (prefers-reduced-motion: reduce) {
  .rp-phase-chev {
    transition: none;
  }
}
.rp-timeline--inner {
  padding: var(--space-lg) 0 0 var(--space-md);
  border-left: 2px solid var(--line-2);
  margin-left: var(--space-sm);
}

.rp-silent > summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--dim);
  font-size: var(--fs-xs);
}
.rp-silent > summary::-webkit-details-marker {
  display: none;
}
.rp-silent > summary:hover {
  color: var(--muted);
}
.rp-silent-list {
  list-style: none;
  margin: var(--space-sm) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.rp-silent-list > li {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  justify-content: space-between;
}
.rp-silent-cmd {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-2xs);
  color: var(--muted);
  word-break: break-all;
}
.rp-silent-count {
  flex-shrink: 0;
  font-size: var(--fs-2xs);
  color: var(--faint);
}
.rp-silent-note {
  margin: var(--space-sm) 0 0;
  color: var(--faint);
  font-size: var(--fs-2xs);
  font-style: italic;
}
</style>
