<template>
  <q-page class="rp">
    <!-- Loading -->
    <div v-if="loading" class="rp-skel">
      <q-skeleton type="rect" height="90px" class="q-mb-md" />
      <q-skeleton type="rect" height="60px" class="q-mb-sm" />
      <q-skeleton type="rect" height="120px" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rp-state" role="alert">
      <q-icon name="error_outline" size="28px" color="negative" />
      <p>{{ error }}</p>
      <q-btn flat no-caps :label="t('common.retry')" @click="load(true)" />
    </div>

    <template v-else-if="data">
      <!-- Session summary -->
      <header class="surface-card rp-summary">
        <div class="rp-summary-main">
          <h1 class="rp-title">
            {{ data.title || data.firstPrompt || t('pages.replay.untitled') }}
            <!-- A name the user typed is worth distinguishing from a generated one. -->
            <span v-if="data.titleSource === 'custom'" class="rp-title-badge font-mono">{{
              t('pages.replay.named')
            }}</span>
          </h1>
          <div class="rp-meta font-mono">
            <span v-if="data.gitBranch"
              ><q-icon name="account_tree" size="13px" /> {{ data.gitBranch }}</span
            >
            <span v-if="data.stats.models.length"
              ><q-icon name="memory" size="13px" /> {{ data.stats.models.join(', ') }}</span
            >
            <span><q-icon name="schedule" size="13px" /> {{ fmtDate(data.stats.startedAt) }}</span>
            <span v-if="data.hasSidechain" class="rp-meta-sub"
              ><q-icon name="account_tree" size="13px" /> {{ t('pages.replay.subagents') }}</span
            >
          </div>
        </div>
        <dl class="rp-stats font-mono">
          <div>
            <dt>{{ t('pages.replay.stats.turns') }}</dt>
            <dd>{{ data.stats.userTurns }} / {{ data.stats.assistantTurns }}</dd>
            <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
              <i18n-t keypath="pages.replay.stats.turnsTip" tag="span" scope="global">
                <template #you>
                  <strong>{{ t('pages.replay.stats.you') }}</strong>
                </template>
                <template #claude>
                  <strong>{{ t('pages.replay.stats.claude') }}</strong>
                </template>
              </i18n-t>
            </q-tooltip>
          </div>
          <div>
            <dt>{{ t('pages.replay.stats.tools') }}</dt>
            <dd>{{ data.stats.toolCalls }}</dd>
            <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
              {{ t('pages.replay.stats.toolsTip') }}
            </q-tooltip>
          </div>
          <div>
            <dt>{{ t('pages.replay.stats.tokensIn') }}</dt>
            <dd>{{ fmtNum(data.stats.tokensIn) }}</dd>
            <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
              <i18n-t keypath="pages.replay.stats.tokensInTip" tag="span" scope="global">
                <template #in>
                  <strong>{{ t('pages.replay.stats.in') }}</strong>
                </template>
              </i18n-t>
            </q-tooltip>
          </div>
          <div>
            <dt>{{ t('pages.replay.stats.tokensOut') }}</dt>
            <dd>{{ fmtNum(data.stats.tokensOut) }}</dd>
            <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
              <i18n-t keypath="pages.replay.stats.tokensOutTip" tag="span" scope="global">
                <template #out>
                  <strong>{{ t('pages.replay.stats.out') }}</strong>
                </template>
              </i18n-t>
            </q-tooltip>
          </div>
          <div>
            <dt>{{ t('pages.replay.stats.cache') }}</dt>
            <dd>{{ fmtNum(data.stats.cacheRead) }}</dd>
            <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
              <i18n-t keypath="pages.replay.stats.cacheTip" tag="span" scope="global">
                <template #cache>
                  <strong>{{ t('pages.replay.stats.cacheWord') }}</strong>
                </template>
              </i18n-t>
            </q-tooltip>
          </div>
          <div>
            <dt>{{ t('pages.replay.stats.duration') }}</dt>
            <dd>{{ fmtDuration(data.stats.durationMs) }}</dd>
            <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
              {{ t('pages.replay.stats.durationTip') }}
            </q-tooltip>
          </div>
        </dl>
      </header>

      <!--
        Deux colonnes : la conversation à gauche, ce qu'elle a coûté à droite.
        Les deux panneaux vivaient dans des tiroirs qu'il fallait ouvrir — donc
        savoir qu'ils existaient, et perdre la vue du flux en les consultant. En
        colonne, ils sont lus en même temps que le tour qui les explique, et le
        chiffre du coût cesse d'être une chose à aller chercher.
      -->
      <div class="rp-cols">
        <div class="rp-main">
          <!--
            La barre du flux : ce qu'on regarde, et de quoi le déplier. Elle suit
            le défilement d'un seul tenant — changer de piste au milieu d'une
            session de trois cents tours ne doit pas demander de remonter.
          -->
          <div class="rp-head">
            <!-- Controls -->
            <div class="rp-controls">
              <span class="section-label">{{ scopeLabel }}</span>
              <q-space />
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                icon="unfold_more"
                :label="t('pages.replay.expandAll')"
                @click="expandAll"
              />
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                icon="unfold_less"
                :label="t('pages.replay.collapseAll')"
                @click="collapseAll"
              />
            </div>

            <!--
              Les pistes de la session, comme dans le direct.

              Un run de deux cents tours inséré à l'endroit de son appel noie le
              travail de l'agent principal — et une session relue est justement
              celle qu'on lit d'un bout à l'autre, sans avoir vécu le direct pour
              savoir quelle ligne appartient à qui. Conditionnée aux runs et non
              à `hasSidechain` : une barre à une seule entrée annoncerait un
              choix qui n'existe pas.
            -->
            <AgentTrackBar
              v-if="data.subagents.length"
              v-model="track"
              :runs="data.subagents"
              :main-count="mainEventCount"
            />
          </div>

          <!-- Le flux de la piste affichée. Le `tabpanel` est frère de la barre,
               et jamais son ancêtre : la liste des onglets ne peut pas vivre
               dans le panneau qu'elle commande. -->
          <div v-if="visibleEvents.length" role="tabpanel" :aria-labelledby="trackTabId(track)">
            <TranscriptTimeline
              ref="timeline"
              :events="visibleEvents"
              :silent-hooks="data?.silentHooks"
              :context="data.context"
              :show-run-prompt="track !== ''"
            />
          </div>

          <!-- Piste vide. Une session dont le fichier mère a disparu garde ses
               sidecars : le fil principal est alors vide sous une barre pleine,
               et « aucun message » se lirait comme une panne. -->
          <div v-else class="rp-state">
            <q-icon name="hourglass_empty" size="28px" aria-hidden="true" />
            <p v-if="data.subagents.length && !track">
              {{ t('pages.replay.emptyMain') }}
            </p>
            <p v-else>{{ t('pages.replay.emptyTrack') }}</p>
          </div>
        </div>

        <!--
          La colonne suit le défilement et tient dans un écran — mais un écran ne
          se partage pas en trois.

          Les trois panneaux ouverts ensemble recevaient 90, 250 et 170 pixels :
          trois barres de défilement empilées, le contexte réduit à deux de ses
          dix catégories, les constats du diagnostic tous sous la ligne de
          flottaison. Aucun des trois ne tronquait ses données ; c'est la place
          qu'on leur donnait qui mentait.

          Un seul est déplié à la fois, et il prend toute la colonne — trois fois
          la surface. Les autres gardent leur titre et leur chiffre : ce qu'on
          replie, c'est le détail, jamais la mesure. Les trois peuvent l'être
          ensemble, et le transcript retrouve alors l'écran entier.
        -->
        <aside class="rp-aside" :aria-label="t('pages.replay.aside')">
          <!--
            Le plan de travail, comme dans le direct.

            Une session relue a fini son travail, mais son plan reste ce qui
            explique le fil : il dit en dix lignes ce que les trois cents tours
            du flux ont poursuivi, et chaque tâche renvoie au tour où elle a
            commencé. C'est même ici qu'il sert le plus — devant un direct, on
            sait ce qu'on regarde ; devant un transcript d'il y a trois mois, non.

            Absent quand la session ne tient pas de liste : une carte vide
            prendrait la place du contexte sans rien apprendre.
          -->
          <AsideSection
            v-if="tasks.tasks.length"
            :title="t('pages.replay.tasks')"
            :open="openPanel === 'tasks'"
            @toggle="togglePanel('tasks')"
          >
            <template #summary>
              <span v-if="tasks.currentWave">
                {{ tasks.currentWave.done }} / {{ tasks.currentWave.tasks.length }}
              </span>
            </template>
            <TaskPanel :progress="tasks" @navigate="(u: string) => void goToTurn(u)" />
          </AsideSection>

          <AsideSection
            :title="t('pages.replay.context')"
            :open="openPanel === 'context'"
            @toggle="togglePanel('context')"
          >
            <!-- Le remplissage, replié comme ouvert : c'est le chiffre pour
                 lequel on ouvre le panneau, autant le donner d'emblée. -->
            <template #summary>
              <span v-if="fill">{{ fmtPercent(fill.percent / 100) }}</span>
            </template>
            <!-- `ContextPanel` porte déjà son propre rembourrage. -->
            <!-- Sans `cost-usd` : le total est dit dans le panneau voisin,
                 décomposé. Le panneau ne l'affiche que si on le lui donne — le
                 tiroir de la page Sessions, lui, n'a pas de voisin pour le dire. -->
            <ContextPanel
              :context="data.context"
              @navigate="(u: string) => void goToTurn(u)"
              @summary="fill = $event"
            />
          </AsideSection>

          <!-- Le panneau ne parle plus seulement d'argent : il situe aussi ce
               que la session a fait — chercher, relire. D'où le titre. -->
          <AsideSection
            :title="t('pages.replay.diagnostic')"
            :open="openPanel === 'cost'"
            pad
            @toggle="togglePanel('cost')"
          >
            <!--
              Le montant et, s'il y a lieu, la gravité du pire constat. Replié,
              c'est tout ce qu'on saura du diagnostic — et c'est ce qui décide de
              l'ouvrir. Le résumé reste vide pendant le chargement : une ligne de
              titre qui saute vaut moins qu'une seconde d'attente.
            -->
            <template #summary>
              <q-icon
                v-if="diag?.worst"
                :name="severityIcon(diag.worst)"
                :style="{ color: severityColor(diag.worst) }"
                size="14px"
                :aria-label="severityLabel(diag.worst)"
              />
              <span v-if="diag">{{ diag.partial ? '≥ ' : '' }}{{ fmtCost(diag.totalUsd) }}</span>
            </template>
            <SessionCostPanel :project="slug" :session-id="id" @summary="diag = $event" />
          </AsideSection>
        </aside>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { readTranscript, type ParsedTranscript } from '@/services/projects';
import { onClaudeChange } from '@/services/events';
import type { Severity } from '@/services/diagnostics';
import { severityIcon, severityColor, severityLabel } from '@/services/diagnostics/severity';
import { prettyProjectSlug } from '@/utils/slug';
import { useI18n } from 'vue-i18n';
import { fmtDate, fmtNum, fmtDuration, fmtCost, fmtPercent } from '@/utils/format';
import { setBreadcrumbs } from '@/composables/useBreadcrumbs';
import { provideExpandAll } from '@/composables/useExpandAll';
import {
  eventsOfTrack,
  trackOfEvent,
  trackTabId,
  MAIN_TRACK,
  type TrackId,
} from '@/composables/useAgentTracks';
import TranscriptTimeline from '@/components/replay/TranscriptTimeline.vue';
import AgentTrackBar from '@/components/replay/AgentTrackBar.vue';
import AsideSection from '@/components/replay/AsideSection.vue';
import ContextPanel from '@/components/replay/ContextPanel.vue';
import SessionCostPanel from '@/components/replay/SessionCostPanel.vue';
import TaskPanel from '@/components/replay/TaskPanel.vue';
import { TRANSCRIPT_SOURCE } from '@/components/replay/transcriptSource';
import { trackTasks, taskIndex, TASK_INDEX } from '@/components/replay/taskList';
import { indexRuns, AGENT_RUNS, OPEN_TRACK } from '@/components/replay/agentRuns';

const { t } = useI18n();

const props = defineProps<{ slug: string; id: string }>();

const route = useRoute();
const router = useRouter();

// Seule la méthode exposée nous intéresse ; `InstanceType` se résoudrait en `any`.
const timeline = ref<{ scrollToEvent: (uuid: string) => Promise<boolean> } | null>(null);

/**
 * Suivre un lien du panneau de contexte ou du plan jusqu'au tour qu'il désigne.
 *
 * Ces liens visent tous le fil principal, mais on peut les suivre depuis la
 * piste d'un agent — leur cible n'est alors pas à l'écran. On change de piste
 * avant de sauter, plutôt que d'échouer en silence.
 */
async function goToTurn(uuid: string): Promise<void> {
  const target = trackByUuid.value.get(uuid);
  if (target !== undefined && target !== track.value) {
    track.value = target;
    await nextTick();
  }
  await timeline.value?.scrollToEvent(uuid);
}

// Lets a tool call deep in the timeline fetch the output Claude Code spilled to
// disk, without threading (slug, id) through every component in between.
provide(
  TRANSCRIPT_SOURCE,
  computed(() => ({ slug: props.slug, sessionId: props.id })),
);

const data = ref<ParsedTranscript | null>(null);
const loading = ref(true);
const error = ref('');

// Reaches every fold in the timeline — turns, tool calls, results, reasoning,
// reports — without any of them being props of TranscriptTimeline.
const { expandAll, collapseAll } = provideExpandAll();

const projectName = computed(() => prettyProjectSlug(props.slug));
const shortId = computed(() => props.id.slice(0, 8));

// ── Les pistes ───────────────────────────────────────────────────────────────

/**
 * La piste demandée : `''` pour le fil principal, sinon un `agentId`.
 *
 * Brute, non résolue : l'URL peut nommer une piste avant que le transcript qui
 * la contient soit arrivé. `track` fait le tri une fois les runs connus, et
 * retombe sur le fil principal pour un identifiant qui n'existe pas — un lien
 * partagé vers une session ne doit pas ouvrir sur un flux vide.
 */
const wantedTrack = ref<TrackId>(String(route.query.agent ?? ''));

const track = computed<TrackId>({
  get: () =>
    data.value?.subagents.some((r) => r.agentId === wantedTrack.value)
      ? wantedTrack.value
      : MAIN_TRACK,
  set: (v) => {
    wantedTrack.value = v;
  },
});

/** Tout ce que porte le transcript, sans tri : ce que la page mesure. */
const allEvents = computed(() => data.value?.events ?? []);

/**
 * Le flux affiché : celui de la piste choisie, et lui seul.
 *
 * Les autres lecteurs du transcript passent par `allEvents` — le plan de
 * travail, l'état des runs et le contexte décrivent la session entière, pas la
 * piste qu'on regarde, et ils ne doivent pas maigrir en changeant d'onglet.
 */
const visibleEvents = computed(() => eventsOfTrack(allEvents.value, track.value));

/** Où se trouve chaque événement — pour sauter à un tour d'une autre piste. */
const trackByUuid = computed(() => trackOfEvent(allEvents.value));

/** Ce qui reste au fil principal une fois les agents sortis, pour son onglet. */
const mainEventCount = computed(() => allEvents.value.filter((e) => !e.agentId).length);

/** Le run affiché, quand ce n'est pas le fil principal. */
const currentRun = computed(
  () => data.value?.subagents.find((r) => r.agentId === track.value) ?? null,
);

/** Ce que la barre d'outils annonce du flux qu'elle surplombe. */
const scopeLabel = computed(() => {
  const run = currentRun.value;
  if (!run) {
    return data.value?.subagents.length
      ? t('pages.replay.scope.main')
      : t('pages.replay.scope.all');
  }
  return t('pages.replay.scope.track', {
    agent: run.agentType ?? t('pages.replay.scope.unnamed'),
    turns: t('pages.replay.scope.turns', run.turns),
  });
});

/**
 * Refléter la piste dans l'URL, sans rien y perdre.
 *
 * Une piste est une adresse : c'est elle qu'on partage quand on veut montrer ce
 * qu'un agent a fait. On repart de la query courante pour laisser survivre un
 * paramètre étranger.
 */
watch(wantedTrack, () => {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(route.query)) if (typeof v === 'string') q[k] = v;
  if (wantedTrack.value) q.agent = wantedTrack.value;
  else delete q.agent;
  void router.replace({ query: q });
});

// Changer de session, c'est repartir du fil principal : la piste d'une session
// n'a aucun sens dans la suivante, et son identifiant n'y existe même pas.
watch(
  () => props.id,
  () => {
    wantedTrack.value = MAIN_TRACK;
  },
);

/** Le plan de travail rejoué — la colonne l'affiche, les jalons du flux le lisent. */
const tasks = computed(() => trackTasks(allEvents.value));

// ── La colonne latérale ──────────────────────────────────────────────────────

type AsidePanel = 'tasks' | 'context' | 'cost';

/**
 * Le panneau déplié — un seul à la fois, ou aucun.
 *
 * Tout replier laisse trois titres et leurs chiffres, ce qui suffit souvent :
 * on sait où en est le plan, ce que remplit la fenêtre et ce que la session a
 * coûté sans quitter le flux des yeux. C'est aussi la seule façon de rendre au
 * transcript la pleine hauteur de l'écran quand on lit une longue conversation.
 *
 * Le contexte est déplié au premier affichage — c'est le plus long des trois,
 * celui à qui la hauteur retrouvée profite le plus, et la question qu'on se pose
 * en relisant une session est le plus souvent « qu'est-ce qui remplit la fenêtre ».
 */
const openPanel = ref<AsidePanel | null>('context');

/** Ouvrir celui-là, ou refermer si c'est déjà lui. */
function togglePanel(k: AsidePanel): void {
  openPanel.value = openPanel.value === k ? null : k;
}

/** Le remplissage de la fenêtre, que le panneau replié ne dirait plus. */
const fill = ref<{ total: number; limit: number; percent: number } | null>(null);
/** Le bilan du diagnostic, idem — il se charge même replié, pour ce chiffre. */
const diag = ref<{
  totalUsd: number;
  partial: boolean;
  worst: Severity | null;
  findings: number;
} | null>(null);

// Une session sans plan n'a pas de carte « Tâches ». Si c'était elle qui était
// ouverte, la colonne montrerait un panneau qui n'existe plus — la navigation
// d'une session à l'autre ne remonte pas la page.
watch(
  () => tasks.value.tasks.length,
  (n) => {
    if (!n && openPanel.value === 'tasks') openPanel.value = 'context';
  },
);

// Le sujet de chaque tâche, pour les jalons du flux : un `TaskUpdate` ne porte
// qu'un numéro, et « #3 » n'apprend rien à qui lit.
provide(
  TASK_INDEX,
  computed(() => taskIndex(tasks.value)),
);

/**
 * L'état des runs, pour la carte que porte chaque appel `Agent`.
 *
 * Les tours du sous-agent vivent désormais dans leur piste : la carte de l'appel
 * est le seul endroit du fil principal qui dise ce que l'agent a fait, et c'est
 * exactement là qu'on le cherche puisque ses deux cents lignes partaient d'ici.
 *
 * Indexée sur tout le flux, jamais sur la piste affichée : le dernier outil d'un
 * run se lit dans les tours de l'agent, que la carte, elle, ne montre pas.
 */
provide(
  AGENT_RUNS,
  computed(() => indexRuns(allEvents.value, data.value?.subagents ?? [])),
);

/** Depuis la carte d'un appel, sauter dans la piste de son agent. */
provide(OPEN_TRACK, (agentId: string) => {
  track.value = agentId;
});

/** Une requête est en vol. */
let inFlight = false;
/** Le fichier a rebougé pendant cette requête : sa réponse est déjà périmée. */
let stale = false;
/** Empreinte du transcript affiché, pour ne pas le remplacer par son sosie. */
let etag = '';
let unsubscribe: (() => void) | null = null;

/**
 * (Re)lire le transcript.
 *
 * `showLoader` distingue le premier chargement — où le squelette est la bonne
 * réponse — des relectures poussées par le watcher, où il effacerait la session
 * sous les yeux du lecteur à chaque ligne ajoutée.
 *
 * Deux notifications rapprochées se chevaucheraient : la seconde repart avant que
 * la première ait rendu. Plutôt que de les laisser courir ensemble et laisser le
 * hasard décider laquelle écrit `data` en dernier, on n'en garde qu'une en vol et
 * on rejoue une fois à la fin si le fichier a rebougé entre-temps. Ignorer la
 * seconde perdrait la dernière ligne d'une session, définitivement.
 */
async function load(showLoader: boolean): Promise<void> {
  if (inFlight) {
    stale = true;
    return;
  }
  inFlight = true;
  if (showLoader) loading.value = true;

  const id = props.id;
  try {
    const read = await readTranscript(props.slug, id);
    // L'utilisateur a pu naviguer ailleurs pendant la requête.
    if (id !== props.id) return;
    error.value = '';
    // Même empreinte : le fichier n'a pas bougé. Réaffecter `data` reconstruirait
    // toute la timeline à l'identique. Une empreinte vide n'affirme rien.
    if (read.etag && read.etag === etag && data.value) return;
    etag = read.etag;
    data.value = read.transcript;
  } catch (e) {
    // Sur une relecture silencieuse, ne pas remplacer un transcript déjà lisible
    // par une erreur passagère : on la montre seulement si l'on n'a rien à afficher.
    if (showLoader || !data.value) {
      error.value = e instanceof Error ? e.message : t('pages.replay.error');
    }
  } finally {
    inFlight = false;
    loading.value = false;
    if (stale) {
      stale = false;
      void load(false);
    }
  }
}

onMounted(() => {
  // Fil d'Ariane du haut : Projets > <projet> > <id court>.
  setBreadcrumbs([
    { label: t('nav.projects'), to: { name: 'projects' } },
    { label: projectName.value, to: { name: 'project', params: { slug: props.slug } } },
    { label: shortId.value },
  ]);
  void load(true);

  // La session affichée peut être en cours. Le watcher du BFF dit quand elle
  // grandit ; on ne compare que l'identifiant, qui est unique — le slug, lui,
  // vient de l'URL et peut différer du nom de dossier par la casse.
  unsubscribe = onClaudeChange((ev) => {
    if (ev.kind === 'transcript' && ev.id === props.id) void load(false);
  });

  document.addEventListener('visibilitychange', revalidate);
});

onUnmounted(() => {
  unsubscribe?.();
  document.removeEventListener('visibilitychange', revalidate);
});

/**
 * Rattraper ce que le watcher a pu laisser passer.
 *
 * `fs.watch` est best-effort : il coalesce sous charge et perd des événements sur
 * certaines plateformes. Un timer de rattrapage sonderait le serveur pour rien la
 * plupart du temps — or c'est précisément le polling qu'on a retiré. Le seul
 * instant où un retard se voit est celui où l'on revient à l'écran : c'est donc
 * là qu'on relit, et l'`ETag` fait qu'un fichier inchangé ne coûte rien.
 */
function revalidate(): void {
  if (document.visibilityState === 'visible') void load(false);
}
</script>

<style scoped lang="scss">
// La barre d'état est fixée en haut de la fenêtre : tout ce qui colle au
// défilement doit s'arrêter sous elle, pas dessous.
$topbar: 40px;

.rp {
  padding: var(--space-md) var(--space-xl) var(--space-xl);
  width: 100%;
  // La largeur de lecture du flux (900) plus la colonne latérale et sa gouttière.
  max-width: 1340px;
  margin: 0 auto;
}

.rp-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: var(--space-lg);
  align-items: start;
}

.rp-main {
  min-width: 0;
  // Le flux garde sa largeur de lecture même quand la fenêtre est plus large.
  max-width: 900px;
}

.rp-aside {
  position: sticky;
  top: calc(#{$topbar} + var(--space-sm));
  height: calc(100vh - #{$topbar} - var(--space-lg));
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  // Sans cette marge, l'ombre des cartes est rognée par le bord du conteneur.
  padding: 2px;
}

// La répartition des hauteurs appartient à `AsideSection` : repliée elle prend
// celle de son titre, dépliée tout le reste. La colonne n'a plus rien à arbitrer.

// Sous cette largeur, deux colonnes ne tiennent plus : la conversation d'abord,
// les panneaux ensuite, sur toute la largeur. Le repli est conservé — dérouler
// les trois d'un coup sous le transcript est exactement ce qu'on a corrigé.
@media (max-width: 1279px) {
  .rp-cols {
    grid-template-columns: minmax(0, 1fr);
  }
  .rp-aside {
    position: static;
    height: auto;
  }
}
.rp-summary {
  padding: var(--space-lg);
  margin-bottom: var(--space-md);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-lg);
  justify-content: space-between;
}
.rp-summary-main {
  min-width: 0;
  flex: 1 1 320px;
}
.rp-title {
  margin: 0 0 var(--space-sm);
  font-size: var(--fs-md);
  font-weight: 600;
  line-height: 1.4;
}
.rp-title-badge {
  margin-left: var(--space-sm);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  border: 1px solid var(--brand-line);
  color: var(--brand);
  font-size: var(--fs-xs);
  font-weight: 400;
  vertical-align: middle;
}
.rp-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  font-size: var(--fs-xs);
  color: var(--dim);
}
.rp-meta-sub {
  color: var(--brand-muted);
}
.rp-stats {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: var(--space-sm) var(--space-lg);
  align-content: start;
}
.rp-stats div {
  display: flex;
  flex-direction: column;
  cursor: help;
}
.rp-stats dt {
  font-size: var(--fs-2xs);
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.rp-stats dd {
  margin: 0;
  font-size: var(--fs-md);
  color: var(--text);
}
// L'en-tête du flux — l'étiquette et les commandes, puis les pistes. Le fond et
// le filet sont ici : les deux rangées défilent ensemble et ne doivent pas
// laisser voir le transcript passer entre elles.
.rp-head {
  position: sticky;
  // Sous la barre d'état, qui est fixe : à `0` la barre d'outils s'y glissait
  // dessous en défilant.
  top: $topbar;
  z-index: 2;
  margin-bottom: var(--space-md);
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.rp-controls {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
  padding: var(--space-sm) var(--space-xs);
}
// La barre porte son propre filet pour le direct, où elle se pose seule sur le
// flux ; ici l'en-tête le porte déjà, et les deux se superposeraient en un trait
// de deux pixels.
.rp-head :deep(.atb) {
  border-bottom: none;
}
.rp-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xl);
  color: var(--muted);
  text-align: center;
}
.rp-state p {
  margin: 0;
}
</style>
