<template>
  <q-layout view="hHh lpR lFf">
    <a href="#main-content" class="skip-link">{{ t('layout.skipToContent') }}</a>

    <q-header class="statusbar">
      <div class="statusbar-inner">
        <!-- Left: brand + breadcrumb -->
        <div class="sb-left">
          <router-link to="/" class="sb-brand" aria-label="AURA — launchpad">
            <!-- La marque est le premier instrument de la barre : elle respire
                 quand une session travaille, s'éteint quand le lien est rompu.
                 Muette pour les lecteurs d'écran — les deux états sont déjà dits
                 en toutes lettres dans le cluster système, à droite. -->
            <span class="brand-sigil" :class="brandState" aria-hidden="true">
              <span class="brand-mark" />
            </span>
            <span class="brand-title">AURA</span>
          </router-link>
          <nav v-if="crumbs.length" class="sb-crumbs" :aria-label="t('layout.breadcrumb')">
            <template v-for="(c, i) in crumbs" :key="i">
              <q-icon name="chevron_right" size="16px" class="sb-sep" aria-hidden="true" />
              <router-link v-if="c.to" :to="c.to" class="sb-crumb sb-crumb--link">{{ c.label }}</router-link>
              <span v-else class="sb-crumb" aria-current="page">{{ c.label }}</span>
            </template>
          </nav>
        </div>

        <!-- Right: live system cluster -->
        <div class="sb-right font-mono">
          <span class="sb-stat" :title="system.connected ? t('layout.connection.onlineTitle') : t('layout.connection.offlineTitle')">
            <!-- Le lien est sondé à chaque navigation : sa pastille décrit bien
                 un état vivant, pas une configuration — elle respire. -->
            <span class="status-dot" :class="system.connected ? 'status-dot--pulse status-dot--live' : ''" aria-hidden="true" />
            {{ system.connected ? t('layout.connection.online') : t('layout.connection.offline') }}
          </span>
          <!-- Instrumentation vivante : la seule chose de cette barre qui change
               d'elle-même. Muette quand rien ne tourne — un compteur à zéro
               affiché en permanence n'apprend rien et dilue le reste. -->
          <router-link v-if="activeCount" :to="{ name: 'sessions' }" class="sb-stat sb-live" :aria-label="t('layout.live.open', activeCount)">
            <span class="status-dot status-dot--pulse status-dot--live" aria-hidden="true" />
            {{ t('layout.live.count', { n: activeCount }) }}
            <q-tooltip anchor="top middle" self="bottom middle">{{ liveHint }}</q-tooltip>
          </router-link>
          <span v-if="system.version" class="sb-stat sb-ver">v{{ system.version }}</span>
          <span class="sb-stat sb-path">{{ shortDir }}</span>
          <q-btn
            v-if="!isManual"
            flat
            dense
            round
            size="sm"
            icon="help_outline"
            class="sb-help"
            :class="{ 'sb-help--on': helpOpen }"
            aria-controls="help-drawer"
            :aria-expanded="helpOpen"
            :aria-label="helpLabel"
            @click="toggleHelp()"
          >
            <q-tooltip>{{ helpLabel }}</q-tooltip>
          </q-btn>
          <q-btn
            flat
            dense
            round
            size="sm"
            :icon="settings.darkMode ? 'light_mode' : 'dark_mode'"
            :aria-label="settings.darkMode ? t('layout.theme.toLight') : t('layout.theme.toDark')"
            @click="settings.darkMode = !settings.darkMode"
          >
            <q-tooltip>{{ settings.darkMode ? t('layout.theme.light') : t('layout.theme.dark') }}</q-tooltip>
          </q-btn>
          <q-btn flat dense round size="sm" icon="translate" class="sb-lang" :aria-label="t('layout.locale.switch')" @click="toggleLocale">
            <q-tooltip>{{ t('layout.locale.switch') }}</q-tooltip>
          </q-btn>
        </div>
      </div>
    </q-header>

    <HelpDrawer id="help-drawer" />

    <q-page-container id="main-content">
      <!-- La clé est le chemin, pas le composant.

           Sans elle, Vue Router réutilise l'instance quand seuls les paramètres
           changent : passer d'un projet à l'autre, ou d'une session à l'autre,
           gardait à l'écran les données du précédent — la page ne recharge qu'au
           montage, et il n'y en avait pas de second.

           Le chemin, et non `fullPath` : la page Sessions et la page Aide
           écrivent leur sélection dans la query (`?sel=`, `?s=`), et se
           remonteraient à chaque clic. -->
      <router-view v-slot="{ Component }">
        <transition name="module" mode="out-in">
          <component :is="Component" :key="$route.path" />
        </transition>
      </router-view>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
  import HelpDrawer from '@/components/help/HelpDrawer.vue'
  import { useBreadcrumbs, type Crumb } from '@/composables/useBreadcrumbs'
  import { useHelp, toggleHelp, unpinHelp } from '@/composables/useHelp'
  import { sectionForRoute } from '@/help'
  import { routeTitle, documentTitle } from '@/router/titles'
  import { useSettingsStore } from '@/stores/settings'
  import { useSystemStore } from '@/stores/system'
  import { computed, onMounted, onUnmounted, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRoute } from 'vue-router'

  const { t } = useI18n()
  const settings = useSettingsStore()
  const system = useSystemStore()
  const route = useRoute()

  // Deux langues : la bascule est une bascule, pas une liste à dérouler. Le jour
  // où il y en aura une troisième, ce bouton devient un menu — pas avant.
  function toggleLocale(): void {
    settings.locale = settings.locale === 'fr' ? 'en' : 'fr'
  }
  const { override } = useBreadcrumbs()
  const { open: helpOpen } = useHelp()

  const isHome = computed(() => route.name === 'home')
  // The manual documents every screen, so a contextual drawer over it is noise.
  const isManual = computed(() => route.name === 'help')

  // Naming the target screen turns a generic "?" into a promise of what opens.
  const helpLabel = computed(() => {
    if (helpOpen.value) return t('layout.help.close')
    const s = sectionForRoute(route.name)
    return s ? t('layout.help.forSection', { section: s.title }) : t('layout.help.generic')
  })

  // Default trail derived from the route name; a page may override it (e.g. to
  // inject a project or session label) via setBreadcrumbs().
  const crumbs = computed<Crumb[]>(() => {
    if (override.value) return override.value
    if (isHome.value) return []
    return [{ label: routeTitle(route.name) || 'AURA' }]
  })

  // Le titre de l'onglet dit ce que dit le fil d'Ariane. Le suivre plutôt que la
  // route donne gratuitement les libellés dynamiques : une page qui apprend le nom
  // de son projet le pousse dans le fil, et l'onglet le reprend au même instant.
  watch(
    crumbs,
    (trail) => {
      document.title = documentTitle(trail.map((c) => c.label))
    },
    { immediate: true },
  )
  const shortDir = computed(() => {
    const parts = system.claudeDir.replace(/\\/g, '/').split('/').filter(Boolean)
    const last = parts[parts.length - 1]
    return last ? `~/${last}` : system.claudeDir
  })

  // ── Sessions en cours ────────────────────────────────────────────────────────
  // Ce layout tient le sondage parce qu'il est le seul composant monté sur tous
  // les écrans : le store porte la donnée, plusieurs surfaces la lisent, mais un
  // seul timer interroge le BFF.
  const SESSIONS_POLL_MS = 5000
  const activeCount = computed(() => system.activeSessions.length)
  // Détaille ce que recouvre le compteur — « en attente » n'est pas « occupée » :
  // l'une avance seule, l'autre réclame une action.
  const liveHint = computed(() => {
    const busy = system.activeSessions.filter((s) => s.status === 'busy').length
    const waiting = activeCount.value - busy
    const parts = []
    if (busy) parts.push(t('layout.sessions.busy', busy))
    if (waiting) parts.push(t('layout.sessions.waiting', { n: waiting }))
    return parts.join(' · ')
  })

  // Trois états, et un seul à la fois : hors ligne l'emporte, parce qu'un compteur
  // de sessions hérité du dernier sondage réussi ne dit plus rien de vivant.
  const brandState = computed(() => {
    if (!system.connected) return 'brand-sigil--offline'
    return activeCount.value ? 'brand-sigil--live' : ''
  })

  let sessTimer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    void system.refresh()
    void system.refreshSessions()
    sessTimer = setInterval(() => void system.refreshSessions(), SESSIONS_POLL_MS)
  })
  onUnmounted(() => {
    if (sessTimer) clearInterval(sessTimer)
  })
  // Refresh liveness on navigation (cheap, keeps the dot honest). Le fil d'Ariane,
  // lui, est remis à zéro par le routeur — voir src/router/index.ts.
  watch(
    () => route.fullPath,
    () => {
      // Drop any pinned help section so an open drawer tracks the new screen.
      unpinHelp()
      void system.refresh()
    },
  )
</script>

<style scoped lang="scss">
  .statusbar {
    background: var(--topbar-bg);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
    box-shadow: none;
    color: var(--text);
  }
  .statusbar-inner {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-md);
    gap: var(--space-md);
  }

  .sb-left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-width: 0;
  }
  .sb-brand {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    text-decoration: none;
    color: inherit;
  }
  // Enveloppe non dessinée : elle n'existe que pour porter le halo. Le losange
  // garde sa rotation, le halo ne la subit pas — un disque n'a pas d'orientation,
  // mais laisser la rotation au seul élément dessiné évite d'y penser plus tard.
  .brand-sigil {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }
  // Même grammaire que .status-dot--live (voir app.scss) : un halo diffus qui naît
  // de l'invisible, s'épanouit, s'efface, puis marque une pause. Même période et
  // même courbe d'opacité — deux respirations désaccordées dans la même barre se
  // liraient comme un défaut.
  //
  // Ce qui diffère, et pourquoi : la pastille fait 7px, le losange 13 (18 sur sa
  // diagonale). Repris tel quel, le dégradé de la pastille tombait à 0,11 d'alpha
  // au bord de la marque contre 0,32 au bord du point — invisible. D'où un cœur
  // plein jusqu'à 30 % (masqué derrière le losange, il ne sert qu'à décaler le
  // début de la chute) et une amplitude d'échelle resserrée : une barre de 40px ne
  // peut pas contenir l'expansion de 1,45× de la pastille sans déborder sur la
  // page.
  .brand-sigil--live::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 38px;
    height: 38px;
    margin: -19px 0 0 -19px;
    border-radius: 999px;
    background: radial-gradient(circle, var(--brand) 30%, transparent 72%);
    pointer-events: none;
    // `transform` et `opacity` seulement : les deux s'animent sur le compositeur.
    animation: brand-halo 3s ease-in-out infinite;
  }
  @keyframes brand-halo {
    0% {
      transform: scale(0.85);
      opacity: 0;
    }
    40% {
      transform: scale(1);
      opacity: 0.55;
    }
    75%,
    100% {
      transform: scale(1.12);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    // Le losange se fige, il ne disparaît pas : la marque reste la marque.
    .brand-sigil--live::after {
      animation: none;
      opacity: 0;
    }
  }

  .brand-mark {
    width: 13px;
    height: 13px;
    position: relative;
    background: var(--brand);
    border-radius: var(--radius-xs);
    transform: rotate(45deg);
    flex: 0 0 auto;
    box-shadow: 0 0 8px var(--brand-line);
    transition:
      background var(--motion-base),
      box-shadow var(--motion-base);
    &::after {
      content: '';
      position: absolute;
      inset: 3px;
      background: var(--bg);
      border-radius: 3px;
    }
    // Le noyau, comme dans public/icons/favicon.svg : la marque de la barre et
    // l'icône de l'app sont le même dessin à deux échelles. Il passe devant le
    // creux — sans z-index, ::after le recouvrirait, étant peint après.
    &::before {
      content: '';
      position: absolute;
      inset: 5px;
      z-index: 1;
      background: var(--brand);
      border-radius: 1px;
      transition: background var(--motion-base);
    }
  }
  // Hors ligne : l'anneau perd sa couleur et sa lueur, le noyau se vide. Il reste
  // un contour — la marque est toujours là, mais elle ne sait plus rien.
  .brand-sigil--offline .brand-mark {
    background: var(--faint);
    box-shadow: none;
    &::before {
      background: transparent;
    }
  }
  .brand-title {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--brand);
  }
  .sb-sep {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .sb-crumbs {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
  }
  .sb-crumb {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
  }
  .sb-crumb--link {
    color: var(--muted);
    font-weight: 500;
    text-decoration: none;
    transition: color var(--motion-fast);
  }
  .sb-crumb--link:hover {
    color: var(--brand);
  }
  /* Last crumb may be long (project name) — let it shrink with an ellipsis. */
  .sb-crumbs .sb-crumb:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sb-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--muted);
  }
  .sb-stat {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--fs-xs);
    white-space: nowrap;
  }
  .sb-ver {
    color: var(--dim);
  }
  .sb-path {
    color: var(--dim);
  }
  /* Le seul élément vivant de la barre : il se distingue du reste, qui est
   statique et volontairement en retrait. */
  .sb-live {
    gap: var(--space-sm);
    color: var(--text);
    text-decoration: none;
    padding: 2px var(--space-sm);
    border-radius: var(--radius-xs);
    border: 1px solid var(--glow-line);
    background: var(--glow-soft);
    transition: background var(--motion-fast);
  }
  .sb-live:hover {
    background: color-mix(in srgb, var(--glow-hue) 20%, transparent);
  }
  /* The help button stays lit while its drawer is open. */
  .sb-help--on {
    color: var(--brand);
  }
  @media (max-width: 640px) {
    .sb-path,
    .sb-ver {
      display: none;
    }
  }

  /* Module enter/leave transition — subtle rise + fade. */
  .module-enter-active,
  .module-leave-active {
    transition:
      opacity var(--motion-base) ease,
      transform var(--motion-base) ease;
  }
  .module-enter-from {
    opacity: 0;
    transform: translateY(6px);
  }
  .module-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
</style>
