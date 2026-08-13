<template>
  <div class="tv">
    <ToolChips :items="params" />

    <!--
      L'état du run, là où ses tours se trouvaient avant d'avoir leur piste.

      C'est le seul endroit du fil principal qui dise ce que l'agent est en train
      de faire — et c'est celui où le lecteur regardait déjà, puisque les deux
      cents lignes du run partaient d'ici.
    -->
    <section
      v-if="view"
      class="av-run"
      :class="[`av-run--${view.run.status}`, { 'av-run--lit': live }]"
      :style="{ '--agent-accent': accent }"
    >
      <LottieView v-if="live" :data="robot" :size="44" class="av-robot" />
      <span
        v-else
        class="av-mark"
        :class="view.run.status === 'failed' ? 'av-mark--failed' : 'av-mark--done'"
        aria-hidden="true"
      >
        <q-icon :name="view.run.status === 'failed' ? 'error_outline' : 'check'" size="20px" />
      </span>

      <div class="av-run-body">
        <p class="av-run-head">
          <span class="av-run-name">{{ agentName }}</span>
          <span class="av-run-state" :class="{ 'av-run-state--live': live }">{{ stateLabel }}</span>
          <span class="av-run-count font-mono">
            {{ t('replay.tools.views.agent.turns', view.run.turns) }}
            <!-- Ce que les tours ne disent pas : un run qui a touché au dépôt ne
                 se relit pas comme un run qui a seulement cherché. -->
            <template v-if="view.filesWritten">
              · {{ t('replay.tools.views.agent.files', view.filesWritten) }}
            </template>
          </span>
        </p>

        <!--
          Ce que l'agent fait à l'instant. Un `aria-live` poli : la ligne change à
          chaque appel d'outil, et l'annoncer sur-le-champ couperait la parole au
          lecteur d'écran à chaque `Read`.
        -->
        <p v-if="view.lastTool" class="av-run-tool" :aria-live="live ? 'polite' : 'off'">
          <span class="av-run-toolname font-mono">{{ view.lastTool }}</span>
          <span v-if="view.lastToolSummary" class="av-run-toolarg">{{ view.lastToolSummary }}</span>
        </p>

        <q-btn
          v-if="openTrack"
          flat
          dense
          no-caps
          size="sm"
          icon-right="chevron_right"
          class="av-run-open"
          :label="live ? t('replay.tools.views.agent.follow') : t('replay.tools.views.agent.open')"
          @click="openTrack(view.run.agentId)"
        />
      </div>
    </section>

    <details v-if="prompt" class="av-prompt" :open="promptOpen" @toggle="onPromptToggle">
      <summary>
        <q-icon name="assignment" size="13px" aria-hidden="true" />
        {{ t('replay.tools.views.agent.prompt') }}
      </summary>
      <MarkdownView :source="prompt" />
    </details>

    <!-- The agent answers in prose. A <pre> would be a wall; render the markdown. -->
    <section v-if="report" class="av-report">
      <h4 class="section-label">{{ t('replay.tools.views.agent.report') }}</h4>
      <MarkdownView :source="report" />
    </section>

    <!--
      Un lancement en arrière-plan dont aucune piste ne répond.

      Le harnais renvoie alors un pavé de plomberie qui dit lui-même « never
      quote or paste any part of it, including the agentId below » — et l'Atelier
      le collait tel quel. 13 appels du parc sont dans ce cas : lancés en
      arrière-plan, sans fichier de piste à côté. Il n'y a qu'une chose à en
      retenir, et elle tient en une phrase.
    -->
    <p v-else-if="launched" class="av-async">
      <q-icon name="rocket_launch" size="14px" aria-hidden="true" />
      {{ t('replay.tools.views.agent.async') }}
    </p>

    <OutputPane
      v-else-if="!view"
      :content="block.result?.content ?? ''"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { Block } from 'src/services/projects';
import { syncDetails } from 'src/composables/useExpandAll';
import { asRecord, chips, str } from '../values';
import ToolChips from '../ToolChips.vue';
import OutputPane from '../OutputPane.vue';
import MarkdownView from 'components/replay/MarkdownView.vue';
import LottieView from 'components/ui/LottieView.vue';
import { AGENT_RUNS, OPEN_TRACK } from 'components/replay/agentRuns';
import { agentColorOf } from 'src/utils/agentColors';
import robot from 'src/assets/lottie/robot.json';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

/**
 * La consigne reste repliée, et elle échappe au « tout déplier ».
 *
 * C'est le seul bloc du flux dont la longueur ne dépend pas de ce que la session
 * a fait : un prompt d'agent fait couramment cinquante lignes, et la carte
 * n'existe que pour dire en trois lignes où en est le run. Dépliée, elle
 * repousse cet état hors de l'écran — et le mode direct, qui ouvre d'office tout
 * ce qui naît dans le tour en cours, l'ouvrait précisément quand l'agent
 * travaille, c'est-à-dire quand on a le plus besoin de voir son avancement.
 *
 * Un `ref` local plutôt qu'`useExpandable` : aucune commande globale ne doit la
 * rouvrir. Elle reste à un clic.
 */
const promptOpen = ref(false);
const onPromptToggle = syncDetails(promptOpen);

const input = computed(() => asRecord(props.block.input));
const prompt = computed(() => str(input.value.prompt));

const runs = inject(AGENT_RUNS, null);
const openTrack = inject(OPEN_TRACK, null);

/** Le run que cet appel a lancé, quand la page en tient la liste. */
const view = computed(() => (props.block.id ? (runs?.value.get(props.block.id) ?? null) : null));

/** Un run qu'aucun signal n'a clos : c'est lui qu'on regarde travailler. */
const live = computed(
  () => view.value?.run.status === 'running' || view.value?.run.status === 'unknown',
);

const STATES = new Set(['running', 'completed', 'failed', 'unknown']);

const stateLabel = computed(() => {
  const status = view.value?.run.status ?? '';
  return STATES.has(status) ? t(`replay.tools.views.agent.state.${status}`) : '';
});

/**
 * La teinte de l'agent, la même qu'au filet de ses blocs et à sa pastille de
 * piste : un agent se reconnaît d'une vue à l'autre sans lire son nom.
 *
 * Elle porte l'identité, jamais l'état — celui-ci reste dit par l'icône et par
 * le mot à côté. Sans quoi une carte verte voudrait dire « agent vert » ou
 * « agent qui a réussi » selon le moment, et plus rien ne se lirait.
 */
const accent = computed(() =>
  view.value
    ? agentColorOf({
        ...(view.value.run.agentType ? { agentType: view.value.run.agentType } : {}),
        agentId: view.value.run.agentId,
      })
    : 'var(--line-2)',
);

const agentName = computed(
  () =>
    view.value?.run.agentType ?? (str(input.value.subagent_type) || t('replay.tracks.subagent')),
);

const params = computed(() =>
  chips([
    [t('replay.tools.chips.agent'), str(input.value.subagent_type)],
    [t('replay.tools.chips.model'), str(input.value.model)],
    [t('replay.tools.chips.isolation'), str(input.value.isolation)],
    // La puce « tâche » lisait `task_id` : l'outil `Agent` n'a pas ce paramètre,
    // et les 621 appels du parc ne l'ont jamais porté. Retirée.
  ]),
);

/**
 * Un lancement asynchrone que nulle piste ne suit.
 *
 * Sur 118 lancements en arrière-plan, 105 ont leur sidecar et se racontent dans
 * la carte de run ci-dessus. Les 13 restants n'ont rien : c'est pour eux seuls
 * que la phrase existe.
 */
const launched = computed(
  () => !view.value && (props.block.result?.content ?? '').startsWith('Async agent launched'),
);

/**
 * An async `Agent` call returns launch metadata, not a report — the report
 * arrives later as a `task_notification`. Only render prose as prose.
 */
const report = computed(() => {
  const result = props.block.result;
  if (!result || result.isError) return '';
  const text = result.content.trim();
  if (!text || text.startsWith('Async agent launched')) return '';
  return text;
});
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/*
  La carte du run, aux couleurs de son agent.

  Le filet gauche est celui des blocs du flux — même épaisseur, même teinte —,
  de sorte qu'on relie la carte à la piste sans lire un mot. Le fond n'en prend
  qu'un souffle : à 6 % la teinte se devine, au-delà elle concurrence le texte et
  les huit agents se mettent à crier chacun leur tour.

  La teinte dit QUI, jamais OÙ EN EST : l'état reste porté par l'icône et par le
  mot à côté. Une carte verte ne doit pas vouloir dire « agent vert » ici et
  « agent qui a réussi » ailleurs.
*/
.av-run {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--agent-accent) 10%, transparent),
      transparent 60%
    ),
    var(--surface-2);
  border: 1px solid var(--line);
  border-left: 3px solid var(--agent-accent);
  border-radius: var(--radius-sm);
}

/*
  Un run qui travaille respire, dans sa propre teinte.

  Même parti pris que la pastille `--live` du reste de l'app : le halo part de
  l'invisible et y retourne, parce que l'œil périphérique détecte les
  apparitions, pas les variations d'un halo déjà là. Il reste doux pour la même
  raison — une émission qui naît de zéro se voit sans avoir à être forte — et il
  ne se pose que sur ce qui bouge en ce moment.
*/
.av-run--lit {
  animation: av-breathe 3.2s ease-in-out infinite;
}
@keyframes av-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  50% {
    box-shadow: 0 0 14px -2px color-mix(in srgb, var(--agent-accent) 55%, transparent);
  }
}
/* Le réglage système qui demande moins de mouvement : la teinte reste, posée
   une fois pour toutes, et c'est le battement qui s'arrête. */
@media (prefers-reduced-motion: reduce) {
  .av-run--lit {
    animation: none;
    box-shadow: 0 0 12px -3px color-mix(in srgb, var(--agent-accent) 45%, transparent);
  }
}

.av-run--failed {
  border-color: var(--danger);
  border-left-color: var(--agent-accent);
}

.av-robot {
  margin: -2px 0;
}

/* À la place du robot une fois le travail fini : une pastille de même encombrement,
   pour que la carte ne saute pas de hauteur quand l'agent rend son rapport. */
.av-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 999px;
}
.av-mark--done {
  color: var(--agent-accent);
  background: color-mix(in srgb, var(--agent-accent) 14%, transparent);
}
.av-mark--failed {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.av-run-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.av-run-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  margin: 0;
  min-width: 0;
}
.av-run-name {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
}
.av-run-state {
  font-size: var(--fs-2xs);
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.av-run-state--live {
  color: var(--pulse);
}
.av-run-count {
  margin-left: auto;
  flex: none;
  font-size: var(--fs-2xs);
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}

/* L'outil courant : le nom en chasse fixe, sa cible en prose — la même
   répartition que sur les cartes d'outil du flux, pour qu'on le lise pareil. */
.av-run-tool {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  margin: 0;
  min-width: 0;
  font-size: var(--fs-xs);
}
.av-run-toolname {
  flex: none;
  color: var(--muted);
}
.av-run-toolarg {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dim);
}

.av-run-open {
  align-self: flex-start;
  margin-left: calc(var(--space-sm) * -1);
  color: var(--brand);
  font-size: var(--fs-xs);
}

.av-prompt > summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--muted);
  font-size: var(--fs-xs);
}
.av-prompt > summary::-webkit-details-marker {
  display: none;
}
.av-prompt[open] > summary {
  margin-bottom: var(--space-sm);
}
.av-async {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--muted);
}
// Même défaut qu'en `PlanView` : `.section-label` ne porte que la typographie,
// et la marge que le navigateur donne au `h4` s'ajoutait ici au `gap`.
.av-report > h4 {
  margin: 0;
}
.av-report {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  max-height: 480px;
  overflow: auto;
}
</style>
