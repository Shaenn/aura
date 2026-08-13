<template>
  <q-page class="sp" :style-fn="pageStyleFn">
    <h1 class="sr-only">{{ t('pages.sessions.title') }}</h1>

    <!-- No active session at all -->
    <div v-if="loaded && !sessions.length" class="sp-empty">
      <q-icon name="sensors_off" size="34px" aria-hidden="true" />
      <p>{{ t('pages.sessions.empty') }}</p>
      <q-btn
        flat
        no-caps
        :label="t('common.refresh')"
        :disable="loadingList"
        @click="loadSessions"
      />
    </div>

    <div v-else class="sp-split" :class="{ 'sp-split--aside': showContext }">
      <!-- ── Master : liste des sessions ─────────────────────────────────── -->
      <nav class="sp-list surface-card" :aria-label="t('pages.sessions.title')">
        <header class="sp-list-head">
          <q-icon name="sensors" size="18px" aria-hidden="true" />
          <h2>{{ t('pages.sessions.title') }}</h2>
          <span class="sp-count font-mono">{{ sessions.length }}</span>
          <q-btn
            flat
            dense
            round
            size="sm"
            icon="refresh"
            :aria-label="t('pages.sessions.reloadAria')"
            :disable="loadingList"
            @click="loadSessions"
          />
        </header>

        <!-- Le filtre n'apparaît qu'au-delà de quoi l'œil ne suffit plus. -->
        <div v-if="sessions.length > FILTER_FROM" class="sp-filter">
          <q-input
            v-model="listFilter"
            dense
            outlined
            clearable
            debounce="150"
            :placeholder="t('pages.sessions.filter')"
            :aria-label="t('pages.sessions.filterAria')"
          >
            <template #prepend><q-icon name="search" size="16px" /></template>
          </q-input>
        </div>

        <!--
          Un niveau de regroupement, pas un arbre : le projet. C'est la seule
          coupure qui existe vraiment côté Claude Code — une session appartient à
          un dossier de travail, et rien au-dessus n'a de statut. Un arbre de
          dossiers parents ferait des nœuds intermédiaires qui ne désignent aucun
          projet et qu'on ne peut ni ouvrir ni compter.
        -->
        <ul class="sp-groups">
          <li v-for="g in groups" :key="g.key" class="sp-group">
            <button
              type="button"
              class="sp-group-head"
              :aria-expanded="!collapsed.has(g.key)"
              @click="toggleGroup(g.key)"
            >
              <q-icon
                :name="collapsed.has(g.key) ? 'chevron_right' : 'expand_more'"
                size="16px"
                class="sp-group-caret"
                aria-hidden="true"
              />
              <q-icon name="folder" size="16px" class="sp-group-icon" aria-hidden="true" />
              <!-- Le nom du projet, rien d'autre. Le chemin est disponible d'un
                   clic dans l'en-tête du flux, là où il sert (on le colle) ; ici
                   il ne servait qu'à répéter la même racine sur chaque groupe. -->
              <span class="sp-group-name">{{ g.name }}</span>
              <!--
                Un seul nombre : le total. Il y en avait deux — les actives et le
                total — et sur un projet à session unique ils affichaient le même
                « 1 » côte à côte, ce qui se lit comme une erreur. Le point dit
                qu'il se passe quelque chose ici, le nombre dit combien de
                sessions, et le détail est juste en dessous.
              -->
              <span
                v-if="g.live"
                class="status-dot status-dot--live status-dot--pulse sp-group-dot"
                aria-hidden="true"
              />
              <span class="sp-count font-mono">
                {{ g.sessions.length }}
                <span class="sr-only">
                  {{ t('pages.sessions.groupCount', g.sessions.length)
                  }}{{ g.live ? t('pages.sessions.groupLive', { n: g.live }) : '' }}
                </span>
              </span>
            </button>

            <ul v-show="!collapsed.has(g.key)" class="sp-items">
              <li v-for="s in g.sessions" :key="s.sessionId">
                <button
                  type="button"
                  class="sp-item"
                  :class="{ 'sp-item--active': s.sessionId === selectedId }"
                  :aria-current="s.sessionId === selectedId ? 'true' : undefined"
                  @click="select(s.sessionId)"
                >
                  <span class="status-dot" :class="dotClasses(s)" aria-hidden="true" />
                  <span class="sp-item-name">{{ shortLabel(s) }}</span>
                  <span
                    class="sp-item-status font-mono"
                    :class="{
                      'sp-item-status--on': s.status === 'busy',
                      'sp-item-status--wait': s.status === 'waiting',
                    }"
                  >
                    {{ s.status ?? t('pages.sessions.unknownStatus') }}
                  </span>
                </button>
              </li>
            </ul>
          </li>
        </ul>

        <EmptyState v-if="!groups.length" center pad="lg" :message="t('pages.sessions.noMatch')" />
      </nav>

      <!-- ── Détail : stream de la session sélectionnée ──────────────────── -->
      <section
        ref="scrollEl"
        class="sp-stream"
        :aria-label="t('pages.sessions.stream')"
        @scroll="onScroll"
      >
        <div v-if="!selected" class="sp-state">
          <q-icon name="ads_click" size="28px" aria-hidden="true" />
          <p>{{ t('pages.sessions.pick') }}</p>
        </div>

        <div v-else-if="!selected.slug" class="sp-state" role="alert">
          <q-icon name="help_outline" size="28px" aria-hidden="true" />
          <p>{{ t('pages.sessions.noTranscript') }}</p>
          <span class="sp-state-sub font-mono">{{ winPath(selected.cwd) }}</span>
        </div>

        <template v-else>
          <!-- En-tête + bandeau d'autorisation : épinglés en haut du flux, pour
               rester visibles même quand l'auto-défilement colle le flux au bas. -->
          <div class="sp-stream-top">
            <header class="sp-stream-head">
              <div class="sp-stream-title">
                <span class="status-dot" :class="dotClasses(selected)" aria-hidden="true" />
                <!-- `name` is a handle (slug + id prefix); the transcript's own
                   title says what the session is actually about. -->
                <span class="sp-stream-name">{{ data?.title || sessionLabel(selected) }}</span>
                <span v-if="data?.title" class="sp-stream-handle font-mono">
                  {{ sessionLabel(selected) }}
                </span>
                <span class="sp-badge font-mono" :class="`sp-badge--${streamState}`">{{
                  badgeLabel
                }}</span>
                <!-- Le chemin complet ne s'écrit plus dans l'en-tête : sa longueur
                   variait d'une session à l'autre et poussait les réglages à
                   droite d'une place différente à chaque sélection. Le projet est
                   déjà lisible à gauche ; ici il ne reste que son nom, et le
                   chemin entier au survol. -->
                <button
                  type="button"
                  class="sp-stream-project"
                  :aria-label="t('pages.sessions.copyPathAria', { path: winPath(selected.cwd) })"
                  @click="copyCwd(selected.cwd)"
                >
                  <q-icon :name="copied ? 'check' : 'folder'" size="14px" aria-hidden="true" />
                  {{ projectName(selected.cwd) }}
                  <q-tooltip anchor="bottom start" self="top start">
                    <span class="font-mono">{{ winPath(selected.cwd) }}</span>
                    <br />
                    {{ t('pages.sessions.copyPath') }}
                  </q-tooltip>
                </button>
              </div>
              <q-space />
              <q-toggle
                v-model="autoScroll"
                dense
                size="sm"
                :label="t('pages.sessions.autoScroll')"
                class="sp-toggle"
                @update:model-value="onFollowToggle"
              />
              <q-toggle
                v-model="followLive"
                dense
                size="sm"
                :label="t('pages.sessions.followLive')"
                class="sp-toggle"
              />
              <!-- Même présentation que la page Replay : le bouton vit dans l'en-tête
                 des contrôles, pas dans une barre concurrente au sticky du haut. -->
              <!-- Le tiroir ne sert plus que faute de place : au-delà du seuil,
                 le contexte vit dans la colonne de droite. Un seul des deux est
                 monté à la fois — le panneau est le même, et le rendre deux fois
                 doublerait son travail pour n'en montrer qu'un. -->
              <ContextDrawer
                v-if="data && !contextColumn"
                :context="data.context"
                :cost-usd="data.stats.costUsd"
                :cost-partial="data.stats.costPartial"
                drawer-id="sp-context-drawer"
                live
                @navigate="(u: string) => void goToTurn(u)"
              />
            </header>

            <!--
            Les pistes de la session, quand elle a lancé des agents. Une
            navigation : elle passe avant les indicateurs, qui décrivent ce que la
            piste choisie montre. Conditionnée aux runs et non à `hasSidechain` —
            un sidecar peut ne pas porter le drapeau, et une barre à une seule
            entrée annoncerait un choix qui n'existe pas.
          -->
            <AgentTrackBar
              v-if="data?.subagents.length"
              v-model="track"
              :runs="data.subagents"
              :main-count="mainEventCount"
            />

            <!-- Demande d'autorisation en attente -->
            <div v-if="isWaiting" class="sp-perm" role="status">
              <div class="sp-perm-top">
                <q-icon name="pending_actions" size="18px" aria-hidden="true" />
                <span class="sp-perm-title">{{ t('pages.sessions.permission.title') }}</span>
                <span v-if="pendingTool" class="sp-perm-tool font-mono">{{
                  pendingTool.name
                }}</span>
              </div>
              <pre
                v-if="pendingCmd"
                class="sp-perm-cmd font-mono"
              ><code>{{ pendingCmd }}</code></pre>
              <p v-else class="sp-perm-generic">
                {{ t('pages.sessions.permission.generic') }}
              </p>
              <div class="sp-perm-actions">
                <span class="sp-perm-hint">
                  {{ t('pages.sessions.permission.hint') }}
                </span>
                <q-btn
                  v-if="pendingTool"
                  flat
                  dense
                  no-caps
                  size="sm"
                  icon="verified_user"
                  :label="t('pages.sessions.permission.allow')"
                  class="sp-perm-btn"
                  @click="openAllow"
                />
                <q-btn
                  flat
                  dense
                  no-caps
                  size="sm"
                  icon="tune"
                  :label="t('pages.sessions.permission.manage')"
                  class="sp-perm-btn"
                  :to="{ name: 'settings' }"
                />
              </div>
            </div>
          </div>

          <!-- Premier chargement -->
          <div v-if="firstLoad" class="sp-skel">
            <q-skeleton type="rect" height="48px" class="q-mb-sm" />
            <q-skeleton type="rect" height="90px" class="q-mb-sm" />
            <q-skeleton type="rect" height="64px" />
          </div>

          <!-- Erreur de lecture -->
          <div v-else-if="error" class="sp-state" role="alert">
            <q-icon name="error_outline" size="28px" color="negative" aria-hidden="true" />
            <p>{{ error }}</p>
            <q-btn flat no-caps :label="t('common.retry')" @click="fetchTranscript(true)" />
          </div>

          <!-- Flux de la piste affichée. Le `tabpanel` est frère de la barre, et
               jamais son ancêtre : la liste des onglets ne peut pas vivre dans le
               panneau qu'elle commande. -->
          <div v-else-if="events.length" role="tabpanel" :aria-labelledby="trackTabId(track)">
            <TranscriptTimeline
              ref="timeline"
              :events="events"
              :silent-hooks="data?.silentHooks"
              :context="data?.context"
              :follow-live="followLive && trackIsLive"
              :show-run-prompt="track !== ''"
              class="sp-timeline"
              :class="{ 'sp-timeline--live': turnRunning }"
            />
          </div>

          <!-- Piste vide. Une session dont le fichier mère a disparu garde ses
               sidecars : le fil principal est alors vide sous une barre pleine, et
               « aucun message » se lirait comme une panne. -->
          <div v-else class="sp-state">
            <q-icon name="hourglass_empty" size="28px" aria-hidden="true" />
            <p v-if="data?.subagents.length && !track">
              {{ t('pages.sessions.emptyMain') }}
            </p>
            <p v-else>{{ t('pages.sessions.emptyTrack') }}</p>
          </div>

          <!-- Sous le fil, et dans le conteneur qui défile : ce qui se passe
               pendant que rien n'arrive se lit là où l'on attend la suite. -->
          <LiveTurnLine
            :active="turnRunning"
            :since="lastEventAt"
            :tool="unresolvedTool?.name"
            class="sp-live"
          />
        </template>
      </section>

      <!--
        La fenêtre de contexte en colonne, comme au rejeu.

        Sur une session en direct, c'est l'information qui bouge : le remplissage
        monte, les catégories gonflent, une compaction la fait retomber. Derrière
        un tiroir, il fallait un geste pour la voir et elle recouvrait le flux ;
        ici elle est simplement là, et le bandeau de rythme au-dessus cesse de la
        répéter.

        Sans coût à côté, contrairement au rejeu : situer une session demande de
        relire tout le parc, ce qui n'a rien à faire dans un écran qu'on regarde
        en continu. Le diagnostic d'une session se lit au rejeu, où l'on arrive
        par la page Projet ou par le Diagnostic.
      -->
      <!-- `&& data` est redondant avec `showContext` pour l'œil, pas pour le
           compilateur : c'est lui qui prouve que `data.context` existe. -->
      <aside v-if="showContext && data" class="sp-aside" :aria-label="t('pages.sessions.aside')">
        <!--
          Le plan de travail, au-dessus du contexte et hors de lui.
          Il n'a rien d'un poste de dépense : c'est du suivi en temps réel — ce
          que la session est en train de faire, et ce qui lui reste. Dans le flux,
          chaque `TaskUpdate` ne dit qu'un mouvement isolé ; ici la suite est
          recollée, et l'état tient en un coup d'œil sans remonter le fil.

          Absent quand la session ne tient pas de liste : une carte vide
          apprendrait moins que rien, et prendrait la place du contexte.
        -->
        <section v-if="tasks.tasks.length" class="surface-card sp-panel sp-panel--tasks">
          <!--
            Le compte suit le plan en cours, jamais le cumul de la session.
            Une session qui a mené un plan à son terme puis en a rouvert un autre
            affichait « 10 / 19 » là où le travail du moment en est à 1 sur 10 :
            le chiffre mélangeait deux histoires et ne répondait à aucune.
          -->
          <h2 class="sp-panel-title">
            {{ t('pages.sessions.tasks') }}
            <span v-if="tasks.currentWave" class="sp-panel-count font-mono">
              {{ tasks.currentWave.done }} / {{ tasks.currentWave.tasks.length }}
            </span>
          </h2>
          <div class="sp-panel-scroll">
            <TaskPanel :progress="tasks" @navigate="(u: string) => void goToTurn(u)" />
          </div>
        </section>

        <!--
          Deux lectures d'un même projet, dans une seule carte.

          Le contexte dit ce que la session a fait entrer dans sa fenêtre ; les
          ressources disent ce que le projet lui met sous la main. On regarde
          l'un *ou* l'autre — jamais les deux à la fois — et une troisième carte
          empilée aurait rogné le contexte pour un inventaire qui ne bouge pas.
        -->
        <section class="surface-card sp-panel" :aria-label="t('pages.sessions.panelAria')">
          <q-tabs v-model="asideTab" dense no-caps align="left" class="sp-tabs">
            <q-tab name="context" :label="t('pages.sessions.tabContext')" />
            <q-tab name="resources" :label="t('pages.sessions.tabResources')" />
          </q-tabs>

          <!-- `keep-alive` : rebasculer ne doit ni redemander l'inventaire au
               serveur, ni faire perdre au contexte la phase et la vue choisies.
               Le panneau défile chez lui — le contexte d'une session bavarde
               fait plusieurs hauteurs d'écran, et la colonne ne doit pas
               emporter la page. -->
          <q-tab-panels v-model="asideTab" keep-alive class="sp-tabpanels">
            <q-tab-panel name="context">
              <!-- `live` : ouvre sur la vue par tour, du plus récent au plus
                   ancien. Devant un direct, le dernier tour est ce qu'on
                   cherche ; le bilan par catégorie reste à un clic. -->
              <ContextPanel
                :context="data.context"
                live
                @navigate="(u: string) => void goToTurn(u)"
              />
            </q-tab-panel>

            <q-tab-panel name="resources">
              <!-- `active` : l'inventaire n'est demandé qu'une fois l'onglet
                   ouvert. Un écran de direct recharge déjà beaucoup ; les
                   ressources, elles, ne changent qu'à l'édition d'un fichier. -->
              <ProjectResourcesPanel
                :slug="selected?.slug ?? ''"
                :active="asideTab === 'resources'"
                :active-rel="openResource?.rel ?? ''"
                :active-source="openSource"
                @open="openResourceNode"
              />
            </q-tab-panel>
          </q-tab-panels>
        </section>
      </aside>
    </div>

    <!-- La lecture d'une ressource, en grand : le panneau fait 376 px, de quoi
         parcourir un arbre, pas de quoi lire un CLAUDE.md. -->
    <ResourceDialog
      :slug="selected?.slug ?? ''"
      :resource="openResource"
      :source="openSource"
      @close="openResource = null"
    />

    <!-- Pré-autorisation : édition de la règle avant l'écriture -->
    <q-dialog v-model="allowDialog">
      <q-card class="sp-allow surface-card">
        <div class="sp-allow-head">
          <div class="section-label">{{ t('pages.sessions.allow.title') }}</div>
          <p class="sp-allow-desc">
            <i18n-t keypath="pages.sessions.allow.desc" tag="span" scope="global">
              <template #allow><span class="font-mono">permissions.allow</span></template>
              <template #file><span class="font-mono">settings.json</span></template>
            </i18n-t>
          </p>
        </div>
        <q-input
          v-model="ruleInput"
          dense
          outlined
          autofocus
          class="sp-allow-input font-mono"
          :label="t('pages.sessions.allow.label')"
          :hint="t('pages.sessions.allow.hint')"
          @keyup.enter="previewAllow"
        />
        <div class="sp-allow-actions">
          <span v-if="allowError" class="sp-allow-err font-mono">{{ allowError }}</span>
          <q-space />
          <q-btn v-close-popup flat no-caps dense :label="t('common.cancel')" />
          <q-btn
            unelevated
            no-caps
            dense
            color="primary"
            text-color="dark"
            :label="t('pages.sessions.allow.preview')"
            :disable="!ruleInput.trim()"
            :loading="preparing"
            @click="previewAllow"
          />
        </div>
      </q-card>
    </q-dialog>

    <ConfirmDiffDialog :proposal="proposal" @applied="onAllowApplied" @close="proposal = null" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { copyToClipboard } from 'quasar';
import { getSessions, type SessionInfo } from 'src/services/system';
import {
  readTranscript,
  type ParsedTranscript,
  type Block,
  type ResourceNode,
} from 'src/services/projects';
import {
  readFile as readClaudeFile,
  propose as proposeWrite,
  type Proposal,
} from 'src/services/claude';
import { onClaudeChange } from 'src/services/events';
import {
  eventsOfTrack,
  trackOfEvent,
  trackTabId,
  MAIN_TRACK,
  type TrackId,
} from 'src/composables/useAgentTracks';
import TranscriptTimeline from 'components/replay/TranscriptTimeline.vue';
import LiveTurnLine from 'components/replay/LiveTurnLine.vue';
import AgentTrackBar from 'components/replay/AgentTrackBar.vue';
import ContextDrawer from 'components/replay/ContextDrawer.vue';
import ContextPanel from 'components/replay/ContextPanel.vue';
import TaskPanel from 'components/replay/TaskPanel.vue';
import { trackTasks, taskIndex, TASK_INDEX } from 'components/replay/taskList';
import { indexRuns, AGENT_RUNS, OPEN_TRACK } from 'components/replay/agentRuns';
import { TRANSCRIPT_SOURCE } from 'components/replay/transcriptSource';
import ProjectResourcesPanel from 'components/resources/ProjectResourcesPanel.vue';
import ResourceDialog from 'components/resources/ResourceDialog.vue';
import type { ResourceSource } from 'components/resources/projectResources';
import ConfirmDiffDialog from 'components/ConfirmDiffDialog.vue';
import EmptyState from 'components/ui/EmptyState.vue';
import { useNotify } from 'src/composables/useNotify';
import { useI18n } from 'vue-i18n';

const { notifyDone, notifyWarn } = useNotify();
const SETTINGS_PATH = 'settings.json';

// Le serveur pousse les changements de ~/.claude (voir services/events). Son
// watcher est au mieux fiable : les événements peuvent être fusionnés ou perdus.
// Ce filet lent rattrape ces trous — et le cas où le flux SSE est indisponible —
// sans revenir au polling de 2 s d'avant.
const FALLBACK_POLL_MS = 30_000;

const { t } = useI18n();

const route = useRoute();
const router = useRouter();

const sessions = ref<SessionInfo[]>([]);
const loaded = ref(false);
const loadingList = ref(false);

const selectedId = ref<string>('');
const data = ref<ParsedTranscript | null>(null);
const firstLoad = ref(false);
const error = ref('');

/**
 * Suivre le bas du flux, ou pas. Un seul état, et il dit la vérité.
 *
 * Il y en avait deux : ce réglage, et un `nearBottom` déduit de la position du
 * défilement. La condition était `autoScroll && nearBottom`, si bien que remonter
 * lire un message rendait le réglage inerte — il continuait d'afficher « activé »
 * pendant que la page ne suivait plus, et le rallumer ne ramenait pas en bas.
 *
 * Remonter, c'est cesser de suivre ; redescendre au bas, c'est se remettre à
 * suivre. Le réglage montre cet état et permet de le forcer.
 */
const autoScroll = ref(true);

/**
 * Suivre le direct : le tour en cours déplie ses outils et son raisonnement, les
 * tours passés rendent les leurs au repli. Distinct de l'auto-défilement — on
 * peut vouloir voir le détail sans que la vue coure après la fin, et l'inverse.
 * Actif par défaut : sur une session en cours, ce qui se passe est justement
 * dans ces replis.
 */
const followLive = ref(true);
const scrollEl = ref<HTMLElement | null>(null);
// Seule la méthode exposée nous intéresse ; `InstanceType` se résoudrait en `any`.
const timeline = ref<{ scrollToEvent: (uuid: string) => Promise<boolean> } | null>(null);

/** À moins de ça du bas, on considère que le lecteur veut suivre la suite. */
const FOLLOW_THRESHOLD_PX = 80;

let fallbackTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
/** Empreinte du transcript affiché, pour ne pas le remplacer par son sosie. */
let etag = '';

const selected = computed(
  () => sessions.value.find((s) => s.sessionId === selectedId.value) ?? null,
);

/**
 * La piste demandée : `''` pour le fil principal, sinon un `agentId`.
 *
 * Brute, non résolue : l'URL peut nommer une piste avant que le transcript qui
 * la contient soit arrivé. `track` fait le tri une fois les runs connus, et
 * retombe sur le fil principal pour un identifiant qui n'existe pas — un lien
 * partagé vers une session ne doit pas ouvrir sur un flux vide.
 */
const wantedTrack = ref<TrackId>(MAIN_TRACK);

const track = computed<TrackId>({
  get: () =>
    data.value?.subagents.some((r) => r.agentId === wantedTrack.value)
      ? wantedTrack.value
      : MAIN_TRACK,
  set: (v) => {
    wantedTrack.value = v;
  },
});

/**
 * Le flux affiché : celui de la piste choisie, et lui seul.
 *
 * Filtré ici plutôt que dans `useTranscriptTurns`, qui est partagé avec la page
 * Replay — là-bas les sous-agents doivent rester en ligne dans le fil, et une
 * notion propre à cette page n'a rien à faire dans un pli commun. Ici l'effet
 * est nul par construction : les autres lecteurs du transcript (`tasks`,
 * `pendingTool`) passent par `data.value?.events`, et le contexte est calculé
 * côté serveur hors sous-agents.
 */
const events = computed(() => eventsOfTrack(data.value?.events ?? [], track.value));

/** Où se trouve chaque événement — pour sauter à un tour d'une autre piste. */
const trackByUuid = computed(() => trackOfEvent(data.value?.events ?? []));

/** Ce qui reste au fil principal une fois les agents sortis, pour son onglet. */
const mainEventCount = computed(() => data.value?.events.filter((e) => !e.agentId).length ?? 0);

/** Le run affiché, quand ce n'est pas le fil principal. */
const currentRun = computed(
  () => data.value?.subagents.find((r) => r.agentId === track.value) ?? null,
);

/**
 * La piste affichée peut-elle encore grandir ?
 *
 * Le fil principal, oui, tant que la session vit ; un run, seulement tant que
 * rien n'atteste sa fin. C'est ce qui décide du défilement à l'arrivée et du
 * dépliage du dernier tour : suivre le direct d'un run terminé n'aurait aucun
 * sens.
 */
const trackIsLive = computed(() => {
  const run = currentRun.value;
  return !run || run.status === 'running' || run.status === 'unknown';
});

// Which transcript the timeline shows, for the tool calls that need to fetch a
// spilled output. `null` while no session is selected — the panes degrade to the
// preview the transcript carries.
provide(
  TRANSCRIPT_SOURCE,
  computed(() => {
    const s = selected.value;
    return s?.slug && s.sessionId ? { slug: s.slug, sessionId: s.sessionId } : null;
  }),
);

/**
 * Ce que la carte d'un appel `Agent` peut dire du run qu'elle a lancé.
 *
 * Elle est montée au fond de la timeline, à quatre étages d'ici : on fournit
 * plutôt que de faire descendre une prop de composant en composant. La liste est
 * indexée sur l'appel, seule clé que la carte connaisse d'elle-même.
 */
provide(
  AGENT_RUNS,
  computed(() => indexRuns(data.value?.events ?? [], data.value?.subagents ?? [])),
);

/** Depuis la carte d'un appel, sauter dans la piste de son agent. */
provide(OPEN_TRACK, (agentId: string) => {
  track.value = agentId;
});

const streamState = computed<'live' | 'wait' | 'idle'>(() => {
  const s = selected.value?.status;
  if (s === 'busy') return 'live';
  if (s === 'waiting') return 'wait';
  return 'idle';
});
const badgeLabel = computed(() => t(`pages.sessions.badge.${streamState.value}`));

/**
 * Classes du point d'état : vert respirant (busy), ambre respirant (waiting),
 * gris fixe (idle).
 *
 * `--live` porte l'animation, la classe de couleur porte la teinte. Les deux
 * états animés le sont pour des raisons différentes : `busy` travaille, et
 * `waiting` réclame une action — laisser ce dernier figé serait le pire cas,
 * puisque c'est le seul qui attend quelque chose de toi.
 */
function dotClasses(s: SessionInfo): Record<string, boolean> {
  return {
    'status-dot--pulse': s.status === 'busy',
    'sp-dot-wait': s.status === 'waiting',
    'status-dot--live': s.status === 'busy' || s.status === 'waiting',
  };
}
function sessionLabel(s: SessionInfo): string {
  return s.name || s.sessionId.slice(0, 8) || t('pages.sessions.fallbackName');
}

/**
 * Le même nom, sans la queue d'identifiant.
 *
 * Claude Code nomme ses sessions `<projet>-<début d'identifiant>`. Dans une
 * colonne déjà rangée par projet, ce suffixe est du bruit hexadécimal qui pousse
 * le nom utile hors du cadre. On ne le coupe que s'il en reste quelque chose :
 * une session qui n'a que son identifiant pour nom garde son identifiant.
 */
function shortLabel(s: SessionInfo): string {
  const full = sessionLabel(s);
  const cut = full.replace(/[-_][0-9a-f]{6,}$/i, '');
  return cut || full;
}

/**
 * Trois colonnes, ou deux et un tiroir.
 *
 * Le rejeu peut se permettre sa colonne de contexte en permanence : il n'a rien
 * à gauche. Ici la liste des sessions occupe déjà 300 px, et sous cette largeur
 * la conversation tomberait à moins de 600 px — des sorties d'outil illisibles.
 * Le tiroir reste donc le repli, pas un vestige : c'est la bonne réponse quand
 * la place manque.
 *
 * Le seuil est celui du rejeu (1 280 px), pour que les deux écrans changent de
 * forme au même endroit.
 *
 * `matchMedia` plutôt que `$q.screen.width` : ce dernier vaut zéro tant qu'aucun
 * redimensionnement n'a eu lieu, si bien qu'un écran large ouvert directement sur
 * cette page se voyait servir le tiroir. Ici la valeur est juste dès le montage,
 * et l'écouteur suit les redimensionnements sans rechargement.
 */
const CONTEXT_COLUMN_MIN_WIDTH = 1280;
const contextColumn = ref(false);
let wideQuery: MediaQueryList | null = null;

function onWideChange(e: MediaQueryListEvent | MediaQueryList): void {
  contextColumn.value = e.matches;
}

/**
 * La colonne n'est là que quand elle a quelque chose à dire.
 *
 * Sans transcript — aucune session choisie, ou introuvable — la garder ouverte
 * laisserait une colonne vide de 380 px prise sur la conversation. La classe de
 * grille suit la même condition, sinon la piste resterait réservée pour rien.
 */
const showContext = computed(() =>
  Boolean(contextColumn.value && selected.value?.slug && data.value),
);

/**
 * Le plan de travail rejoué depuis les appels `TaskCreate` / `TaskUpdate`.
 *
 * Recalculé à chaque relecture du transcript — c'est-à-dire à chaque fois que le
 * watcher signale une ligne de plus — donc le panneau suit le direct sans rien
 * demander de plus au serveur. Le parcours est linéaire sur des événements déjà
 * en mémoire.
 */
const tasks = computed(() => trackTasks(data.value?.events ?? []));

// Le sujet de chaque tâche, pour les jalons du flux : un `TaskUpdate` ne porte
// qu'un numéro, et « #3 » n'apprend rien à qui lit.
provide(
  TASK_INDEX,
  computed(() => taskIndex(tasks.value)),
);

/**
 * La vue tenue par la carte du bas — le contexte, ou l'inventaire du projet.
 *
 * Elle ouvre sur le contexte : c'est ce qui bouge pendant qu'on regarde, alors
 * que les ressources ne changent qu'à l'édition d'un fichier.
 */
const asideTab = ref<'context' | 'resources'>('context');

/** La ressource lue dans le dialogue ; `null` le referme. */
const openResource = ref<ResourceNode | null>(null);
const openSource = ref<ResourceSource>('resource');

function openResourceNode(node: ResourceNode, source: ResourceSource): void {
  openSource.value = source;
  openResource.value = node;
}

// Changer de projet rend la ressource ouverte étrangère à ce qu'on regarde : le
// dialogue lirait un fichier d'ailleurs, sous un arbre qui ne le contient plus.
watch(
  () => selected.value?.slug,
  () => {
    openResource.value = null;
  },
);

/**
 * Fixe la hauteur de la page à « viewport moins l'en-tête ». Quasar passe
 * l'offset exact (hauteur mesurée du header, bordure comprise), ce qui évite
 * tout nombre magique et toute scrollbar fenêtre — le flux scrolle en interne.
 */
function pageStyleFn(offset: number, height: number): Record<string, string> {
  return { height: `${height - offset}px` };
}

// ── Demande de permission en attente ───────────────────────────────────────────
// `waiting` = la session est bloquée sur un prompt d'autorisation (outil, accès
// dossier…). On affiche toujours le bandeau dans ce cas ; on détaille l'action
// seulement quand elle est identifiable dans le transcript.
const isWaiting = computed(() => selected.value?.status === 'waiting');
// Le dernier `tool_use` sans résultat = l'action demandée, si elle a déjà été
// écrite au transcript (cas des permissions d'outil). Absent pour un accès
// dossier, demandé avant tout appel d'outil.
/**
 * Le dernier `tool_use` dont le résultat n'est pas encore écrit.
 *
 * Deux lectures d'un même fait, selon l'état de la session : sous `waiting`
 * c'est l'action qu'on vous demande d'autoriser, sinon c'est l'outil qui tourne
 * en ce moment.
 */
const unresolvedTool = computed<Block | null>(() => {
  const evs = data.value?.events ?? [];
  for (let i = evs.length - 1; i >= 0; i--) {
    const ev = evs[i]!;
    if (ev.kind !== 'assistant') continue;
    for (let j = ev.blocks.length - 1; j >= 0; j--) {
      const b = ev.blocks[j]!;
      if (b.kind === 'tool_use' && !b.result) return b;
    }
  }
  return null;
});
const pendingTool = computed<Block | null>(() => (isWaiting.value ? unresolvedTool.value : null));

/**
 * La session produit-elle quelque chose ?
 *
 * Le statut du CLI est le seul signal qui sépare « en train de travailler » de
 * « vous attend » : le transcript, lui, se tait dans les deux cas. Mesuré, il
 * passe par `idle` au repos, `busy` en tour, `shell` pendant une commande, et il
 * bascule à l'instant même. Tout ce qui n'est ni le repos ni une demande
 * d'autorisation — qui a son propre bandeau — veut dire qu'il se passe quelque
 * chose, y compris un état qu'on ne connaîtrait pas encore.
 */
const turnRunning = computed(() => {
  const s = selected.value?.status;
  return !!s && s !== 'idle' && s !== 'waiting';
});

/**
 * L'instant du dernier événement reçu, sous-agents compris.
 *
 * Le maximum et non le dernier du tableau : les tours d'un sous-agent sont
 * insérés à l'endroit où il a été lancé, donc au milieu du flux. Sur une session
 * qui explore, ce sont eux les plus récents.
 */
const lastEventAt = computed<number | null>(() => {
  const evs = data.value?.events;
  if (!evs?.length) return null;
  let last = 0;
  for (const e of evs) if (e.timestamp > last) last = e.timestamp;
  return last || null;
});
const pendingCmd = computed(() => {
  const inp = pendingTool.value?.input as Record<string, unknown> | undefined;
  const v = inp?.command ?? inp?.file_path ?? inp?.path ?? inp?.url;
  return typeof v === 'string' ? v : '';
});
/** Chemin Windows lisible (antislashs). */
function winPath(cwd: string): string {
  return cwd ? cwd.replace(/\//g, '\\') : '';
}

/**
 * Copier le chemin du projet, en présentation Windows.
 *
 * C'est ce qu'on colle dans l'explorateur ou dans un terminal : les antislashs
 * sont donc ce qu'il faut, pas la forme interne à slashs.
 *
 * L'icône passe à la coche un instant en plus de la notification — la confirmer
 * là où le geste a eu lieu évite de chercher des yeux ce qui a réagi.
 */
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

async function copyCwd(cwd: string): Promise<void> {
  const path = winPath(cwd);
  if (!path) return;
  try {
    await copyToClipboard(path);
    copied.value = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 1600);
    notifyDone(t('pages.sessions.pathCopied'), path);
  } catch {
    notifyWarn(t('pages.sessions.copyFailed'));
  }
}

// ── Le parc, rangé par projet ────────────────────────────────────────────────
//
// La liste plate marchait tant qu'on avait deux sessions. Passé cinq, elle
// devient une colonne de chemins presque identiques dont seule la fin diffère,
// et retrouver « celle de tel projet » demande de lire chaque ligne. Le
// regroupement remet le projet au premier plan et rend la répétition muette :
// le chemin n'est plus écrit qu'une fois, en tête de groupe.

/** Au-delà de tant de sessions, la colonne mérite un champ de filtre. */
const FILTER_FROM = 5;

const listFilter = ref('');
/** Groupes repliés, par clé. Tout est déplié par défaut. */
const collapsed = ref(new Set<string>());

interface SessionGroup {
  key: string;
  /** Nom du projet — même dérivation que la liste des projets : le dernier segment. */
  name: string;
  /** Sessions en activité (busy ou en attente) : ce qui allume le point du groupe. */
  live: number;
  sessions: SessionInfo[];
}

/** Nom du projet à partir de son dossier de travail (dernier segment). */
function projectName(cwd: string): string {
  const clean = (cwd || '').replace(/[\\/]+$/, '');
  const seg = clean.split(/[\\/]/).pop();
  return seg || clean || t('pages.sessions.noProject');
}

/**
 * Les sessions rangées par projet, dans l'ordre où le serveur les donne.
 *
 * Cet ordre porte déjà une intention — les sessions actives en tête — et la
 * reprendre telle quelle fait remonter du même coup les projets qui travaillent.
 * Un tri par nom la remplacerait par un ordre stable mais aveugle.
 */
const groups = computed<SessionGroup[]>(() => {
  const q = listFilter.value?.trim().toLowerCase() ?? '';
  const byKey = new Map<string, SessionGroup>();

  for (const s of sessions.value) {
    const name = projectName(s.cwd);
    if (
      q &&
      !name.toLowerCase().includes(q) &&
      !winPath(s.cwd).toLowerCase().includes(q) &&
      !sessionLabel(s).toLowerCase().includes(q)
    ) {
      continue;
    }
    // La clé est le chemin, pas le slug : une session dont le transcript est
    // introuvable a un slug vide, et toutes tomberaient dans le même groupe.
    const key = s.cwd || s.slug || s.sessionId;
    let g = byKey.get(key);
    if (!g) {
      g = { key, name, live: 0, sessions: [] };
      byKey.set(key, g);
    }
    if (s.status === 'busy' || s.status === 'waiting') g.live++;
    g.sessions.push(s);
  }

  return [...byKey.values()];
});

function toggleGroup(key: string): void {
  // Une nouvelle `Set` plutôt qu'une mutation : `ref` ne suit pas un `add`.
  const next = new Set(collapsed.value);
  if (!next.delete(key)) next.add(key);
  collapsed.value = next;
}

/**
 * Même garde que pour le transcript, pour la même raison.
 *
 * Le BFF notifie désormais chaque session séparément — trois sessions actives,
 * ce sont trois notifications en rafale pour une liste qui est un état unique.
 * Une seule lecture les couvre toutes ; les autres ne feraient que se doubler.
 */
let loadingSessions = false;
let sessionsQueued = false;

async function loadSessions(): Promise<void> {
  if (loadingSessions) {
    sessionsQueued = true;
    return;
  }
  loadingSessions = true;
  try {
    do {
      sessionsQueued = false;
      await loadSessionsOnce();
    } while (sessionsQueued);
  } finally {
    loadingSessions = false;
  }
}

async function loadSessionsOnce(): Promise<void> {
  loadingList.value = true;
  try {
    const { sessions: list } = await getSessions();
    sessions.value = list;
    // Sélection retirée si la session a disparu ; sinon on préserve le choix.
    if (selectedId.value && !list.some((s) => s.sessionId === selectedId.value)) {
      selectedId.value = '';
    }
    if (!selectedId.value && list.length) {
      // Préselection : la session de l'URL, sinon la première (busy en tête).
      const wanted = String(route.query.sel ?? '');
      // La piste avant la session : le `watch(selectedId)` la remettrait à zéro,
      // et un lien partagé vers la piste d'un agent ouvrirait sur le fil principal.
      const agent = String(route.query.agent ?? '');
      selectedId.value = list.find((s) => s.sessionId === wanted)?.sessionId ?? list[0]!.sessionId;
      wantedTrack.value = agent;
    }
  } catch {
    /* le point d'état de la barre système signale déjà une coupure BFF */
  } finally {
    loadingList.value = false;
    loaded.value = true;
  }
}

/**
 * Une lecture en vol, et au plus une en attente.
 *
 * Le BFF reparse le transcript entier à chaque appel. Sur une session vivante
 * les notifications arrivent plus vite que le parse ne rend la main : sans cette
 * garde, chaque notification lançait sa propre lecture complète, toutes
 * concurrentes, et les premières étaient déjà périmées en arrivant — on ajoutait
 * de la charge au serveur exactement quand il en avait le moins les moyens.
 *
 * Rien n'ordonnait non plus les réponses : une lecture lente arrivant après une
 * rapide réinstallait un état plus ancien *et* son empreinte, si bien que le
 * rafraîchissement suivant croyait voir un changement là où il n'y en avait pas.
 *
 * Une seule relance en attente suffit : le transcript n'est pas un journal
 * d'ordres, c'est un état. La dernière lecture porte tout ce que les
 * notifications ignorées annonçaient.
 */
let reading = false;
/** La relance en attente, s'il y en a une ; la valeur est son `showLoader`. */
let queued: boolean | null = null;

async function fetchTranscript(showLoader = false): Promise<void> {
  if (reading) {
    // Un `showLoader` demandé pendant l'attente ne se perd pas : il vient d'un
    // geste — changement de session, bouton « Réessayer » — et cet écran-là doit
    // montrer qu'il charge.
    queued = (queued ?? false) || showLoader;
    return;
  }

  reading = true;
  try {
    let loader = showLoader;
    for (;;) {
      await readTranscriptOnce(loader);
      if (queued === null) return;
      loader = queued;
      queued = null;
    }
  } finally {
    reading = false;
  }
}

async function readTranscriptOnce(showLoader: boolean): Promise<void> {
  const s = selected.value;
  if (!s || !s.slug || !s.sessionId) return;
  if (showLoader) firstLoad.value = true;
  try {
    const read = await readTranscript(s.slug, s.sessionId);
    // La session a pu changer pendant la requête → on ignore la réponse tardive.
    if (s.sessionId !== selectedId.value) return;
    error.value = '';
    // Même empreinte : le fichier n'a pas bougé. Le poll de repli n'a alors aucune
    // raison de faire reconstruire la timeline. Une empreinte vide n'affirme rien.
    if (read.etag && read.etag === etag && data.value) return;
    etag = read.etag;
    data.value = read.transcript;
    // Rendre le flux *avant* de coller au bas : tant que `firstLoad` est vrai,
    // seule la silhouette de chargement occupe le conteneur, et la coller au bas
    // ne fait rien — la timeline monte ensuite et pousse tout hors de vue. C'est
    // ce qui laissait le stream en haut à l'arrivée, réglage allumé.
    firstLoad.value = false;
    if (autoScroll.value) await scrollToBottom();
  } catch (e) {
    // Sur un poll silencieux, ne pas écraser un flux déjà affiché par une
    // erreur transitoire ; ne la montrer que si l'on n'a encore rien.
    if (showLoader || !data.value)
      error.value = e instanceof Error ? e.message : t('pages.sessions.error');
  } finally {
    firstLoad.value = false;
  }
}

function select(id: string): void {
  if (id === selectedId.value) return;
  selectedId.value = id;
}

function onScroll(): void {
  const el = scrollEl.value;
  if (!el) return;
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX;
}

/**
 * Sauter au tour qu'un lien du panneau de contexte désigne, où qu'il soit.
 *
 * Le défilement qui s'ensuit fait passer `onScroll`, qui coupe l'auto-défilement
 * de lui-même — et c'est juste : sauter à un tour ancien, c'est cesser de suivre
 * la fin. Rien à forcer là-dessus.
 *
 * En revanche la cible peut ne pas être à l'écran : les liens du contexte et du
 * plan de travail visent tous le fil principal, et depuis la piste d'un agent
 * `scrollToEvent` rendrait `false` sans que rien ne bouge. On rebascule donc sur
 * la piste qui la contient avant de sauter — le lecteur a demandé cet endroit-là,
 * pas cette vue-là.
 */
async function goToTurn(uuid: string): Promise<void> {
  const target = trackByUuid.value.get(uuid);
  if (target !== undefined && target !== track.value) {
    track.value = target;
    await nextTick();
  }
  await timeline.value?.scrollToEvent(uuid);
}

/**
 * L'utilisateur a manœuvré le réglage lui-même — `q-toggle` n'émet que dans ce
 * cas, jamais quand `onScroll` écrit la valeur. Rallumer le suivi, c'est demander
 * à revenir en bas tout de suite, sans attendre la prochaine ligne.
 */
function onFollowToggle(follow: boolean): void {
  if (follow) void scrollToBottom();
}

/**
 * Coller le flux au bas — et l'y garder pendant que le contenu grandit.
 *
 * Un `nextTick` ne suffit pas : la timeline monte à sa hauteur brute, puis
 * grandit encore pendant plusieurs images — le markdown se met en forme, la
 * coloration syntaxique s'applique, les captures arrivent, un diagramme se
 * dessine. Coller une seule fois laisse le flux à mi-hauteur, d'autant plus haut
 * que la session est riche.
 *
 * D'où l'observateur : tant que le suivi est demandé, chaque changement de
 * hauteur ramène au bas. Il ne peut pas contrarier le lecteur — remonter éteint
 * `autoScroll` via `onScroll`, et l'observateur se tait aussitôt.
 */
let pinToBottom: ResizeObserver | null = null;

async function scrollToBottom(): Promise<void> {
  await nextTick();
  const el = scrollEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;

  pinToBottom?.disconnect();
  // La timeline est remplacée à chaque changement de session : on ré-observe
  // l'élément courant plutôt que d'en garder un qui n'est plus dans le document.
  const content = el.querySelector('.sp-timeline');
  if (!content) return;
  pinToBottom = new ResizeObserver(() => {
    // Une cible détachée mesure zéro : la suivre emporterait le flux en haut.
    // C'est `timelineShown` qui reposera le collage sur le nœud suivant.
    if (!content.isConnected) return;
    if (autoScroll.value) el.scrollTop = el.scrollHeight;
  });
  pinToBottom.observe(content);
}

/**
 * Reposer le collage quand la timeline revient.
 *
 * Un rechargement affiché la démonte — `firstLoad` rend la silhouette à sa
 * place — et la remonte neuve ensuite. L'observateur, lui, tenait l'ancien
 * nœud : détaché, il ne mesure plus rien, et le nœud qui le remplace n'est pas
 * le sien. Le flux restait donc en haut, réglage allumé.
 *
 * Le cas ne demandait rien avant les phases parce qu'un second chargement
 * refaisait la pose au passage. Il ne la refait plus dès que l'empreinte du
 * fichier n'a pas bougé — un aller-retour sur une session inchangée sort par le
 * raccourci d'`etag`, sans jamais repasser par `scrollToBottom`.
 */
const timelineShown = computed(() => !firstLoad.value && !error.value && events.value.length > 0);

watch(timelineShown, (shown) => {
  if (shown && autoScroll.value) void scrollToBottom();
});

// ── Pré-autorisation (écriture d'une règle allow dans settings.json) ────────────
const allowDialog = ref(false);
const ruleInput = ref('');
const allowError = ref('');
const preparing = ref(false);
const proposal = ref<Proposal | null>(null);

/** Motif de règle proposé à partir de l'action en attente (éditable ensuite). */
function suggestRule(b: Block): string {
  const name = b.name ?? 'Bash';
  const inp = (b.input ?? {}) as Record<string, unknown>;
  if (name === 'Bash' || name === 'PowerShell') {
    const cmd = typeof inp.command === 'string' ? inp.command : '';
    const tokens = cmd.trim().split(/\s+/).filter(Boolean);
    const base: string[] = [];
    for (const t of tokens.slice(0, 2)) {
      if (t.startsWith('-')) break;
      base.push(t);
    }
    const prefix = base.join(' ') || tokens[0] || '';
    return prefix ? `${name}(${prefix}:*)` : name;
  }
  return name;
}

function openAllow(): void {
  if (!pendingTool.value) return;
  ruleInput.value = suggestRule(pendingTool.value);
  allowError.value = '';
  allowDialog.value = true;
}

async function previewAllow(): Promise<void> {
  const rule = ruleInput.value.trim();
  if (!rule) return;
  preparing.value = true;
  allowError.value = '';
  try {
    // On repart du contenu disque (absent → objet vide) pour un diff minimal.
    let base: Record<string, unknown> = {};
    try {
      const { content } = await readClaudeFile(SETTINGS_PATH);
      const parsed: unknown = JSON.parse(content || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      /* settings.json absent ou illisible → nouvel objet */
    }
    const perms =
      base.permissions && typeof base.permissions === 'object' && !Array.isArray(base.permissions)
        ? (base.permissions as Record<string, unknown>)
        : {};
    const allow = Array.isArray(perms.allow) ? [...(perms.allow as unknown[])] : [];
    if (allow.includes(rule)) {
      allowError.value = t('pages.sessions.allow.duplicate');
      return;
    }
    allow.push(rule);
    perms.allow = allow;
    base.permissions = perms;
    proposal.value = await proposeWrite(SETTINGS_PATH, JSON.stringify(base, null, 2) + '\n');
    allowDialog.value = false;
  } catch (e) {
    allowError.value = e instanceof Error ? e.message : t('common.proposeError');
  } finally {
    preparing.value = false;
  }
}

function onAllowApplied(): void {
  proposal.value = null;
  notifyDone(t('pages.sessions.allow.added'), t('pages.sessions.allow.addedNote'));
}

/**
 * Refléter la sélection dans l'URL, sans rien y perdre.
 *
 * Un seul écrivain pour deux paramètres : deux `watch` appelant `replace` chacun
 * de son côté partiraient du même `route.query` figé, et le dernier effacerait
 * l'écriture du premier — la session ou la piste, au hasard de l'ordre. On
 * repart donc de la query courante, ce qui laisse aussi survivre un paramètre
 * étranger.
 */
function syncQuery(): void {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(route.query)) if (typeof v === 'string') q[k] = v;
  if (selectedId.value) q.sel = selectedId.value;
  else delete q.sel;
  if (wantedTrack.value) q.agent = wantedTrack.value;
  else delete q.agent;
  void router.replace({ query: q });
}

watch([selectedId, wantedTrack], syncQuery);

// Changement de session : on repart d'un flux vierge et on charge aussitôt le
// transcript. L'URL suit par `syncQuery`.
watch(selectedId, (id, previous) => {
  data.value = null;
  etag = '';
  error.value = '';
  // La piste d'une session n'a aucun sens dans la suivante — mais seulement s'il
  // y avait une session avant. À la présélection il n'y a rien à oublier, et
  // effacer ici écraserait la piste que l'URL vient de demander : les watchers
  // s'exécutent après l'affectation qui les déclenche.
  if (previous) wantedTrack.value = MAIN_TRACK;
  // Ouvrir une session, c'est vouloir en voir la fin : on repart en suivant, même
  // si l'on avait cessé de suivre celle d'avant en remontant dans son flux.
  autoScroll.value = true;
  // Un groupe replié ne doit pas cacher la session qu'on regarde — le cas se
  // produit à la présélection au chargement, ou en revenant par l'URL.
  const key = selected.value?.cwd;
  if (key && collapsed.value.has(key)) toggleGroup(key);
  if (id) void fetchTranscript(true);
});

/**
 * Changer de piste, c'est changer de sujet : la position d'avant ne désigne plus
 * rien, et la mémoriser ne vaudrait rien sur un flux qui grandit — le décalage
 * gardé serait faux dès la ligne suivante.
 *
 * On ouvre donc là où la piste a quelque chose à dire. Vivante, en bas : c'est
 * la suite qu'on attend, comme à l'ouverture d'une session. Terminée, en haut :
 * un run se lit du début — et l'auto-défilement est coupé *avant* le rendu, sans
 * quoi `pinToBottom` emporterait la vue au bas dès la nouvelle hauteur connue.
 */
watch(track, async () => {
  if (trackIsLive.value) {
    autoScroll.value = true;
    await scrollToBottom();
    return;
  }
  autoScroll.value = false;
  await nextTick();
  if (scrollEl.value) scrollEl.value.scrollTop = 0;
});

onMounted(async () => {
  wideQuery = window.matchMedia(`(min-width: ${CONTEXT_COLUMN_MIN_WIDTH}px)`);
  onWideChange(wideQuery);
  wideQuery.addEventListener('change', onWideChange);

  await loadSessions();
  if (selectedId.value) void fetchTranscript(true);

  unsubscribe = onClaudeChange((ev) => {
    if (ev.kind === 'sessions') {
      void loadSessions();
      return;
    }
    // Un transcript a grandi : ne recharger que si c'est celui qu'on regarde.
    if (ev.id === selectedId.value) void fetchTranscript(false);
  });

  fallbackTimer = setInterval(() => {
    void loadSessions();
    void fetchTranscript(false);
  }, FALLBACK_POLL_MS);
});

onUnmounted(() => {
  wideQuery?.removeEventListener('change', onWideChange);
  unsubscribe?.();
  if (fallbackTimer) clearInterval(fallbackTimer);
  if (copiedTimer) clearTimeout(copiedTimer);
  pinToBottom?.disconnect();
});
</script>

<style scoped lang="scss">
.sp {
  padding: var(--space-md) var(--space-lg) var(--space-lg);
  width: 100%;
  // La hauteur vient du min-height que Quasar pose sur la q-page (viewport moins
  // l'en-tête, offset exact) : on remplit en flex et on scrolle en interne, sans
  // créer de scrollbar fenêtre.
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sp-split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: var(--space-lg);
}
/* La troisième colonne n'existe que quand le contexte y vit — la classe suit le
   même seuil que le `v-if`, pour qu'aucune colonne ne reste vide. */
.sp-split--aside {
  grid-template-columns: 300px minmax(0, 1fr) 380px;
}

/* La colonne de contexte. Elle défile chez elle, comme au rejeu. */
.sp-aside {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: 2px;
}
.sp-panel {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
/* Le suivi s'en tient à sa taille et laisse le reste au contexte, dont la
   hauteur, elle, n'a pas de limite ; passé une dizaine de tâches il défile chez
   lui plutôt que de repousser le contexte hors de la colonne. */
.sp-panel--tasks {
  flex: 0 1 auto;
  max-height: 35%;
}
.sp-panel-title {
  margin: 0;
  padding: var(--space-xs) var(--space-md) 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  font-size: var(--fs-sm);
  /* Quasar impose aux `h2` un `line-height` de 60 px. Sans cette ligne, le
     titre pesait 72 px pour un texte de 12 — l'en-tête occupait plus de place
     que les deux premières tâches qu'il annonce. */
  line-height: 1.4;
  font-weight: 600;
  color: var(--text);
}
.sp-panel-count {
  font-size: var(--fs-xs);
  font-weight: 400;
  color: var(--dim);
}
/*
  Les onglets tiennent la place d'un titre de carte : même rembourrage à gauche,
  et le trait sous eux fait la séparation que la carte attendait de son en-tête.
*/
.sp-tabs {
  flex: 0 0 auto;
  padding: 0 var(--space-sm);
  border-bottom: 1px solid var(--line);
}
/* Le conteneur de Quasar pose son propre fond et un rembourrage de 16 px par
   panneau : la carte les fournit déjà, et c'est le panneau qui doit défiler —
   son parent, lui, masque tout ce qui dépasse. */
.sp-tabpanels {
  flex: 1 1 auto;
  min-height: 0;
  background: transparent;
}
.sp-tabpanels :deep(.q-tab-panel) {
  padding: 0;
  overflow-y: auto;
}
.sp-panel-scroll {
  overflow-y: auto;
  min-height: 0;
}

/* ── Liste ─────────────────────────────────────────────────────────────────── */
.sp-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.sp-list-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}
.sp-list-head h2 {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text);
}
.sp-count {
  font-size: var(--fs-sm);
  color: var(--dim);
  margin-left: auto;
}
.sp-filter {
  padding: var(--space-sm) var(--space-sm) 0;
}

/* ── Groupes de projet ─────────────────────────────────────────────────────── */
.sp-groups {
  list-style: none;
  margin: 0;
  padding: var(--space-xs);
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.sp-group-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-fast) ease;
}
.sp-group-head:hover {
  background: var(--hover-overlay);
}
.sp-group-caret {
  color: var(--faint);
  flex: 0 0 auto;
}
.sp-group-icon {
  color: var(--brand);
  flex: 0 0 auto;
}
.sp-group-name {
  min-width: 0;
  flex: 1;
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-group-dot {
  flex: 0 0 auto;
}

.sp-items {
  list-style: none;
  margin: 0;
  /* Le décroché aligne les sessions sous le nom du projet, pas sous son chevron :
     l'indentation dit l'appartenance sans qu'aucun trait ne soit nécessaire. */
  padding: 0 0 0 var(--space-md);
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-left: 1px solid var(--line);
  margin-left: calc(var(--space-sm) + 8px);
}
.sp-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    background var(--motion-fast) ease,
    border-color var(--motion-fast) ease;
}
.sp-item:hover {
  background: var(--hover-overlay);
}
.sp-item--active {
  background: var(--brand-soft);
  border-color: var(--brand-line);
}
/* Une seule ligne par session : le nom, sans sa queue d'identifiant. Le projet
   est déjà dit par le groupe, et l'identifiant complet vit dans l'URL. */
.sp-item-name {
  min-width: 0;
  flex: 1;
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-item-status {
  font-size: var(--fs-2xs);
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex: 0 0 auto;
}
.sp-item-status--on {
  color: var(--pulse);
}

/* ── Flux ──────────────────────────────────────────────────────────────────── */
.sp-stream {
  min-height: 0;
  overflow-y: auto;
  position: relative;
}
/* En-tête + bandeau épinglés ensemble : restent visibles quand l'auto-défilement
   colle le flux au bas. */
.sp-stream-top {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--bg);
  padding-bottom: var(--space-md);
}
.sp-stream-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  padding: var(--space-sm) var(--space-xs) var(--space-md);
  border-bottom: 1px solid var(--line);
}
.sp-stream-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.sp-stream-name {
  font-size: var(--fs-md);
  font-weight: 600;
}
.sp-stream-handle {
  color: var(--dim);
  font-size: var(--fs-xs);
}
.sp-badge {
  font-size: var(--fs-2xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 2px var(--space-xs);
  border-radius: var(--radius-xs);
}
.sp-badge--live {
  color: var(--pulse);
  background: rgba(110, 231, 168, 0.14);
}
.sp-badge--idle {
  color: var(--dim);
  background: var(--surface-2);
}
.sp-badge--wait {
  color: var(--warn);
  background: rgba(224, 163, 62, 0.16);
}
.sp-dot-wait {
  background: var(--warn);
  box-shadow: 0 0 6px var(--warn);
  // Redéfinit la teinte du halo respirant posé par `.status-dot--live` : sans
  // ça, une session en attente respirerait en vert alors que son disque est
  // ambre. C'est précisément pour ce cas que `--dot-glow` existe.
  --dot-glow: var(--warn);
}
.sp-item-status--wait {
  color: var(--warn);
}

/* ── Bandeau « en attente d'autorisation » ─────────────────────────────────────── */
.sp-perm {
  margin: 0 var(--space-xs) var(--space-md);
  padding: var(--space-md);
  border: 1px solid rgba(224, 163, 62, 0.4);
  border-left: 3px solid var(--warn);
  border-radius: var(--radius-sm);
  background: rgba(224, 163, 62, 0.08);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.sp-perm-top {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--warn);
}
.sp-perm-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
}
.sp-perm-tool {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--warn);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sp-perm-cmd {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  overflow-x: auto;
  font-size: var(--fs-xs);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
}
.sp-perm-generic {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--muted);
  line-height: 1.5;
}
.sp-perm-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}
.sp-perm-hint {
  flex: 1;
  min-width: 200px;
  font-size: var(--fs-xs);
  color: var(--muted);
  line-height: 1.4;
}
.sp-perm-btn {
  flex: 0 0 auto;
}

/* ── Dialogue de pré-autorisation ──────────────────────────────────────────────── */
.sp-allow {
  width: 520px;
  max-width: 92vw;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.sp-allow-desc {
  margin: var(--space-xs) 0 0;
  font-size: var(--fs-sm);
  color: var(--muted);
  line-height: 1.5;
}
.sp-allow-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.sp-allow-err {
  color: var(--danger);
  font-size: var(--fs-xs);
}
/* Le nom du projet, pas son chemin : longueur bornée, donc des réglages qui
   restent à la même place d'une session à l'autre. */
.sp-stream-project {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--fs-xs);
  font-family: inherit;
  color: var(--dim);
  padding: 2px var(--space-xs);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition:
    background var(--motion-fast) ease,
    color var(--motion-fast) ease;

  &:hover,
  &:focus-visible {
    background: var(--hover-overlay);
    color: var(--text);
  }

  > .q-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
}
.sp-toggle {
  color: var(--muted);
}
.sp-timeline {
  padding: 0 var(--space-xs) var(--space-xl);
}
/*
  La respiration de fin de flux n'a plus lieu d'être quand la ligne d'activité
  la suit : elle creusait alors un trou entre le dernier tour et ce qui annonce
  la suite, là où les deux doivent se lire ensemble.
*/
.sp-timeline--live {
  padding-bottom: var(--space-sm);
}
.sp-skel {
  padding: var(--space-md) var(--space-xs);
}

/* ── États ─────────────────────────────────────────────────────────────────── */
.sp-empty,
.sp-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-xl);
  color: var(--muted);
  text-align: center;
}
.sp-empty p,
.sp-state p {
  margin: 0;
}
.sp-state-sub {
  font-size: var(--fs-xs);
  color: var(--dim);
  word-break: break-all;
}

@media (max-width: 720px) {
  .sp-split,
  .sp-split--aside {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
}
</style>
