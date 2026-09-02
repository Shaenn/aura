<template>
  <q-page class="at" :class="{ 'at--live': session }" :style-fn="pageStyleFn">
    <h1 class="sr-only">{{ t('pages.atelier.title') }}</h1>

    <!-- ── Lancement ────────────────────────────────────────────────────── -->
    <div v-if="!session" class="at-open">
      <!-- Dans `v-if="!session"`, donc sur le seul écran d'accueil : une fois la
           session ouverte, l'Atelier va bord à bord et n'a plus de vide où la
           trame pourrait courir. Variante fixe, la colonne étant centrée. -->
      <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

      <header class="at-intro">
        <p class="at-title">{{ t('pages.atelier.title') }}</p>
        <p class="at-lead">
          {{ t('pages.atelier.lead') }}
        </p>
      </header>

      <!--
        L'adresse désignait une session qui n'est plus là.

        Le registre vit en mémoire : redémarrer le BFF les efface toutes. On le
        dit, plutôt que de rouvrir l'écran vide comme si le lien n'avait jamais
        rien désigné — et on propose ce qui reste, le transcript, qui lui est sur
        le disque.
      -->
      <section v-if="gone" class="surface-card at-gone" role="status">
        <q-icon name="history_toggle_off" size="18px" aria-hidden="true" />
        <p>
          {{ t('pages.atelier.gone.what') }}
        </p>
        <!-- Reprendre plutôt que rouvrir : la reprise du SDK se fait en place,
             dans le même transcript, avec tout le contexte rechargé. -->
        <q-btn
          v-if="gone.session && gone.slug"
          unelevated
          no-caps
          color="primary"
          icon="play_arrow"
          :label="t('pages.atelier.gone.resume')"
          :loading="resuming"
          @click="resume"
        />
        <q-btn
          v-if="gone.session && gone.slug"
          flat
          dense
          no-caps
          icon="history"
          :label="t('pages.atelier.gone.replay')"
          :to="{ name: 'session', params: { slug: gone.slug, id: gone.session } }"
        />
        <q-btn flat dense no-caps :label="t('common.close')" @click="dismissGone" />
      </section>

      <!--
        Ce qui tourne en ce moment.

        Une session vivante n'a qu'une adresse, son `runId` dans l'URL : l'onglet
        fermé sans garder le lien, elle continue de tourner sans être joignable —
        et elle occupe une des places du parc. Cette liste est la seule façon d'y
        revenir, et la seule d'en libérer une sans passer par le terminal.

        Aucun état vide : la section disparaît quand rien ne tourne, ce qui le dit
        déjà. Aucun squelette non plus — elle apparaît quand la liste arrive, et
        un bloc fantôme au chargement ferait clignoter le haut de l'écran à chaque
        ouverture, y compris les fois, majoritaires, où il n'y a rien à montrer.
      -->
      <section v-if="liveSessions.length" class="surface-card at-live-open" aria-labelledby="at-live-h">
        <h2 id="at-live-h">{{ t('pages.atelier.live.head') }}</h2>

        <ul class="at-sessions">
          <li v-for="s in liveSessions" :key="s.runId" class="at-live-row">
            <button type="button" class="at-session" :aria-label="t('pages.atelier.live.join', { folder: folderName(s.cwd) })" @click="join(s)">
              <span class="at-session-title">{{ folderName(s.cwd) }}</span>
              <span class="at-session-meta font-mono">
                <span class="status-dot" :class="dotClass(s.status)" aria-hidden="true" />
                {{ t(statusKey(s.status)) }} · {{ relTime(s.startedAt) }}
              </span>
            </button>

            <q-btn flat dense icon="close" :aria-label="t('pages.atelier.live.stop', { folder: folderName(s.cwd) })" @click="stopLive(s.runId)" />
          </li>
        </ul>
      </section>

      <!--
        Le dossier d'abord, et par reconnaissance plutôt que par mémoire.

        Coller un chemin absolu à la main est le geste le plus coûteux de cet
        écran, et le plus facile à rater — d'autant que le modèle lui-même part
        de travers quand le dossier n'est pas ce qu'il croit. Les projets que
        Claude Code a déjà vus sont là : les proposer, c'est supprimer le geste.
      -->
      <section class="surface-card at-where" aria-labelledby="at-where-h">
        <h2 id="at-where-h">{{ t('pages.atelier.where') }}</h2>

        <q-skeleton v-if="loadingProjects" type="rect" height="72px" />

        <ul v-else-if="recentProjects.length" class="at-projects">
          <li v-for="p in recentProjects" :key="p.slug">
            <button
              type="button"
              class="at-project"
              :class="{ 'at-project--on': cwd === p.path }"
              :aria-pressed="cwd === p.path"
              @click="pick(p.path)"
            >
              <span class="at-project-name">{{ p.name }}</span>
              <span class="at-project-path font-mono">{{ p.path }}</span>
              <span class="at-project-meta font-mono">
                {{ t('pages.atelier.projectSessions', p.sessions) }} ·
                {{ relTime(p.lastActivity) }}
              </span>
            </button>
          </li>
        </ul>

        <!--
          Parcourir plutôt que saisir.

          Le navigateur ne sait pas rendre un chemin absolu — `showDirectoryPicker`
          donne une poignée, pas un chemin — mais le BFF tourne sur cette machine
          et peut ouvrir le sélecteur du système. Le champ reste, en lecture des
          deux sens : il montre le choix, et accepte un chemin collé.
        -->
        <div class="at-pick">
          <!--
            `v-model` serait un piège ici : `clearable` écrit `null` dans le
            modèle, et le `cwd.trim()` du bouton lève alors en plein rendu — la
            mise à jour est jetée, et la croix paraît sans effet. On normalise à
            l'entrée pour que `cwd` reste une chaîne, toujours.
          -->
          <q-input
            :model-value="cwd"
            dense
            outlined
            hide-bottom-space
            clearable
            class="at-pick-field"
            :label="t('pages.atelier.folder')"
            :aria-label="t('pages.atelier.folderAria')"
            :error="Boolean(launchError)"
            :error-message="launchError"
            @update:model-value="(v) => (cwd = typeof v === 'string' ? v : '')"
          >
            <template #prepend><q-icon name="folder_open" size="18px" /></template>
          </q-input>
          <q-btn v-if="pickerAvailable" flat no-caps icon="folder" :label="t('pages.atelier.browse')" :loading="picking" @click="browse" />
        </div>
        <p v-if="picking" class="at-picking">
          {{ t('pages.atelier.picking') }}
        </p>

        <!--
          Reprendre plutôt que recommencer.

          Un dossier porte souvent un travail déjà entamé, et le rouvrir à vide
          ferait réexpliquer ce que la session précédente sait déjà. La reprise
          du SDK se fait en place : même transcript, contexte rechargé.

          On ne montre que les cinq dernières : au-delà, c'est un annuaire, et la
          page Projet le tient déjà mieux que nous.
        -->
        <div v-if="cwd.trim()" class="at-resume">
          <p class="at-resume-head">
            <q-icon name="restart_alt" size="15px" aria-hidden="true" />
            {{ t('pages.atelier.resume') }}
          </p>

          <q-skeleton v-if="loadingSessions" type="rect" height="52px" />

          <ul v-else-if="resumable.length" class="at-sessions">
            <li v-for="s in resumable" :key="s.id">
              <button type="button" class="at-session" :disabled="resuming" @click="resumeSession(s.id)">
                <span class="at-session-title">{{ s.title || s.firstPrompt || t('pages.atelier.untitled') }}</span>
                <span class="at-session-meta font-mono">
                  {{ relTime(s.mtime) }}
                  <template v-if="s.metrics"> · {{ t('pages.atelier.resumeTurns', s.metrics.turns) }} </template>
                </span>
              </button>
            </li>
          </ul>

          <p v-else class="at-resume-empty">{{ t('pages.atelier.noResume') }}</p>
        </div>

        <!--
          Ouvrir ne demande qu'un dossier.

          Il n'y a pas de première consigne à écrire ici : la session s'ouvre
          vide et attend. C'est aussi ce que fait le serveur — le runner ne
          démarre le SDK qu'au premier message, donc une session ouverte et
          jamais adressée ne consomme rien.

          Les réglages restent en retrait : leurs valeurs par défaut conviennent
          presque toujours, et les mettre en avant ferait délibérer avant d'ouvrir.
        -->
        <div class="at-options">
          <div class="at-option">
            <span class="at-option-label">{{ t('pages.atelier.modelLabel') }}</span>
            <SegmentedControl v-model="model" :options="MODELS" :aria-label="t('pages.atelier.modelAria')" />
          </div>
          <div class="at-option">
            <span class="at-option-label">{{ t('pages.atelier.permissionsLabel') }}</span>
            <SegmentedControl v-model="permissionMode" :options="MODES" :aria-label="t('pages.atelier.permissionsAria')" />
          </div>
          <q-btn
            unelevated
            no-caps
            color="primary"
            icon-right="arrow_forward"
            :label="t('pages.atelier.open')"
            :loading="launching"
            :disable="!cwd.trim()"
            @click="launch"
          />
        </div>
      </section>
    </div>

    <!-- ── Session en cours ─────────────────────────────────────────────── -->
    <!--
      Trois bandes, et une seule qui défile.

      Le flux avait d'abord la page pour conteneur, avec un pied collant : le
      texte passait *derrière* la zone de saisie en défilant. Un pied collant ne
      peut pas ne pas recouvrir ce qui glisse dessous. Le corps défile donc chez
      lui, entre une barre et un pied qui sont ses frères — plus rien ne passe
      derrière quoi que ce soit, et l'auto-défilement a enfin un conteneur à qui
      parler.
    -->
    <div v-else class="at-live" :class="{ 'at-live--aside': showAside }">
      <div class="at-main">
        <header class="surface-card at-bar">
          <!-- Le halo respirant de `status-dot--live`, celui-là même que la page
               d'accueil pose sur une session en activité. L'Atelier, qui est
               *l'*écran d'une session en activité, ne l'avait pas. -->
          <!-- Le lien rompu prime sur le statut : celui-ci date de la dernière
               trame reçue, et l'annoncer encore ferait dire « Au travail » à une
               session dont on ne sait plus rien. -->
          <span
            class="at-dot"
            :class="[lost ? 'at-dot--lost' : `at-dot--${status}`, { 'status-dot--live': status === 'working' && !lost }]"
            aria-hidden="true"
          />
          <span class="at-status">{{ lost ? t('pages.atelier.lost') : t(`pages.atelier.status.${status}`) }}</span>
          <!-- Le nom du dossier, pas son chemin : la barre dit où l'on est, et
               un chemin absolu la remplit sans rien apprendre à qui l'a choisi.
               Le chemin complet reste dans l'infobulle, et sur l'écran d'accueil
               de la session. -->
          <span class="at-cwd" :title="session.cwd">{{ projectName }}</span>
          <span v-if="session.resumed" class="at-resumed">{{ t('pages.atelier.resumed') }}</span>

          <!--
            Le modèle se change désormais par `/model`, comme dans le CLI : deux
            commandes pour un même réglage se contrediraient à l'écran dès que
            l'une des deux serait employée. Ce qui reste ici est ce que le SDK
            emploie vraiment — une lecture, pas un réglage.

            Le mode de permission, lui, garde son sélecteur : on le change en
            travaillant, quand un tour bute sur une autorisation.
          -->
          <span v-if="modelBadge" class="at-model" :class="{ 'at-model--planned': !modelShown?.confirmed }" :title="modelTitle">
            <q-icon name="psychology" size="14px" aria-hidden="true" />
            {{ modelBadge }}
          </span>
          <!-- Le même contrôle qu'à l'ouverture de la session, et pour la même
               raison : c'est une valeur qu'on choisit parmi quatre, pas une
               liste à dérouler. Les quatre modes tiennent côte à côte, et l'on
               voit d'un coup celui qui s'applique au lieu de l'ouvrir pour le
               savoir. -->
          <SegmentedControl
            :model-value="session.permissionMode"
            :options="MODES"
            class="at-live-modes"
            :aria-label="t('pages.atelier.permissionsAria')"
            @update:model-value="changePermissionMode"
          />

          <q-toggle
            v-model="autoScroll"
            dense
            size="sm"
            :label="t('pages.atelier.autoScroll')"
            class="at-toggle"
            @update:model-value="onFollowToggle"
          />
          <q-toggle v-model="followLive" dense size="sm" :label="t('pages.atelier.followLive')" class="at-toggle" />

          <!-- Sous le seuil, le contexte vit dans un tiroir plutôt que dans une
               colonne qu'il n'y a pas la place de tenir. Un seul des deux est
               monté : le panneau est le même, et le rendre deux fois doublerait
               son travail pour n'en montrer qu'un. -->
          <ContextDrawer
            v-if="parsed && !asideColumn"
            :context="parsed.context"
            :cost-usd="parsed.stats.costUsd"
            :cost-partial="parsed.stats.costPartial"
            drawer-id="at-context-drawer"
            live
            @navigate="(u: string) => void goToTurn(u)"
          />

          <!-- Le rejeu n'est possible qu'une fois l'identifiant du SDK connu, ce
               qui arrive après le premier tour. -->
          <q-btn
            v-if="session.sessionId"
            flat
            dense
            no-caps
            icon="history"
            :label="t('pages.atelier.fullReplay')"
            :to="{ name: 'session', params: { slug: session.slug, id: session.sessionId } }"
          />
          <q-btn flat dense no-caps icon="power_settings_new" :label="t('pages.atelier.stop')" @click="stop" />
        </header>

        <!--
          Les pistes, dès que la session a lancé des agents. Comme tout ce qui se
          reconstruit en parcourant le fichier, elles se peuplent à la fin du
          tour qui les a lancées.
        -->
        <AgentTrackBar v-if="parsed?.subagents.length" v-model="track" :runs="parsed.subagents" :main-count="mainEvents.length" />

        <div ref="scrollEl" class="at-scroll" @scroll="onScroll">
          <TranscriptTimeline
            v-if="shownEvents.length"
            ref="timeline"
            :events="shownEvents"
            :silent-hooks="track === MAIN_TRACK ? parsed?.silentHooks : undefined"
            :context="parsed?.context"
            :follow-live="followLive && track === MAIN_TRACK"
            :show-run-prompt="track !== MAIN_TRACK"
            class="at-timeline"
          />
          <p v-else class="at-empty">
            <i18n-t keypath="pages.atelier.empty" tag="span" scope="global">
              <template #cwd
                ><span class="font-mono">{{ session.cwd }}</span></template
              >
            </i18n-t>
          </p>
        </div>

        <!-- Ce qui attend un humain passe avant la saisie : c'est ce qui bloque
             l'agent, et donc la seule chose à faire pour l'instant. -->
        <div class="at-foot">
          <!-- Ce qui se passe en ce moment, entre le fil et la saisie : c'est
               là que le regard revient après avoir lu, et c'est le seul endroit
               qui reste visible quel que soit le défilement. -->
          <ActivityLine :activity="activity" />

          <!--
            La question vit dans un dialogue, pas dans le pied.

            Une question à trois maquettes fait deux écrans : posée ici, elle
            écrasait la conversation qui l'a amenée, au moment précis où l'on a
            besoin de la relire pour répondre. Ne reste dans le flux que ce
            rappel, qui rouvre le dialogue — et le referme sans rien perdre.
          -->
          <button v-if="asks.length && !askOpen" ref="askReminder" type="button" class="at-ask-reminder" @click="askOpen = true">
            <q-icon name="help" size="16px" aria-hidden="true" />
            <span>
              {{ asks.length > 1 ? t('pages.atelier.askMany', { n: asks.length }) : t('pages.atelier.askOne') }}
            </span>
            <span class="at-ask-reminder-cta font-mono">{{ t('pages.atelier.answer') }}</span>
          </button>

          <PermissionPrompt
            v-for="perm in permissions"
            :key="perm.id"
            :request="perm"
            :busy="answering"
            @answer="(answer) => respondPermission(perm.id, answer)"
          />

          <section class="surface-card at-composer" aria-labelledby="at-composer-h">
            <h2 id="at-composer-h" class="sr-only">{{ t('pages.atelier.composer') }}</h2>
            <SessionComposer
              :working="status === 'working'"
              :busy="answering"
              :ended="status === 'ended' || status === 'failed'"
              :commands="commands"
              :commands-loading="commandsLoading"
              :files="files"
              :files-loading="filesLoading"
              :files-truncated="filesTruncated"
              @send="say"
              @interrupt="interrupt"
              @commands-needed="loadCommands"
              @files-needed="loadFiles"
            />
            <p v-if="error" class="at-error">{{ error }}</p>
          </section>
        </div>
      </div>

      <aside v-if="showAside" class="at-aside" :aria-label="t('pages.atelier.aside')">
        <!--
          Ce que la session fait faire : son plan, et ce qu'elle a lancé derrière.

          Une carte pour les deux, et un onglet par sujet qui a quelque chose à
          dire. Deux cartes plafonnées chacune à 40 % de la colonne ne laissaient
          au contexte qu'un tiers de la hauteur alors qu'il est le seul des trois
          à porter une lecture longue. On regarde le plan *ou* l'arrière-plan —
          jamais les deux à la fois — donc l'onglet ne coûte rien.

          Le plan se lit du flux vivant, pas du disque : chaque `TaskUpdate` est
          un appel d'outil que le direct porte déjà, et attendre la fin du tour
          montrerait l'avancement en retard. L'arrière-plan, lui, est un état :
          un `pnpm dev:all` quitte la liste des outils en deux secondes et tient
          pourtant un port pendant une heure.
        -->
        <section v-if="hasWork" class="surface-card at-panel at-panel--tasks" :class="{ 'at-panel--folded': !workOpen }">
          <div class="at-work-head">
            <q-tabs v-model="workTab" dense no-caps align="left" class="at-tabs">
              <q-tab v-if="tasks.tasks.length" name="tasks">
                {{ t('pages.atelier.tasks') }}
                <span v-if="tasks.currentWave" class="at-panel-count font-mono">
                  {{ tasks.currentWave.done }} / {{ tasks.currentWave.tasks.length }}
                </span>
              </q-tab>
              <q-tab v-if="shells.length" name="shells">
                {{ t('replay.shells.title') }}
                <span v-if="runningShells" class="at-panel-count font-mono">{{ runningShells }}</span>
              </q-tab>
            </q-tabs>

            <!--
              Replier, pour rendre la hauteur au contexte.

              Le suivi dit son essentiel dans ses onglets — l'avancement du plan,
              le nombre de commandes encore en vol — et ceux-là restent visibles
              une fois replié. C'est ce qui permet de le fermer sans se priver de
              ce qu'on regardait.
            -->
            <q-btn
              flat
              dense
              size="sm"
              class="at-work-fold"
              :icon="workOpen ? 'expand_less' : 'expand_more'"
              :aria-label="t(workOpen ? 'pages.atelier.workCollapse' : 'pages.atelier.workExpand')"
              :aria-expanded="workOpen"
              :aria-controls="workPanelsId"
              @click="workOpen = !workOpen"
            />
          </div>

          <q-tab-panels v-show="workOpen" :id="workPanelsId" v-model="workTab" keep-alive class="at-tabpanels">
            <q-tab-panel name="tasks" class="at-tabpanel">
              <div class="at-panel-scroll">
                <TaskPanel :progress="tasks" @navigate="(u: string) => void goToTurn(u)" />
              </div>
            </q-tab-panel>

            <q-tab-panel name="shells" class="at-tabpanel">
              <div class="at-panel-scroll">
                <ShellPanel v-if="session" :run-id="session.runId" :shells="shells" @navigate="(u: string) => void goToShell(u)" />
              </div>
            </q-tab-panel>
          </q-tab-panels>
        </section>

        <!--
          Deux lectures d'un même projet, dans une seule carte : le contexte dit
          ce que la session a fait entrer dans sa fenêtre, les ressources disent
          ce que le projet lui met sous la main. On regarde l'un *ou* l'autre.
        -->
        <section class="surface-card at-panel" :aria-label="t('pages.atelier.panelAria')">
          <q-tabs v-model="asideTab" dense no-caps align="left" class="at-tabs">
            <q-tab name="context" :label="t('pages.atelier.tabContext')" />
            <q-tab name="resources" :label="t('pages.atelier.tabResources')" />
          </q-tabs>

          <q-tab-panels v-model="asideTab" keep-alive class="at-tabpanels">
            <q-tab-panel name="context">
              <!-- La fenêtre se reconstruit en relisant le transcript : elle
                   n'existe donc qu'après le premier tour, et se rafraîchit à
                   chaque fin de tour. -->
              <ContextPanel v-if="parsed" :context="parsed.context" live @navigate="(u: string) => void goToTurn(u)" />
              <p v-else class="at-panel-empty">
                {{ t('pages.atelier.contextPending') }}
              </p>
            </q-tab-panel>

            <q-tab-panel name="resources">
              <!-- `active` : l'inventaire n'est demandé qu'une fois l'onglet
                   ouvert. Un écran de direct recharge déjà beaucoup. -->
              <ProjectResourcesPanel
                :slug="session.slug"
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

    <!--
      Le dialogue de réponse.

      `q-dialog` parce que répondre est une décision qui bloque l'agent — mais
      refermable, contrairement à un `persistent` : on relit la conversation
      derrière, puis on rouvre par le rappel. Le brouillon vit dans la page, donc
      la fermeture ne perd ni un choix ni l'étape où l'on en était.
    -->
    <q-dialog v-model="askOpen" class="at-ask-dialog" @hide="onAskHide">
      <q-card v-if="currentAsk" class="at-ask-card surface-card">
        <AskPrompt
          v-model:draft="currentDraft"
          :request="currentAsk"
          :busy="answering"
          @answer="(answers, notes) => respondAsk(currentAsk!.id, answers, notes)"
          @close="askOpen = false"
        />
      </q-card>
    </q-dialog>

    <!-- La lecture d'une ressource, en grand : le panneau fait 380 px, de quoi
         parcourir un arbre, pas de quoi lire un CLAUDE.md. -->
    <ResourceDialog :slug="session?.slug ?? ''" :resource="openResource" :source="openSource" @close="openResource = null" />
  </q-page>
</template>

<script setup lang="ts">
  import ActivityLine from '@/components/agent/ActivityLine.vue'
  import AskPrompt, { type AskDraft } from '@/components/agent/AskPrompt.vue'
  import PermissionPrompt from '@/components/agent/PermissionPrompt.vue'
  import SessionComposer from '@/components/agent/SessionComposer.vue'
  import { indexRuns, AGENT_RUNS, OPEN_TRACK } from '@/components/replay/agentRuns'
  import AgentTrackBar from '@/components/replay/AgentTrackBar.vue'
  import ContextDrawer from '@/components/replay/ContextDrawer.vue'
  import ContextPanel from '@/components/replay/ContextPanel.vue'
  import { RUNNING_TOOLS } from '@/components/replay/runningTools'
  import { diskCaughtUp, humanTurns, stitch } from '@/components/replay/seam'
  import ShellPanel from '@/components/replay/ShellPanel.vue'
  import { trackTasks, taskIndex, TASK_INDEX } from '@/components/replay/taskList'
  import TaskPanel from '@/components/replay/TaskPanel.vue'
  import { TRANSCRIPT_SOURCE } from '@/components/replay/transcriptSource'
  import TranscriptTimeline from '@/components/replay/TranscriptTimeline.vue'
  import type { ResourceSource } from '@/components/resources/projectResources'
  import ProjectResourcesPanel from '@/components/resources/ProjectResourcesPanel.vue'
  import ResourceDialog from '@/components/resources/ResourceDialog.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import { eventsOfTrack, trackOfEvent, MAIN_TRACK, type TrackId } from '@/composables/useAgentTracks'
  import { useLiveSession } from '@/composables/useLiveSession'
  import { useNotify } from '@/composables/useNotify'
  import type { AgentSession, AskRequest, PermissionAnswer, PromptAttachment } from '@/services/agent'
  import {
    answerAsk,
    answerPermission,
    createAgentSession,
    interruptSession,
    listAgentSessions,
    PERMISSION_MODES,
    pickFolder,
    sendPrompt,
    setSessionPermissionMode,
    stopSession,
  } from '@/services/agent'
  import { readFile as readClaudeFile } from '@/services/claude'
  import {
    getProjects,
    getProjectSessions,
    readTranscript,
    type ParsedTranscript,
    type ProjectSummary,
    type ResourceNode,
    type TranscriptSummary,
  } from '@/services/projects'
  import { relTime } from '@/utils/format'
  import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, useId, useTemplateRef, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRoute, useRouter } from 'vue-router'

  const { t } = useI18n()
  const { notifyError } = useNotify()
  const {
    events: liveEvents,
    session,
    status,
    error,
    permissions,
    asks,
    lost,
    activity,
    commands,
    commandsLoading,
    loadCommands,
    files,
    filesLoading,
    filesTruncated,
    loadFiles,
    shells,
    attach,
    detach,
  } = useLiveSession()

  /** Le flux occupe la fenêtre : c'est lui qui défile, pas la page. */
  function pageStyleFn(offset: number, height: number): Record<string, string> {
    return { height: `${height - offset}px` }
  }

  /**
   * Le modèle des réglages, pour le nommer plutôt que de dire « hérité ».
   *
   * « Hérité des réglages » demande d'aller voir ailleurs ce qu'on obtiendra ;
   * « Réglages : opus » le dit. Vide tant que `settings.json` n'a pas répondu, ou
   * quand il ne fixe pas de modèle — c'est alors Claude Code qui choisit, et nous
   * n'avons rien de plus juste à annoncer.
   */
  const settingsModel = ref('')

  // Une puce porte un mot, pas une phrase : ce que le libellé ne peut plus dire
  // passe en infobulle, où il est de toute façon mieux à sa place qu'écrasé dans
  // un segment. Le premier segment garde son rôle — « celui des réglages » — et
  // c'est l'infobulle qui le nomme.
  const MODELS = computed(() => [
    {
      label: t('pages.atelier.models.settings'),
      value: '',
      tooltip: settingsModel.value ? t('pages.atelier.models.settingsTip', { model: settingsModel.value }) : t('pages.atelier.models.settingsNone'),
    },
    { label: 'Opus', value: 'opus' },
    { label: 'Sonnet', value: 'sonnet' },
    { label: 'Haiku', value: 'haiku' },
  ])

  /**
   * Les modes de permission du SDK, moins ceux qui videraient l'écran de son sens.
   *
   * Retenus — tous laissent un humain dans la boucle, à des degrés différents :
   *   `default`     tout ce qui est risqué remonte au bandeau ;
   *   `auto`        un classifieur tranche le tout-venant, l'ambigu remonte ;
   *   `acceptEdits` les éditions de fichiers passent seules, le reste remonte ;
   *   `plan`        l'agent réfléchit et n'exécute rien.
   *
   * Écartés — `bypassPermissions` et `dontAsk` retirent l'humain de la boucle,
   * chacun par un bout : le premier laisse tout passer sans rien demander, le
   * second refuse tout ce qui n'est pas pré-autorisé sans rien demander non plus.
   * Dans les deux cas le bandeau ne s'affiche jamais, et l'Atelier n'est plus
   * qu'un terminal en moins commode. Ils restent accessibles dans `settings.json`,
   * pour qui les veut vraiment.
   *
   * La liste vient de `shared/` : le BFF refuse ce qu'elle ne contient pas, et
   * cet écran n'est pas seul à en décider.
   */
  const MODE_VALUES = PERMISSION_MODES

  /**
   * L'icône de chaque mode : ce que le mode *fait*, pas ce qu'il autorise.
   *
   * Des noms anciens du jeu Material, délibérément : `flash_on` plutôt que `bolt`,
   * qui n'existe que dans les versions récentes de la police et se rendrait en
   * carré vide sur les autres.
   */
  const MODE_ICONS: Record<string, string> = {
    default: 'pan_tool',
    auto: 'flash_on',
    acceptEdits: 'edit',
    plan: 'map',
  }

  const MODE_LABELS = computed(() =>
    MODE_VALUES.map((value) => ({
      value: String(value),
      label: t(`pages.atelier.modes.${value}`),
      tooltip: t(`pages.atelier.modes.${value}Tip`),
      ...(MODE_ICONS[String(value)] ? { icon: MODE_ICONS[String(value)] } : {}),
    })),
  )

  /**
   * Le mode que `settings.json` fixe, quand il en fixe un.
   *
   * Une session de l'Atelier n'a pas de raison d'être plus prudente que le reste
   * de votre installation : on part de ce que vos réglages disent, comme pour le
   * modèle. Vide quand la clé est absente — Claude Code applique alors `default`,
   * et l'annoncer autrement serait inventer.
   */
  const settingsMode = ref('')

  /** Le mode des réglages est-il de ceux que l'Atelier propose ? */
  const settingsModeOffered = computed(() => MODE_LABELS.value.some((m) => m.value === settingsMode.value))

  const MODES = computed(() =>
    MODE_LABELS.value.map((m) => ({
      ...m,
      // D'où vient la valeur pré-choisie. Dans l'infobulle et non sur la puce :
      // le libellé doit rester d'un mot, et cette précision se lit une fois.
      tooltip: m.value === settingsMode.value ? t('pages.atelier.modes.fromSettings', { tip: m.tooltip }) : m.tooltip,
    })),
  )

  /**
   * Le nom du dossier de travail, sans son chemin.
   *
   * Même calcul que la liste des projets, qui prend le `basename` du chemin réel
   * (`server/projects.ts`) : le même dossier doit porter le même nom des deux
   * côtés de l'écran. Le chemin entier n'est pas perdu — il reste dans
   * l'infobulle, et sur l'écran d'ouverture d'une session.
   */
  const projectName = computed(() => {
    const path = (session.value?.cwd ?? '').replace(/[\\/]+$/, '')
    return path.split(/[\\/]/).pop() || path
  })

  /**
   * L'identifiant du modèle à annoncer, et s'il est confirmé.
   *
   * `resolvedModel` — ce que le SDK emploie vraiment — n'arrive qu'avec `init`,
   * c'est-à-dire après le premier tour. Jusque-là on n'a que ce qui est *prévu* :
   * le choix d'ouverture, ou à défaut le modèle des réglages. Taire la puce
   * pendant ce temps la ferait apparaître d'un coup au premier envoi ; l'annoncer
   * comme confirmée mentirait. On dit donc les deux, et l'infobulle fait la
   * différence.
   *
   * Quand rien n'est prévu ni résolu, il n'y a pas de puce : c'est Claude Code qui
   * choisira, et nommer un modèle serait l'inventer.
   */
  const modelShown = computed(() => {
    const resolved = session.value?.resolvedModel ?? ''
    if (resolved) return { id: resolved, confirmed: true }
    const planned = session.value?.model || settingsModel.value
    return planned ? { id: planned, confirmed: false } : null
  })

  /**
   * Le modèle en clair : `claude-opus-5[1m]` devient `Opus 5`.
   *
   * Un identifiant que le motif ne reconnaît pas s'affiche tel quel — mieux vaut
   * une chaîne technique qu'un nom inventé.
   */
  const modelBadge = computed(() => {
    const id = modelShown.value?.id ?? ''
    const found = /(opus|sonnet|haiku|fable)-?(\d+(?:\.\d+)?)?/i.exec(id)
    if (!found?.[1]) return id
    const family = found[1][0]?.toUpperCase() + found[1].slice(1).toLowerCase()
    return found[2] ? `${family} ${found[2]}` : family
  })

  /** L'identifiant exact, et d'où il vient. Trop long pour la barre, utile au survol. */
  const modelTitle = computed(() => {
    const shown = modelShown.value
    if (!shown) return ''
    if (!shown.confirmed) return t('pages.atelier.modelPlanned', { id: shown.id })
    return session.value?.model ? t('pages.atelier.modelChosen', { id: shown.id }) : t('pages.atelier.modelInherited', { id: shown.id })
  })

  const cwd = ref('')
  const model = ref('')
  const permissionMode = ref('default')
  const launching = ref(false)
  const launchError = ref('')
  const answering = ref(false)

  const projects = ref<ProjectSummary[]>([])
  const loadingProjects = ref(true)

  /**
   * Les dossiers déjà connus de Claude Code, les plus récents d'abord.
   *
   * Un projet dont le chemin réel n'a pas pu être relu est écarté : le slug seul
   * ne se décode pas sans ambiguïté, et proposer un dossier qui n'existe pas
   * ferait échouer la session au premier outil.
   *
   * Trois : c'est un raccourci vers ce sur quoi on travaillait, pas un annuaire.
   * Au-delà, la liste demande d'être lue — or tout ce qu'elle n'affiche pas est à
   * un clic dans le sélecteur.
   */
  const recentProjects = computed(() =>
    projects.value
      .filter((p) => p.path)
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, 3),
  )

  onMounted(async () => {
    // Avant les projets : c'est la seule voie de retour vers une session en cours,
    // et elle coiffe l'écran. La faire attendre la liste des projets la ferait
    // apparaître après coup, en poussant le reste vers le bas.
    await loadLive()
    try {
      projects.value = (await getProjects()).projects
    } catch {
      // Le champ libre reste : ne pas savoir proposer n'empêche pas de lancer.
    } finally {
      loadingProjects.value = false
    }
    try {
      const { content } = await readClaudeFile('settings.json')
      const settings = JSON.parse(content) as { model?: unknown; permissions?: unknown }
      settingsModel.value = str(settings.model)
      settingsMode.value = str(rec(settings.permissions).defaultMode)
      // Pré-choisir ce que les réglages disent — mais seulement si l'Atelier le
      // propose. `bypassPermissions` et `dontAsk` ne sont pas dans la liste, et
      // les appliquer en silence retirerait l'humain de la boucle sur l'écran
      // dont c'est justement la promesse. On reste alors sur « Demander », et la
      // note sous les sélecteurs dit pourquoi.
      if (settingsModeOffered.value) permissionMode.value = settingsMode.value
    } catch {
      // Réglages illisibles ou sans ces clés : les libellés restent génériques et
      // la session s'ouvre sur « Demander ».
    }
    await reopenFromUrl()
  })

  /** La valeur si c'est une chaîne, sinon rien — `settings.json` n'est pas typé. */
  function str(v: unknown): string {
    return typeof v === 'string' ? v : ''
  }

  /** Idem pour un objet imbriqué : `permissions` peut être absent ou de travers. */
  function rec(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  }

  // ── L'adresse porte la session ──────────────────────────────────────────────

  const route = useRoute()
  const router = useRouter()

  /**
   * Ce que l'adresse retient, et pourquoi les deux identifiants.
   *
   * `run` est la session vivante côté AURA : c'est lui qui permet de revenir
   * dedans et de reprendre la conversation. Mais il ne survit pas au redémarrage
   * du BFF — le registre est en mémoire, et c'est voulu (il garde des promesses en
   * attente, qui ne se sérialisent pas).
   *
   * `session` est l'identifiant du SDK, écrit sur le disque avec le transcript. Il
   * survit à tout. Quand le `run` a disparu, c'est lui qui permet encore d'ouvrir
   * le rejeu — et donc de relire, ou de faire relire, ce qui s'est passé.
   *
   * `replace` et non `push` : la session n'est pas une étape de navigation, et
   * empiler une entrée d'historique à chaque `init` ferait du bouton Retour un
   * piège.
   */
  watch(
    () => [session.value?.runId, session.value?.sessionId, session.value?.slug] as const,
    ([run, sdk, slug]) => {
      // Le slug accompagne le `session` : le rejeu s'ouvre sur le couple, et une
      // adresse qui ne porterait que l'identifiant ne mènerait nulle part.
      const query: Record<string, string> = {}
      if (run) {
        query.run = run
        if (sdk) {
          query.session = sdk
          if (slug) query.slug = slug
        }
      }
      if (query.run === route.query.run && query.session === route.query.session) return
      void router.replace({ name: 'atelier', query })
    },
  )

  /** Ce que l'adresse désignait, quand elle ne désigne plus rien. */
  const gone = ref<{ session: string; slug: string } | null>(null)

  /**
   * Naviguer vers `/atelier` sans paramètre ne remonte pas le composant — même
   * route, même instance. L'avis « session plus ouverte » y survivait donc à
   * l'adresse qui l'avait causé, et s'affichait devant un écran d'ouverture vierge.
   */
  watch(
    () => route.query.run,
    (run) => {
      if (!run) gone.value = null
    },
  )

  /**
   * Reprendre la session que l'adresse désigne.
   *
   * On ne se contente pas de s'abonner au flux : il faut d'abord savoir si la
   * session existe encore. Un `EventSource` sur un `runId` inconnu échouerait en
   * silence et se reconnecterait indéfiniment, laissant un écran vide sans
   * explication.
   */
  async function reopenFromUrl(): Promise<void> {
    const run = typeof route.query.run === 'string' ? route.query.run : ''
    if (!run || session.value) return
    try {
      const { sessions } = await listAgentSessions()
      const found = sessions.find((s) => s.runId === run)
      if (found) {
        attach(found.runId)
        session.value = found
        return
      }
    } catch {
      /* le serveur ne répond pas : on retombe sur l'écran d'ouverture */
    }
    gone.value = {
      session: typeof route.query.session === 'string' ? route.query.session : '',
      slug: typeof route.query.slug === 'string' ? route.query.slug : '',
    }
  }

  /** Refermer l'avis, et nettoyer l'adresse : elle ne désigne plus rien. */
  function dismissGone(): void {
    gone.value = null
    void router.replace({ name: 'atelier', query: {} })
  }

  // ── Les sessions vivantes ───────────────────────────────────────────────────

  const liveSessions = ref<AgentSession[]>([])

  /**
   * Ce que l'Atelier tient ouvert, tous dossiers confondus.
   *
   * Sans filtre sur le dossier choisi, contrairement à la liste « Reprendre » :
   * une session qu'on cherche à retrouver est justement celle dont on ne se
   * rappelle plus où elle travaillait.
   *
   * Silencieux en cas d'échec, comme le chargement des projets : ne pas savoir
   * lister n'empêche pas d'ouvrir une session, et un bandeau d'erreur en haut de
   * l'écran d'accueil coûterait plus qu'il n'apprend.
   */
  async function loadLive(): Promise<void> {
    try {
      liveSessions.value = (await listAgentSessions()).sessions
    } catch {
      /* le reste de l'écran d'ouverture est intact */
    }
  }

  /** Le dossier, sans son chemin : c'est lui qu'on reconnaît, pas l'arborescence. */
  function folderName(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? path
  }

  /**
   * Rejoindre une session vivante.
   *
   * Rien à créer : elle tourne déjà. On s'abonne, et le premier message du flux
   * est un instantané complet — le fil se remplit sans qu'on ait à relire le
   * transcript. Même geste que `launch()` après une création.
   */
  function join(s: AgentSession): void {
    attach(s.runId)
    session.value = s
  }

  /** Arrêter depuis la liste, ce qui libère aussitôt sa place dans le parc. */
  async function stopLive(runId: string): Promise<void> {
    try {
      await stopSession(runId)
    } catch (e) {
      fail(e)
    }
    await loadLive()
  }

  /**
   * L'état de la session, en toutes lettres.
   *
   * Une clé construite plutôt qu'interpolée dans `t()` : l'interpolation se type
   * mal, et l'union fermée des statuts garantit ici qu'aucune branche ne manque.
   */
  function statusKey(status: AgentSession['status']): string {
    return `pages.atelier.live.${status}`
  }

  /**
   * La pastille d'état.
   *
   * `--live` ne se pose que sur ce qui bouge en ce moment — c'est la règle de
   * l'utilitaire, et une session qui travaille en est le cas exemplaire. Les
   * autres états portent une teinte fixe, ou le gris par défaut.
   */
  function dotClass(status: AgentSession['status']): string {
    if (status === 'working') return 'status-dot--pulse status-dot--live'
    if (status === 'waiting') return 'status-dot--brand'
    return ''
  }

  const resuming = ref(false)

  /**
   * Reprendre une session, en place.
   *
   * Le SDK recharge l'historique et ajoute les nouveaux tours au **même**
   * `.jsonl` : il n'y a ni fichier à fusionner ni identifiant à réconcilier. Et
   * comme cet identifiant est connu d'avance, le transcript est résoluble dès la
   * création — les panneaux n'attendent pas le premier tour pour se remplir.
   */
  async function startResume(cwdPath: string, sessionId: string): Promise<void> {
    resuming.value = true
    try {
      const { session: created } = await createAgentSession({
        cwd: cwdPath,
        resume: sessionId,
        permissionMode: permissionMode.value,
        ...(model.value ? { model: model.value } : {}),
      })
      gone.value = null
      attach(created.runId)
      session.value = created
      await refreshTranscript()
      seamTurns.value = coveredTurns.value
      autoScroll.value = true
      await scrollToBottom()
    } catch (e) {
      fail(e)
    } finally {
      resuming.value = false
    }
  }

  /**
   * Reprendre celle que l'adresse désigne.
   *
   * Le `cwd` ne se déduit pas du slug : l'encodage remplace tout caractère non
   * alphanumérique par un tiret sans marquer lesquels étaient des séparateurs, et
   * l'inverse est ambigu. On le lit donc dans le transcript, qui le porte tel que
   * la session l'a connu.
   */
  async function resume(): Promise<void> {
    const target = gone.value
    if (!target?.session || !target.slug) return
    resuming.value = true
    try {
      const { transcript } = await readTranscript(target.slug, target.session)
      resuming.value = false
      await startResume(transcript.cwd, target.session)
    } catch (e) {
      resuming.value = false
      fail(e)
    }
  }

  /** Reprendre celle qu'on a choisie dans la liste : le dossier est déjà à l'écran. */
  function resumeSession(id: string): Promise<void> {
    return startResume(cwd.value.trim(), id)
  }

  // ── Les sessions du dossier choisi ──────────────────────────────────────────

  const sessions = ref<TranscriptSummary[]>([])
  const loadingSessions = ref(false)

  /**
   * Cinq : de quoi retrouver ce à quoi on travaillait, pas de quoi tenir un
   * annuaire — la page Projet le fait déjà, et mieux.
   */
  const resumable = computed(() => sessions.value.slice(0, 5))

  /**
   * Le slug du dossier, calculé comme le CLI le calcule.
   *
   * Les deux séparateurs donnent le même résultat — `/` et `\` deviennent tous
   * deux un tiret — donc un chemin collé en barres obliques trouve le même dossier
   * de projet qu'un chemin natif.
   */
  const slugOfCwd = computed(() => cwd.value.trim().replace(/[^A-Za-z0-9]/g, '-'))

  watch(slugOfCwd, async (slug) => {
    sessions.value = []
    if (!slug) return
    loadingSessions.value = true
    try {
      sessions.value = (await getProjectSessions(slug)).sessions
    } catch {
      // Dossier sans historique, ou serveur muet : la liste reste vide et la
      // section le dit. Ouvrir une session neuve n'en dépend pas.
    } finally {
      loadingSessions.value = false
    }
  })

  function pick(path: string): void {
    cwd.value = cwd.value === path ? '' : path
    launchError.value = ''
  }

  /**
   * Le dossier au-dessus. Les deux séparateurs sont acceptés : l'API des projets
   * rend des chemins en barres obliques là où le reste de l'écran en montre des
   * inverses, et couper au mauvais endroit rouvrirait le sélecteur à la racine.
   */
  function parentOf(path: string): string {
    const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    return cut > 2 ? path.slice(0, cut) : ''
  }

  const picking = ref(false)
  /**
   * Le sélecteur natif existe-t-il ici ? On ne le sait qu'en essayant : la
   * réponse dépend de la plateforme du **serveur**, pas de celle du navigateur.
   * On propose donc le bouton, et on le retire pour de bon au premier `501`.
   */
  const pickerAvailable = ref(true)

  async function browse(): Promise<void> {
    picking.value = true
    try {
      // Où s'ouvrir : le dossier déjà choisi, sinon le **parent** du dernier
      // projet travaillé — la racine où les projets se rangent côte à côte.
      // S'ouvrir sur le projet lui-même serait s'ouvrir sur le seul dossier qu'on
      // ne cherche pas ; sur le Bureau, ce serait faire remonter toute une
      // arborescence pour revenir là où l'on était.
      const from = cwd.value.trim() || parentOf(recentProjects.value[0]?.path ?? '')
      const { path } = await pickFolder(from || undefined)
      // `null` = annulation. La moitié des ouvertures d'un sélecteur finit ainsi ;
      // il n'y a rien à dire.
      if (path) {
        cwd.value = path
        launchError.value = ''
      }
    } catch (e) {
      if ((e as { status?: number }).status === 501) pickerAvailable.value = false
      else fail(e)
    } finally {
      picking.value = false
    }
  }

  // ── Le transcript relu, à côté du direct ────────────────────────────────────

  /**
   * Le transcript tel que le disque le porte, avec tout ce que le direct ne sait
   * pas produire : la fenêtre de contexte reconstruite, les runs de sous-agents,
   * les hooks silencieux, les coûts.
   *
   * Le SDK écrit ce fichier lui-même, au même format que le CLI — c'est ce qui
   * rend cette relecture possible et gratuite. On la déclenche à la fin de chaque
   * tour : pendant qu'un tour se déroule, le fichier est en cours d'écriture et
   * n'apprendrait rien de plus que le flux, qui lui va au token près.
   */
  const parsed = ref<ParsedTranscript | null>(null)
  let parsedEtag = ''
  let retry: ReturnType<typeof setTimeout> | null = null

  /**
   * Combien de temps on court après le fichier avant de renoncer.
   *
   * La relance ci-dessous s'entretient elle-même tant que le disque n'a pas
   * rattrapé : sans horizon, une chose que le harnais n'écrirait jamais — une
   * session interrompue au mauvais moment — laisserait un onglet ouvert relire le
   * fichier toutes les 800 ms jusqu'au soir. Trente secondes couvrent très
   * largement le retard mesuré, qui se compte en centaines de millisecondes.
   */
  const CATCHUP_MS = 30_000
  let chaseUntil = 0

  async function refreshTranscript(chasing = false): Promise<void> {
    // Toute relecture demandée par un signal rouvre la fenêtre de poursuite ; une
    // relance, elle, vit dans celle qui l'a ouverte.
    if (!chasing) chaseUntil = Date.now() + CATCHUP_MS
    const s = session.value
    if (!s?.slug || !s.sessionId) return
    try {
      const read = await readTranscript(s.slug, s.sessionId)
      // Une réponse tardive ne doit pas écraser une autre session.
      if (session.value?.sessionId !== s.sessionId) return
      if (!read.etag || read.etag !== parsedEtag || !parsed.value) {
        parsedEtag = read.etag
        parsed.value = read.transcript
      }
    } catch {
      // Les panneaux dérivés se taisent ; le direct, lui, continue de vivre.
    }
    // La couture ne bouge qu'entre deux actions : voir `seamTurns`.
    if (status.value !== 'working') seamTurns.value = coveredTurns.value

    // Le fichier peut n'être pas encore entièrement écrit quand l'action se
    // termine. Tant qu'il n'a pas rattrapé le direct, on redemande — sans quoi le
    // flux montrerait un tour de moins que ce qui vient de s'y passer, ou une
    // compaction de moins.
    if (retry) clearTimeout(retry)
    if (!parsedCovers.value && session.value && Date.now() < chaseUntil) {
      retry = setTimeout(() => void refreshTranscript(true), 800)
    }
  }

  /**
   * Une commande d'arrière-plan qui finit alors que la session ne fait rien.
   *
   * Le harnais écrit sa nouvelle dans le transcript — le fil sait en faire une
   * carte — mais elle tombe dans un angle mort : au repos, plus rien n'est relu,
   * et la carte n'apparaissait qu'au tour suivant, parfois une demi-heure après
   * la chose qu'elle annonce. Mesuré : commande finie à 10:34:49, fil rattrapé à
   * 10:39:43, à l'occasion d'un message qui parlait d'autre chose.
   *
   * Le serveur, lui, l'a vue passer : la liste des shells arrive par le direct.
   * Il suffit de s'en servir comme signal. Pendant une action, rien à faire — la
   * relecture périodique s'en charge déjà.
   */
  watch(
    () => shells.value.filter((s) => s.state !== 'running').length,
    (now, before) => {
      if (now > before && status.value !== 'working') void refreshTranscript()
    },
  )

  /**
   * Une compaction, annoncée par le direct.
   *
   * Même principe que ci-dessus, et le même angle mort : le harnais écrit la
   * frontière, son résumé et la sortie de la commande *après* avoir rendu la main,
   * si bien que la relecture de fin d'action pouvait la manquer d'une seconde. Le
   * fil restait alors sur un fichier d'avant la compaction — la fenêtre s'était
   * vidée, l'écran n'en disait rien, et il fallait recharger la page pour le voir.
   *
   * Le direct, lui, l'annonce sur-le-champ. On s'en sert comme signal, et
   * `parsedCovers` tient la relecture jusqu'à ce que le fichier la porte vraiment.
   */
  watch(
    () => liveEvents.value.filter((e) => e.kind === 'compaction').length,
    (now, before) => {
      if (now > before) void refreshTranscript()
    },
  )

  // L'action est finie : le fichier est complet, on relit.
  watch(status, (now, before) => {
    if (before === 'working' && now !== 'working') void refreshTranscript()
  })

  /**
   * Relire aussi **pendant** l'action, et pas seulement à sa fin.
   *
   * Une action de l'agent n'est pas un aller-retour : une seule consigne peut
   * déclencher huit réponses API enchaînées, plusieurs minutes durant. N'ouvrir le
   * fichier qu'à la fin faisait apparaître d'un bloc tout ce qu'il apporte — le
   * poids de chaque réponse, les hooks, les pistes — quand l'intérêt est justement
   * de les voir venir.
   *
   * Ce que cela met à jour : les panneaux dérivés (fenêtre de contexte, tâches,
   * pistes). Pas la couture de la timeline, qui reste figée le temps de l'action —
   * la déplacer maintenant mettrait du côté disque une réponse en cours d'écriture
   * et ferait disparaître de l'écran ce qui est justement en train de s'y écrire.
   */
  const LIVE_REFRESH_MS = 2500
  let liveRefresh: ReturnType<typeof setInterval> | null = null

  watch(status, (now) => {
    if (liveRefresh) clearInterval(liveRefresh)
    liveRefresh = null
    if (now === 'working') {
      liveRefresh = setInterval(() => void refreshTranscript(), LIVE_REFRESH_MS)
    }
  })

  onUnmounted(() => {
    if (retry) clearTimeout(retry)
    if (liveRefresh) clearInterval(liveRefresh)
  })
  // Le `sessionId` n'arrive qu'avec `init`, donc après le premier prompt : c'est à
  // cet instant que le transcript devient adressable — mais le premier tour est
  // alors en cours. Relire maintenant mettrait un tour *incomplet* du côté disque,
  // et la couture avalerait le direct qui, lui, le montre entièrement. On attend
  // donc la fin du tour, comme partout ailleurs.
  watch(
    () => session.value?.sessionId,
    (id) => {
      if (id && status.value !== 'working') void refreshTranscript()
    },
  )

  // ── Pistes ──────────────────────────────────────────────────────────────────

  const track = ref<TrackId>(MAIN_TRACK)

  /** Les tours humains que le fichier porte déjà. Zéro tant qu'il n'existe pas. */
  const coveredTurns = computed(() => humanTurns(parsed.value?.events ?? []))

  /**
   * Où la couture se pose — et pourquoi ce n'est pas `coveredTurns`.
   *
   * Le fichier est maintenant relu pendant l'action, pour que les panneaux voient
   * venir les réponses au lieu de les découvrir d'un coup. Mais la couture, elle,
   * doit rester où elle était tant que l'action dure : dès que le fichier porte le
   * tour en cours, la suivre reviendrait à afficher côté disque une action en
   * train de s'écrire — et à faire disparaître de l'écran le direct qui, lui, la
   * montre entière. Elle ne se déplace donc qu'entre deux actions.
   */
  const seamTurns = ref(0)

  /** Le disque a-t-il rattrapé le direct ? Sert à savoir s'il faut le redemander. */
  const parsedCovers = computed(() => diskCaughtUp(parsed.value?.events ?? [], liveEvents.value))

  /**
   * Ce que la timeline montre : le passé tel que le disque le porte, prolongé du
   * tour en cours tel que le flux le donne.
   *
   * **Pourquoi le disque.** Le flux du SDK est plus maigre que le fichier que le
   * SDK écrit : ni hooks, ni compactions et leur résumé, ni pièces jointes, ni
   * slash-commands et leur sortie, ni notifications de tâche, ni prompts mis en
   * file, ni tours de sous-agents. Surtout, le fichier porte les **identifiants
   * sur lesquels le reste de l'écran se greffe** : la pastille de contexte d'un
   * tour se retrouve par `context.turns[].uuid`, qui est l'uuid d'une *ligne* du
   * `.jsonl` — jamais l'`id` du message API, sur lequel le traducteur clé ses
   * événements. Une même réponse s'étale d'ailleurs sur plusieurs lignes d'uuid
   * distincts partageant un seul `message.id`. Tant qu'on affiche le direct, cette
   * jointure échoue en silence.
   *
   * **Pourquoi une couture et non une bascule.** Remplacer toute la liste à la fin
   * de chaque tour changeait l'identité de chaque ligne : Vue re-rendait le flux
   * entier, ce qui se voit à l'écran comme un rafraîchissement. Ici le passé garde
   * ses clés — le disque n'est relu qu'entre deux tours, donc il ne bouge pas
   * pendant — et seul le tour qui vient de finir échange ses événements contre
   * ceux du fichier.
   *
   * La couture se pose au (n+1)-ième tour humain, où n est ce que le fichier
   * couvre. C'est le seul repère commun aux deux sources : les identifiants ne
   * sont pas du même espace, les horloges pas de la même origine, et le contenu ne
   * se compare pas. Le calcul lui-même vit dans `replay/seam.ts`, où vitest
   * l'atteint.
   */

  /**
   * Le direct, débarrassé de ce qui appartient à un sous-agent.
   *
   * Le SDK transmet le travail d'un sous-agent dans le même flux que le reste ; le
   * serveur l'estampille (voir `agentOf` dans `translate.ts`), mais il faut encore
   * en tenir compte ici. Sans cela, ses appels d'outil s'affichaient dans le fil
   * principal *pendant* le run, puis une seconde fois dans la piste de l'agent une
   * fois le disque relu — le même travail, montré deux fois, à deux endroits.
   *
   * Le côté disque, lui, est déjà partitionné par le parseur : c'est la même
   * opération, appliquée à la source qui, jusqu'ici, ne la subissait pas.
   */
  const liveMain = computed(() => eventsOfTrack(liveEvents.value, MAIN_TRACK))

  const mainEvents = computed(() => stitch(parsed.value ? eventsOfTrack(parsed.value.events, MAIN_TRACK) : [], liveMain.value, seamTurns.value))

  /** Une piste d'agent n'existe que sur le disque : le flux ne la porte pas. */
  const shownEvents = computed(() => (track.value === MAIN_TRACK ? mainEvents.value : eventsOfTrack(parsed.value?.events ?? [], track.value)))

  /**
   * Le plan de travail, lu sur la même source que le flux.
   *
   * Pas sur le direct systématiquement : `TaskPanel` émet l'uuid du tour où sauter,
   * et un uuid venu d'une source que la timeline n'affiche pas ne désigne rien.
   */
  const tasks = computed(() => trackTasks(mainEvents.value))

  /**
   * Combien de commandes tournent encore.
   *
   * Le titre ne porte que ce chiffre-là : le nombre total dirait surtout combien
   * de sentinelles sont mortes en route, ce qui n'appelle aucune décision.
   */
  const runningShells = computed(() => shells.value.filter((s) => s.state === 'running').length)

  /**
   * La carte du travail : présente dès qu'un de ses deux onglets a de quoi dire.
   *
   * Elle disparaît entièrement sinon. Sur le parc, une session sur cinq lance
   * quelque chose en arrière-plan et toutes ne tiennent pas de plan : une carte
   * vide, ou un onglet vide, apprendrait moins que rien.
   */
  const hasWork = computed(() => tasks.value.tasks.length > 0 || shells.value.length > 0)

  /**
   * L'onglet regardé, ramené sur un onglet qui existe.
   *
   * Les deux sujets n'apparaissent pas ensemble : un plan peut naître longtemps
   * après la première commande d'arrière-plan, et l'inverse est plus courant
   * encore. Sans ce recentrage, la carte s'ouvrirait sur un onglet absent et
   * n'afficherait rien du tout.
   *
   * Le plan passe devant quand les deux existent : c'est lui qui dit où en est le
   * travail demandé, l'arrière-plan ne disant que ce qui tourne encore.
   */
  const workTab = ref<'tasks' | 'shells'>('tasks')

  /**
   * Replié ou non — un choix de lecture, qui ne se souvient pas d'une session à
   * l'autre : rien n'est gardé dans le navigateur, et le suivi est le premier
   * intéressant à voir quand on ouvre un travail.
   */
  const workOpen = ref(true)
  const workPanelsId = useId()

  watch(
    [() => tasks.value.tasks.length, () => shells.value.length],
    ([nbTasks, nbShells]) => {
      if (workTab.value === 'tasks' && !nbTasks && nbShells) workTab.value = 'shells'
      if (workTab.value === 'shells' && !nbShells && nbTasks) workTab.value = 'tasks'
    },
    { immediate: true },
  )

  const trackByUuid = computed(() => trackOfEvent(parsed.value?.events ?? []))

  /**
   * De l'appel d'outil au tour qui le porte.
   *
   * Le panneau d'arrière-plan ne connaît d'une commande que le `tool_use_id` du
   * `Bash` qui l'a lancée — c'est le seul lien entre une ligne et sa carte. La
   * timeline, elle, s'ancre sur l'`uuid` de la ligne de transcript. Sans cette
   * table, le clic cherchait un `toolu_…` parmi des uuid et ne trouvait jamais
   * rien : il ne se passait simplement rien, sans un mot pour le dire.
   */
  const uuidByToolUse = computed(() => {
    const out = new Map<string, string>()
    for (const ev of parsed.value?.events ?? []) for (const block of ev.blocks) if (block.kind === 'tool_use' && block.id) out.set(block.id, ev.uuid)
    return out
  })

  // Une session qui s'arrête laisse une piste sélectionnée qui n'existe plus.
  watch(session, (s) => {
    if (!s) {
      track.value = MAIN_TRACK
      parsed.value = null
      parsedEtag = ''
    }
  })

  /**
   * `/clear` : le transcript change de fichier en cours de route.
   *
   * Le serveur a déjà vidé le fil du direct. Mais la timeline montre aussi le
   * disque, cousu devant lui (`mainEvents`) : sans cette remise à zéro, la
   * conversation qu'on vient d'effacer reviendrait par ce côté-là — et la couture
   * la placerait justement au-dessus du curseur.
   *
   * Le passage de l'identifiant vide au premier `init` traverse ce watch sans
   * conséquence : il n'y a alors rien à oublier.
   */
  watch(
    () => session.value?.sessionId,
    (now, before) => {
      if (!now || !before || now === before) return
      parsed.value = null
      parsedEtag = ''
      seamTurns.value = 0
      track.value = MAIN_TRACK
    },
  )

  // ── Colonne latérale ────────────────────────────────────────────────────────

  const asideTab = ref<'context' | 'resources'>('context')
  const openResource = ref<ResourceNode | null>(null)
  const openSource = ref<ResourceSource>('resource')

  function openResourceNode(node: ResourceNode, source: ResourceSource): void {
    openSource.value = source
    openResource.value = node
  }

  /**
   * La colonne n'apparaît qu'au-delà d'une largeur : en dessous, elle prendrait
   * au flux la place qu'il lui faut pour rester lisible, et le contexte se replie
   * alors dans le tiroir de la barre.
   */
  const asideColumn = ref(false)
  const mql = window.matchMedia('(min-width: 1280px)')
  function onWidth(e: MediaQueryListEvent | MediaQueryList): void {
    asideColumn.value = e.matches
  }
  onWidth(mql)
  mql.addEventListener('change', onWidth)
  onUnmounted(() => mql.removeEventListener('change', onWidth))

  const showAside = computed(() => Boolean(session.value && asideColumn.value))

  // ── Défilement ──────────────────────────────────────────────────────────────

  /**
   * Suivre le bas du flux, ou pas. Un seul état, et il dit la vérité : remonter,
   * c'est cesser de suivre ; redescendre au bas, c'est se remettre à suivre. Le
   * réglage montre cet état et permet de le forcer.
   */
  const autoScroll = ref(true)
  /**
   * Suivre le direct : le tour en cours déplie ses outils et son raisonnement, les
   * tours passés rendent les leurs au repli. Distinct de l'auto-défilement — on
   * peut vouloir voir le détail sans que la vue coure après la fin.
   */
  const followLive = ref(true)

  const scrollEl = ref<HTMLElement | null>(null)
  // Seule la méthode exposée nous intéresse ; `InstanceType` se résoudrait en `any`.
  const timeline = ref<{ scrollToEvent: (uuid: string) => Promise<boolean> } | null>(null)

  /** À moins de ça du bas, on considère que le lecteur veut suivre la suite. */
  const FOLLOW_THRESHOLD_PX = 80

  function onScroll(): void {
    const el = scrollEl.value
    if (!el) return
    autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX
  }

  /** L'utilisateur a manœuvré le réglage : rallumer, c'est demander à revenir en bas. */
  function onFollowToggle(follow: boolean): void {
    if (follow) void scrollToBottom()
  }

  /**
   * Coller le flux au bas — et l'y garder pendant que le contenu grandit.
   *
   * Un `nextTick` ne suffit pas : la timeline monte à sa hauteur brute, puis
   * grandit encore pendant plusieurs images — le markdown se met en forme, la
   * coloration s'applique, un diagramme se dessine. Coller une seule fois laisse
   * le flux à mi-hauteur, d'autant plus haut que le tour est riche.
   *
   * D'où l'observateur : tant que le suivi est demandé, chaque changement de
   * hauteur ramène au bas. Il ne peut pas contrarier le lecteur — remonter éteint
   * `autoScroll` via `onScroll`, et l'observateur se tait aussitôt.
   */
  let pinToBottom: ResizeObserver | null = null

  async function scrollToBottom(): Promise<void> {
    await nextTick()
    const el = scrollEl.value
    if (!el) return
    el.scrollTop = el.scrollHeight

    pinToBottom?.disconnect()
    const content = el.querySelector('.at-timeline')
    if (!content) return
    pinToBottom = new ResizeObserver(() => {
      if (autoScroll.value) el.scrollTop = el.scrollHeight
    })
    pinToBottom.observe(content)
  }

  onUnmounted(() => pinToBottom?.disconnect())

  // Chaque tour allonge le flux : on recolle au bas si le suivi est demandé. On
  // écoute la source affichée, pas le direct — c'est elle qui change aussi quand
  // le disque prend le relais, et c'est justement là que la vue risquerait de
  // sauter. Les deltas de texte ne changent pas l'identité de la liste ;
  // l'observateur de hauteur les rattrape.
  watch(mainEvents, () => {
    if (autoScroll.value) void scrollToBottom()
  })

  /**
   * Sauter au tour qu'un lien du contexte ou du plan désigne, où qu'il soit.
   *
   * Le défilement qui s'ensuit fait passer `onScroll`, qui coupe l'auto-défilement
   * de lui-même — et c'est juste : sauter à un tour ancien, c'est cesser de suivre
   * la fin. En revanche la cible peut être dans une autre piste, où
   * `scrollToEvent` rendrait `false` sans que rien ne bouge : on rebascule avant
   * de sauter, parce que le lecteur a demandé cet endroit-là, pas cette vue-là.
   */
  /**
   * Le tour qui a lancé une commande d'arrière-plan.
   *
   * Le tour n'est sur le disque qu'une fois terminé : cliquer sur la ligne d'un
   * shell lancé à l'instant ne mène donc nulle part, et c'est sans remède ici —
   * il n'y a pas encore de carte où aller.
   */
  async function goToShell(toolUseId: string): Promise<void> {
    const uuid = uuidByToolUse.value.get(toolUseId)
    if (uuid) await goToTurn(uuid)
  }

  async function goToTurn(uuid: string): Promise<void> {
    const target = trackByUuid.value.get(uuid)
    if (target !== undefined && target !== track.value) {
      track.value = target
      await nextTick()
    }
    await timeline.value?.scrollToEvent(uuid)
  }

  // ── Injections pour le fond de la timeline ──────────────────────────────────

  // Où aller chercher la sortie d'un outil que le harness a déversée sur le
  // disque. `null` tant que l'identifiant du SDK manque : les panneaux montrent
  // alors l'aperçu qu'ils portent déjà.
  provide(
    TRANSCRIPT_SOURCE,
    computed(() => {
      const s = session.value
      return s?.slug && s.sessionId ? { slug: s.slug, sessionId: s.sessionId } : null
    }),
  )

  // Ce que la carte d'un appel `Agent` peut dire du run qu'elle a lancé. Elle est
  // montée à quatre étages d'ici : on fournit plutôt que de faire descendre une
  // prop de composant en composant.
  provide(
    AGENT_RUNS,
    computed(() => indexRuns(parsed.value?.events ?? [], parsed.value?.subagents ?? [])),
  )
  provide(OPEN_TRACK, (agentId: string) => {
    track.value = agentId
  })
  provide(
    TASK_INDEX,
    computed(() => taskIndex(tasks.value)),
  )

  // Les outils partis et pas encore revenus, pour que leur carte batte au lieu de
  // s'annoncer « sans résultat ». Voir `runningTools`.
  provide(
    RUNNING_TOOLS,
    computed(() => new Set(activity.value.tools.map((t) => t.id))),
  )

  // ── Cycle de vie de la session ──────────────────────────────────────────────

  function fail(e: unknown): void {
    notifyError(e)
  }

  async function launch(): Promise<void> {
    launching.value = true
    launchError.value = ''
    try {
      // Sans `prompt` : le serveur crée le runner et n'appelle pas le SDK. La
      // session existe, ne coûte rien, et attend le premier message du composer.
      const { session: created } = await createAgentSession({
        cwd: cwd.value.trim(),
        ...(model.value ? { model: model.value } : {}),
        permissionMode: permissionMode.value,
      })
      // On s'abonne après création : le premier message du flux est un instantané
      // complet, donc rien de ce qui s'est passé entre-temps n'est perdu.
      attach(created.runId)
      session.value = created
    } catch (e) {
      launchError.value = e instanceof Error ? e.message : t('pages.atelier.launchError')
    } finally {
      launching.value = false
    }
  }

  async function say(prompt: string, attachments: PromptAttachment[] = []): Promise<void> {
    const runId = session.value?.runId
    if (!runId) return
    try {
      await sendPrompt(runId, prompt, attachments)
      autoScroll.value = true
      await scrollToBottom()
    } catch (e) {
      fail(e)
    }
  }

  /**
   * Changer de modèle ou de mode en cours de session.
   *
   * Le serveur pousse la session mise à jour en SSE : on ne touche pas à l'état
   * local, sinon un échec laisserait l'écran affirmer un réglage qui ne s'applique
   * pas — et un second onglet ne le verrait pas changer.
   */
  async function changePermissionMode(value: string): Promise<void> {
    const runId = session.value?.runId
    if (!runId) return
    try {
      await setSessionPermissionMode(runId, value)
    } catch (e) {
      fail(e)
    }
  }

  async function interrupt(): Promise<void> {
    const runId = session.value?.runId
    if (!runId) return
    try {
      await interruptSession(runId)
    } catch (e) {
      fail(e)
    }
  }

  async function stop(): Promise<void> {
    const runId = session.value?.runId
    if (!runId) return
    try {
      await stopSession(runId)
    } catch (e) {
      fail(e)
    }
    detach()
    session.value = null
  }

  /**
   * Répondre à une demande.
   *
   * Un `410` veut dire qu'elle a déjà été tranchée — par un autre onglet, par
   * l'échéance, par une interruption. Le flux retirera le bandeau de lui-même ;
   * afficher une erreur ferait passer un cas normal pour une panne.
   */
  async function respondPermission(id: string, answer: PermissionAnswer): Promise<void> {
    const runId = session.value?.runId
    if (!runId) return
    answering.value = true
    try {
      await answerPermission(runId, id, answer)
    } catch (e) {
      if ((e as { status?: number }).status !== 410) fail(e)
      permissions.value = permissions.value.filter((p) => p.id !== id)
    } finally {
      answering.value = false
    }
  }

  async function respondAsk(id: string, answers: Record<string, string>, notes: string): Promise<void> {
    const runId = session.value?.runId
    if (!runId) return
    answering.value = true
    try {
      await answerAsk(runId, id, answers, notes)
    } catch (e) {
      if ((e as { status?: number }).status !== 410) fail(e)
      asks.value = asks.value.filter((a) => a.id !== id)
    } finally {
      answering.value = false
      delete drafts[id]
    }
  }

  // ── Le dialogue de réponse ──────────────────────────────────────────────────

  const askOpen = ref(false)
  const askReminder = useTemplateRef<HTMLElement>('askReminder')

  /**
   * La question qu'on traite : la première arrivée.
   *
   * Deux appels d'outil parallèles peuvent en poser deux ; on répond dans l'ordre
   * plutôt que d'empiler deux formulaires, et le rappel dit combien attendent.
   */
  const currentAsk = computed(() => asks.value[0] ?? null)

  /**
   * Les réponses en cours, par question.
   *
   * Elles vivent ici et non dans le formulaire : refermer le dialogue le démonte,
   * et perdre un choix à demi fait parce qu'on est allé relire la conversation
   * retirerait tout l'intérêt du bouton qui referme.
   */
  const drafts = reactive<Record<string, AskDraft>>({})

  function draftFor(ask: AskRequest): AskDraft {
    const existing = drafts[ask.id]
    if (existing) return existing
    const fresh: AskDraft = {
      picks: ask.questions.map((q) => (q.multiSelect ? [] : '')),
      notes: '',
      step: 0,
    }
    drafts[ask.id] = fresh
    return fresh
  }

  const currentDraft = computed<AskDraft>({
    get: () => (currentAsk.value ? draftFor(currentAsk.value) : { picks: [], notes: '', step: 0 }),
    set: (v) => {
      if (currentAsk.value) drafts[currentAsk.value.id] = v
    },
  })

  // Une question qui arrive ouvre le dialogue — c'est ce qui bloque l'agent. Une
  // question qui repart (répondue, expirée, session arrêtée) le referme.
  watch(
    () => asks.value.length,
    (now, before) => {
      if (now > (before ?? 0)) askOpen.value = true
      else if (!now) askOpen.value = false
    },
  )

  /** Refermer rend la main au rappel, qui est ce qui rouvre. */
  function onAskHide(): void {
    void nextTick(() => askReminder.value?.focus())
  }
</script>

<style scoped>
  .at {
    display: flex;
    flex-direction: column;
    padding: var(--space-lg);
    width: 100%;
    min-height: 0;
  }

  /* Le socle ne normalise pas les titres : sans cela, un `h2` reprend le corps
   par défaut du navigateur et écrase la hiérarchie de la page. */
  .at h2 {
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text);
    margin: 0;
  }

  /* ── Écran d'ouverture ───────────────────────────────────────────────────── */

  .at-open {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    max-width: var(--page-max);
    margin: 0 auto;
    width: 100%;
    /* La barre de statut est fine et collée en haut : sans cette respiration, la
     première carte lui touche le bord et l'écran commence en butée. */
    padding-top: var(--space-md);
  }

  .at-intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .at-gone {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    color: var(--muted);
  }

  .at-gone p {
    margin: 0;
    flex: 1;
    min-width: 0;
    font-size: var(--fs-sm);
  }

  .at-title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text);
  }

  .at-lead {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--muted);
    max-width: 62ch;
  }

  /* `.surface-card` ne donne que le fond, le rayon et l'arête : le rembourrage
   appartient à la page. Même valeur que les autres écrans, pour que les blocs de
   l'Atelier ne respirent ni plus ni moins que ceux des Plugins ou des Réglages. */
  .at-where,
  .at-live-open,
  .at-composer {
    padding: var(--space-lg) var(--space-xl);
  }

  .at-live-open {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  /* Le bouton d'arrêt en bout de ligne, l'entrée prenant tout le reste : la cible
   de reprise doit rester large, c'est le geste courant des deux. */
  .at-live-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .at-live-row .at-session {
    flex: 1;
    min-width: 0;
  }

  /* Cadré ici plutôt que sur `.at-session-meta`, que la liste « Reprendre »
   partage : elle n'a pas de pastille à aligner. */
  .at-live-row .at-session-meta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .at-where {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .at-projects {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-sm);
  }

  .at-project {
    width: 100%;
    height: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-md) var(--space-lg);
    background: var(--surface-2);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: inherit;
    cursor: pointer;
    transition:
      background var(--motion-fast),
      border-color var(--motion-fast);
  }

  .at-project:hover {
    background: var(--surface-3);
  }

  .at-project:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .at-project--on {
    border-color: var(--brand-line);
    background: var(--brand-soft);
  }

  .at-project-name {
    font-size: var(--fs-base);
    color: var(--text);
  }

  .at-project-path {
    font-size: var(--fs-2xs);
    color: var(--dim);
    overflow-wrap: anywhere;
  }

  .at-project-meta {
    font-size: var(--fs-2xs);
    color: var(--faint);
    margin-top: var(--space-xs);
  }

  .at-pick {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .at-pick-field {
    flex: 1;
    min-width: 0;
  }

  .at-picking {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--muted);
  }

  .at-resume {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    border-top: 1px solid var(--line);
    padding-top: var(--space-md);
  }

  .at-resume-head {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--muted);
  }

  .at-resume-empty {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--faint);
  }

  .at-sessions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .at-session {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    color: inherit;
    cursor: pointer;
    transition:
      background var(--motion-fast),
      border-color var(--motion-fast);
  }

  .at-session:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--brand-line);
  }

  .at-session:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .at-session:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .at-session-title {
    font-size: var(--fs-sm);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .at-session-meta {
    font-size: var(--fs-2xs);
    color: var(--faint);
  }

  .at-options {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-md) var(--space-lg);
  }
  /* Le libellé au-dessus de ses puces, et non flottant dans un champ : une barre
   de segments n'a pas de bordure où le poser. */
  .at-option {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    min-width: 0;
  }
  .at-option-label {
    font-size: var(--fs-xs);
    color: var(--muted);
  }
  /* Le bouton d'ouverture pousse au bout de la rangée, où il conclut le geste. */
  .at-options > .q-btn {
    margin-left: auto;
  }

  /* Étroit : chaque groupe prend sa ligne, et le bouton la sienne — il ne reste
   plus de place à sa droite pour qu'il y flotte. */
  @media (max-width: 720px) {
    .at-option {
      width: 100%;
    }
    .at-options > .q-btn {
      margin-left: 0;
      width: 100%;
    }
  }

  /* ── Session ─────────────────────────────────────────────────────────────── */

  /* La page devient un cadre : c'est le flux qui défile, à l'intérieur. */
  .at--live {
    overflow: hidden;
  }

  .at-live {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-lg);
  }

  .at-live--aside {
    grid-template-columns: minmax(0, 1fr) 380px;
  }

  .at-main {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .at-bar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
    /* Moins haute que les autres cartes : c'est une barre, pas une section. */
    padding: var(--space-sm) var(--space-lg);
  }

  .at-toggle {
    font-size: var(--fs-xs);
    color: var(--muted);
  }

  .at-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dim);
    flex: none;
  }

  .at-dot--working {
    background: var(--pulse);
  }

  .at-dot--waiting {
    background: var(--brand);
  }

  .at-dot--failed {
    background: var(--danger);
  }

  /* Un lien rompu n'est pas une session en erreur : elle travaille peut-être
   encore, c'est nous qui ne la voyons plus. D'où l'ambre et non le rouge. */
  .at-dot--lost {
    background: var(--warn);
  }

  .at-status {
    font-size: var(--fs-sm);
    color: var(--text);
  }

  /* Un nom de dossier ne se coupe pas en deux : s'il déborde, il s'abrège, et
   l'infobulle porte le chemin entier. */
  .at-cwd {
    font-size: var(--fs-xs);
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Une puce, pas une note de bas de page : c'est qui travaille. Même forme que
   `.at-resumed`, en neutre — l'une signale un fait rare, l'autre est permanente. */
  .at-model {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--fs-2xs);
    color: var(--muted);
    background: var(--surface-3);
    border-radius: var(--radius-xs);
    padding: 1px var(--space-xs);
    flex: none;
  }

  .at-resumed {
    font-size: var(--fs-2xs);
    color: var(--brand);
    background: var(--brand-soft);
    border-radius: var(--radius-xs);
    padding: 1px var(--space-xs);
    flex: none;
  }

  /* Prévu, pas encore confirmé par le SDK : la puce est là dès l'ouverture, en
   retrait, et reprend sa couleur quand le premier tour l'a confirmée. */
  .at-model--planned {
    color: var(--dim);
  }

  /* Les quatre modes tiennent leur place, et le nom du projet prend le reste. Sans
   `flex: none`, la barre les comprimerait au premier titre un peu long. */
  .at-live-modes {
    flex: none;
  }

  .at-cwd {
    flex: 1;
    min-width: 0;
  }

  /* Le seul conteneur qui défile de tout l'écran. */
  .at-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-right: var(--space-xs);
  }

  .at-empty {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--dim);
  }

  /*
  Le pied est un frère du flux, pas un calque au-dessus. C'est ce qui garantit
  qu'aucun message ne passe derrière la zone de saisie.
*/
  .at-foot {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    flex: none;
  }

  /* Une demande longue ne doit pas pousser la saisie hors de l'écran. */
  .at-foot > :not(.at-composer) {
    max-height: 40vh;
    overflow-y: auto;
  }

  /* Le rappel d'une question refermée : une ligne, la même encre que la demande
   qu'elle remplace, et de quoi la rouvrir. */
  .at-ask-reminder {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-lg);
    border: 1px solid var(--line-3);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    font-size: var(--fs-sm);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease;
  }
  .at-ask-reminder:hover,
  .at-ask-reminder:focus-visible {
    background: var(--surface-2);
    border-color: var(--brand-line);
  }
  .at-ask-reminder > .q-icon {
    color: var(--brand);
  }
  .at-ask-reminder-cta {
    margin-left: auto;
    font-size: var(--fs-xs);
    color: var(--brand);
  }

  /* Le dialogue de réponse : large, parce qu'une maquette ASCII a une largeur
   propre — et c'est elle qui commande. À 960 px, une centaine de colonnes de
   mono tiennent sans que le bloc défile chez lui ; en dessous, on comparait des
   maquettes en les faisant glisser une à une. Haut sans dépasser : c'est le
   dialogue qui défile, pas la page.

   La largeur ne suffit pas ici : Quasar plafonne ses dialogues, et le plafond
   se lève dans le bloc non scopé plus bas. */
  .at-ask-card {
    width: 960px;
    max-width: 94vw;
    max-height: 85vh;
    overflow-y: auto;
    padding: var(--space-lg) var(--space-xl);
  }

  .at-error {
    margin: var(--space-sm) 0 0;
    font-size: var(--fs-xs);
    color: var(--danger);
  }

  /* ── Colonne latérale ────────────────────────────────────────────────────── */

  .at-aside {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: 2px;
  }

  .at-panel {
    position: relative;
    min-width: 0;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    /* La carte porte l'arrondi, son dernier enfant défile : sans découpe, une
     sortie de shell passe sous les angles du bas et mord le bord. */
    overflow: hidden;
  }

  /*
 * Le voile du bas.
 *
 * Une zone qui défile coupe sa dernière ligne en deux, et une demi-ligne posée
 * sur le bord de la carte se lit comme un défaut d'affichage plutôt que comme
 * « ça continue ». Mesuré sur une sortie de shell : le pavé finit à moins d'un
 * pixel du bord, sans rien pour l'annoncer.
 *
 * Sur la carte et non sur la zone : un pseudo-élément posé dans un conteneur
 * qui défile défilerait avec lui, et le voile quitterait le bas dès le premier
 * glissement.
 */
  .at-panel::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: var(--space-md);
    background: linear-gradient(to top, var(--surface), transparent);
    pointer-events: none;
  }

  /* Le suivi s'en tient à sa taille et laisse le reste au contexte. */
  .at-panel--tasks {
    flex: none;
    max-height: 40%;
  }

  /* Replié, il ne pèse plus que sa barre d'onglets — donc plus de voile du bas,
   qui n'annoncerait plus rien à faire défiler. */
  .at-panel--folded::after {
    content: none;
  }

  .at-work-head {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--line);
  }
  .at-work-head .at-tabs {
    min-width: 0;
    flex: 1;
    border-bottom: 0;
  }
  .at-work-fold {
    flex: none;
    align-self: center;
    margin-right: var(--space-xs);
    color: var(--muted);
  }

  .at-panel-title {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin: 0;
    /* Un cran plus serré que la carte : l'en-tête nomme, il n'expose pas. Le
     large réservait à un titre de deux mots l'air d'une section entière.
     La hauteur, elle, ne venait pas du rembourrage : Quasar impose aux `h2`
     un `line-height` de 60 px, dont seule la taille de police avait été
     reprise — 69 px de haut pour une ligne de 15 px. */
    padding: var(--space-xs) var(--space-md);
    line-height: 1.4;
    border-bottom: 1px solid var(--line);
  }

  .at-panel-count {
    font-size: var(--fs-xs);
    color: var(--dim);
  }

  .at-panel-scroll {
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-sm) var(--space-lg) var(--space-md);
  }

  .at-panel-empty {
    margin: 0;
    padding: var(--space-lg);
    font-size: var(--fs-sm);
    color: var(--dim);
  }

  .at-tabs {
    border-bottom: 1px solid var(--line);
    color: var(--muted);
  }

  /* Quasar empile le contenu d'un onglet — prévu pour une icône au-dessus d'un
   libellé. Le compteur n'est pas une icône : il se lit à côté du nom, comme il
   le faisait dans le titre de carte qu'il remplace. */
  .at-tabs :deep(.q-tab__content) {
    flex-direction: row;
    gap: var(--space-xs);
  }

  .at-tabpanels {
    min-height: 0;
    flex: 1;
    background: transparent;
  }

  /*
 * Un onglet de la carte du travail ne met rien autour de son contenu : c'est la
 * zone qui défile, à l'intérieur, qui porte le rembourrage — sinon celui de
 * Quasar s'ajoute au sien et la sortie d'un shell perd deux crans de largeur.
 */
  .at-tabpanel {
    min-height: 0;
    padding: 0;
  }
  .at-tabpanel :deep(.q-panel) {
    display: flex;
    flex-direction: column;
  }
</style>

<style lang="scss">
  /* Le plafond des dialogues de Quasar — `max-width: 560px` au-delà de 600 px de
   large — est plus fort que la largeur posée sur la carte, et il vit hors de
   l'arbre scopé : le dialogue est téléporté dans `<body>`.

   560 px, c'est une soixantaine de colonnes de mono : une maquette ASCII y
   défile horizontalement, et comparer deux options revient alors à les faire
   glisser l'une après l'autre. On lève le plafond pour ce dialogue-là seulement ;
   la carte reprend la main, avec son propre repli en `vw`. */
  .q-dialog.at-ask-dialog .q-dialog__inner--minimized > div {
    max-width: 960px;
  }
</style>
