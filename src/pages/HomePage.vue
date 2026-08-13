<template>
  <q-page class="hud">
    <h1 class="sr-only">{{ t('nav.home') }}</h1>

    <div class="backdrop-grid" aria-hidden="true"></div>

    <div class="hud-frame">
      <!-- ── Cœur : les trois éléments vitaux ──────────────────────────────
           Placé en premier dans le document : c'est ce qu'un lecteur d'écran
           doit rencontrer d'abord, et c'est aussi ce qui doit rester en tête
           quand la mise en page retombe sur une colonne. -->
      <div class="hud-core">
        <div class="hud-ident">
          <div class="hud-kicker font-mono">{{ t('pages.home.kicker') }}</div>
          <div class="hud-title">AURA</div>
          <p class="hud-desc">
            <i18n-t keypath="pages.home.desc" scope="global">
              <template #path>
                <span class="font-mono">~/.claude</span>
              </template>
            </i18n-t>
          </p>
        </div>

        <!-- Deux points d'entrée d'égale importance : consulter (Projets) et
             agir (Atelier). Traités à l'identique pour que la paire se lise
             comme un seul bloc, et non comme un bouton greffé après coup. -->
        <div class="hud-primaries">
          <router-link
            v-for="p in primaries"
            :key="p.name"
            :to="{ name: p.name }"
            class="hud-primary surface-card--braced"
          >
            <span class="hud-primary-icon"><q-icon :name="p.icon" size="26px" /></span>
            <span class="hud-primary-name">{{ p.label }}</span>
            <span class="hud-primary-hint">{{ p.hint }}</span>
            <span class="hud-primary-cta font-mono">
              {{ p.cta }}
              <q-icon name="arrow_forward" size="16px" class="hud-arrow" aria-hidden="true" />
            </span>
          </router-link>
        </div>

        <!-- Sessions Claude Code en cours — accès direct au flux live. -->
        <aside class="hud-sessions surface-card" aria-labelledby="hud-sessions-title">
          <div class="hud-sessions-head">
            <span
              class="status-dot"
              :class="hasActive ? 'status-dot--pulse status-dot--live' : ''"
              aria-hidden="true"
            />
            <span id="hud-sessions-title" class="hud-sessions-label font-mono">
              {{ t('pages.home.sessionsLabel') }}
            </span>
            <span class="hud-sessions-count font-mono">{{ sessions.length }}</span>
          </div>
          <ul v-if="sessions.length" class="hud-sessions-list">
            <li v-for="s in sessions.slice(0, 3)" :key="s.sessionId">
              <router-link class="hud-sess" :to="{ name: 'sessions', query: { sel: s.sessionId } }">
                <span
                  class="status-dot"
                  :class="isActive(s) ? 'status-dot--pulse status-dot--live' : ''"
                  aria-hidden="true"
                />
                <span class="hud-sess-name">{{ sessionLabel(s) }}</span>
                <span class="hud-sess-status font-mono">{{ s.status ?? '' }}</span>
                <q-icon name="arrow_forward" size="14px" class="hud-arrow" aria-hidden="true" />
              </router-link>
            </li>
          </ul>
          <EmptyState v-else pad="none" :message="t('pages.home.noSession')" />
          <router-link :to="{ name: 'sessions' }" class="hud-sessions-foot font-mono">
            <span v-if="sessions.length > 3">
              {{ t('pages.home.sessionsMore', { n: sessions.length - 3 }) }}
            </span>
            <span v-else>{{ t('pages.home.sessionsAll') }}</span>
            <q-icon name="arrow_forward" size="14px" class="hud-arrow" aria-hidden="true" />
          </router-link>
        </aside>
      </div>

      <!-- ── Flancs : les modules, posés sur deux arcs ────────────────────── -->
      <section
        v-for="(group, gi) in groups"
        :key="group.id"
        class="hud-flank"
        :class="`hud-flank--${group.side}`"
        :aria-labelledby="`sec-${group.id}`"
      >
        <div class="hud-flank-head">
          <h2 :id="`sec-${group.id}`" class="hud-flank-title font-mono">{{ group.title }}</h2>
          <span class="hud-flank-count font-mono">{{ group.modules.length }}</span>
          <span class="hud-flank-rule" aria-hidden="true" />
        </div>

        <nav class="hud-arc" :aria-label="group.title">
          <router-link
            v-for="(m, i) in group.modules"
            :key="m.name"
            :to="{ name: m.name }"
            class="aura"
            :style="{ '--a': arc(i, group.modules.length), '--i': gi * 6 + i }"
          >
            <span class="aura-icon" :class="{ 'aura-icon--on': m.on }">
              <q-icon :name="m.icon" size="22px" />
              <!-- Compteur en coin d'icône, comme une pile d'objets : le nombre
                   appartient au module, il n'a pas besoin d'une colonne à lui. -->
              <span v-if="m.count !== undefined" class="aura-stack font-mono">{{ m.count }}</span>
              <!-- Volontairement sans `--live` : `m.on` dit que le fichier
                   existe sur le disque, pas qu'il s'y passe quelque chose. -->
              <span v-else-if="m.on" class="status-dot status-dot--pulse aura-dot" />
            </span>
            <span class="aura-body">
              <span class="aura-name">{{ m.label }}</span>
              <span class="aura-hint">{{ m.hint }}</span>
            </span>
            <q-icon name="arrow_forward" size="15px" class="hud-arrow" aria-hidden="true" />
          </router-link>
        </nav>
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import EmptyState from '@/components/ui/EmptyState.vue';
import { useSystemStore } from '@/stores/system';
import type { SessionInfo } from '@/services/system';
import { helpSections } from '@/help';

const { t } = useI18n();
const sys = useSystemStore();

// Les sessions viennent du store, pas d'un sondage propre à cette page : la
// barre système les affiche aussi, et deux timers interrogeraient le BFF pour
// la même réponse. Le rafraîchissement périodique est tenu par MainLayout, qui
// reste monté sur tous les écrans.
const { sessions } = storeToRefs(sys);
const isActive = sys.isActive;
const hasActive = computed(() => sys.activeSessions.length > 0);

function sessionLabel(s: SessionInfo): string {
  return s.name || s.sessionId.slice(0, 8) || 'session';
}

// Position d'un module sur son arc, de 0 (extrémités) à 1 (milieu).
//
// C'est bien un demi-cercle vu de face : sur un cercle centré sur le regard,
// le point le plus éloigné latéralement est celui du milieu, et les extrémités
// haute et basse reviennent vers le centre. Le sinus donne exactement cela, et
// la feuille de style en tire d'un coup le décalage, l'échelle et l'opacité —
// les trois indices de profondeur restent ainsi liés à une seule valeur.
function arc(i: number, n: number): string {
  return (Math.sin(((i + 0.5) / n) * Math.PI) ** 1.4).toFixed(3);
}

// Les deux entrées mises en avant au centre. Ce sont des actions, pas des
// ressources : elles ne sont donc pas répétées sur les arcs.
const primaries = computed(() => [
  {
    name: 'projects',
    label: t('nav.projects'),
    icon: 'folder_open',
    hint: t('pages.home.primaries.projectsHint'),
    cta: t('pages.home.primaries.projectsCta'),
  },
  {
    name: 'atelier',
    label: t('nav.atelier'),
    icon: 'construction',
    hint: t('pages.home.primaries.atelierHint'),
    cta: t('pages.home.primaries.atelierCta'),
  },
]);

// Les modules, répartis sur les deux flancs : les ressources réutilisables à
// gauche, la plomberie système à droite.
const groups = computed(() => {
  const ov = sys.overview;
  return [
    {
      id: 'ressources',
      title: t('pages.home.groups.resources'),
      side: 'left',
      modules: [
        {
          name: 'agents',
          label: t('nav.agents'),
          icon: 'smart_toy',
          hint: t('pages.home.hints.agents'),
          count: ov?.agents ?? 0,
        },
        {
          name: 'skills',
          label: t('nav.skills'),
          icon: 'bolt',
          hint: t('pages.home.hints.skills'),
          count: ov?.skills ?? 0,
        },
        {
          name: 'plugins',
          label: t('nav.plugins'),
          icon: 'extension',
          hint: t('pages.home.hints.plugins'),
          count: ov?.plugins ?? 0,
        },
        {
          name: 'memory',
          label: t('nav.memory'),
          icon: 'psychology',
          hint: t('pages.home.hints.memory'),
          on: ov?.claudeMdExists ?? false,
        },
        {
          name: 'hooks',
          label: t('nav.hooks'),
          icon: 'bolt',
          hint: t('pages.home.hints.hooks'),
          on: ov?.settingsExists ?? false,
        },
        {
          name: 'mcp',
          label: t('nav.mcp'),
          icon: 'cable',
          hint: t('pages.home.hints.mcp'),
          on: true,
        },
      ],
    },
    {
      id: 'systeme',
      title: t('pages.home.groups.system'),
      side: 'right',
      modules: [
        {
          name: 'settings',
          label: t('nav.settings'),
          icon: 'tune',
          hint: t('pages.home.hints.settings'),
          on: ov?.settingsExists ?? false,
        },
        {
          name: 'backups',
          label: t('nav.backups'),
          icon: 'restore',
          hint: t('pages.home.hints.backups'),
          on: true,
        },
        {
          name: 'usage',
          label: t('nav.usage'),
          icon: 'insights',
          hint: t('pages.home.hints.usage'),
          on: true,
        },
        {
          name: 'diagnostic',
          label: t('nav.diagnostic'),
          icon: 'troubleshoot',
          hint: t('pages.home.hints.diagnostic'),
          on: true,
        },
        {
          name: 'maintenance',
          label: t('nav.maintenance'),
          icon: 'storage',
          hint: t('pages.home.hints.maintenance'),
          on: true,
        },
        {
          name: 'help',
          label: t('nav.help'),
          icon: 'menu_book',
          hint: t('pages.home.hints.help'),
          count: helpSections().length,
        },
      ],
    },
  ];
});

onMounted(() => {
  if (!sys.loaded) void sys.refresh();
});
</script>

<style scoped lang="scss">
.hud {
  display: flex;
  align-items: center;
  padding: var(--space-xl);
  position: relative;
}
/* La lueur est recentrée sur le cœur : c'est lui que la page éclaire. */
.hud::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 900px;
  height: 620px;
  background: radial-gradient(ellipse at center, var(--brand-soft), transparent 70%);
  pointer-events: none;
  opacity: 0.55;
}

/* ── Ossature : arc · cœur · arc ───────────────────────────────────────────── */
.hud-frame {
  display: grid;
  /* Le cœur est nommé en premier dans le document mais tient la colonne du
     milieu : les colonnes sont donc assignées explicitement. */
  grid-template-columns: minmax(280px, 1fr) minmax(480px, 620px) minmax(280px, 1fr);
  align-items: center;
  gap: var(--space-xl);
  width: 100%;
  max-width: 1760px;
  margin-inline: auto;
  position: relative;
}
.hud-core {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-width: 0;
}
.hud-flank {
  grid-row: 1;
  min-width: 0;
}
.hud-flank--left {
  grid-column: 1;
}
.hud-flank--right {
  grid-column: 3;
}

/* ── Cœur ─────────────────────────────────────────────────────────────────── */
.hud-ident {
  text-align: center;
}
.hud-kicker {
  font-size: var(--fs-xs);
  letter-spacing: 0.18em;
  color: var(--brand-muted);
}
.hud-title {
  font-size: 34px; // display size — off the type scale on purpose
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.05;
  margin-top: var(--space-xs);
}
.hud-desc {
  max-width: 52ch;
  margin: var(--space-sm) auto 0;
  color: var(--muted);
  font-size: var(--fs-sm);
  line-height: 1.5;
}
.hud-primaries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--space-md);
}
.hud-primary {
  /* Même anatomie que les rangées d'arc (icône, corps, pied) en plus grand :
     le cœur est de la même famille que les flancs, pas une autre espèce. */
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
  min-height: 168px;
  padding: var(--space-lg);
  background: var(--surface);
  /* La lueur remplace le filet — sa première couche est un anneau `inset` posé
     là où était la bordure, garder les deux doublerait l'arête. Une ombre
     interne ne prend aucune place, donc la mise en page ne bouge pas. */
  border-radius: var(--radius-md);
  box-shadow: var(--glow-shadow);
  text-decoration: none;
  color: inherit;
  position: relative;
  /* Pas d'`overflow: hidden` ici : il ne servait qu'à rattraper les coins
     carrés du lavis, qui porte désormais son propre arrondi — et il rognait
     le pixel par lequel les renforts d'angle coiffent l'arête. */
  transition:
    transform var(--motion-base) ease,
    box-shadow var(--motion-base) ease,
    background var(--motion-base) ease;
}
.hud-primary::after {
  content: '';
  position: absolute;
  inset: 0;
  /* Le lavis suit l'arête : un voile saumon sous un bord cyan donnerait deux
     couleurs pour un seul geste. Le saumon reste sur l'icône et le libellé
     d'action, qui eux désignent ce qui va se passer. */
  background: radial-gradient(120% 100% at 100% 0%, var(--glow-soft), transparent 55%);
  border-radius: inherit;
  opacity: 0;
  transition: opacity var(--motion-base) ease;
  pointer-events: none;
}
.hud-primary:hover,
.hud-primary:focus-visible {
  transform: translateY(-3px);
  box-shadow: var(--glow-shadow-hover);
  background: var(--surface-2);
}
.hud-primary:hover::after,
.hud-primary:focus-visible::after {
  opacity: 1;
}
.hud-primary:hover .hud-primary-icon,
.hud-primary:focus-visible .hud-primary-icon {
  color: var(--brand);
  border-color: var(--brand-line);
}
.hud-primary:hover .hud-primary-cta,
.hud-primary:focus-visible .hud-primary-cta {
  color: var(--brand);
}
.hud-primary:hover .hud-arrow,
.hud-primary:focus-visible .hud-arrow {
  transform: translateX(3px);
}
.hud-primary-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-bottom: var(--space-lg);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--line-2);
  color: var(--muted);
  transition:
    color var(--motion-base) ease,
    border-color var(--motion-base) ease;
}
.hud-primary-name {
  margin-top: auto;
  font-size: var(--fs-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.hud-primary-hint {
  color: var(--muted);
  font-size: var(--fs-sm);
  line-height: 1.4;
}
.hud-primary-cta {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--line);
  font-size: var(--fs-xs);
  color: var(--muted);
}

/* ── Encart sessions ──────────────────────────────────────────────────────── */
.hud-sessions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-width: 0;
  padding: var(--space-md) var(--space-lg);
}
.hud-sessions-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.hud-sessions-label {
  font-size: var(--fs-2xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brand-muted);
}
.hud-sessions-count {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--dim);
}
.hud-sessions-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hud-sess {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  margin: 0 calc(-1 * var(--space-sm));
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: inherit;
  transition: background var(--motion-fast) ease;
}
.hud-sess:hover,
.hud-sess:focus-visible {
  background: var(--hover-overlay);
}
.hud-sess:hover .hud-arrow,
.hud-sess:focus-visible .hud-arrow {
  transform: translateX(3px);
  color: var(--brand);
}
.hud-sess-name {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hud-sess-status {
  font-size: var(--fs-2xs);
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.hud-sessions-foot {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin-top: auto;
  padding-top: var(--space-sm);
  border-top: 1px solid var(--line);
  font-size: var(--fs-xs);
  color: var(--muted);
  text-decoration: none;
  transition: color var(--motion-fast) ease;
}
.hud-sessions-foot:hover,
.hud-sessions-foot:focus-visible {
  color: var(--brand);
}
.hud-sessions-foot:hover .hud-arrow,
.hud-sessions-foot:focus-visible .hud-arrow {
  transform: translateX(3px);
  color: var(--brand);
}

/* ── En-tête de flanc ─────────────────────────────────────────────────────── */
.hud-flank-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}
.hud-flank-title {
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand-muted);
  margin: 0;
}
.hud-flank-count {
  font-size: var(--fs-2xs);
  color: var(--dim);
}
.hud-flank-rule {
  flex: 1;
  height: 1px;
  background: var(--line);
}

/* ── Arcs ─────────────────────────────────────────────────────────────────── */
.hud-arc {
  display: flex;
  flex-direction: column;
  /* Écartement généreux : c'est la hauteur parcourue par l'arc qui rend sa
     courbure lisible. Serrées, les six rangées ne décrivent plus une courbe
     mais un simple décrochement. */
  gap: var(--space-lg);
}
/* `--a` vaut 1 au milieu de l'arc et tend vers 0 aux extrémités. Le décalage,
   l'échelle et l'opacité en découlent tous les trois : la rangée du milieu est
   la plus avancée vers le spectateur, celles des bouts s'éloignent. */
.aura {
  --arc-x: 88px;
  /* La rangée cède d'avance la largeur que l'arc va lui faire parcourir, et se
     colle au bord intérieur du flanc. Sans cela, celles du milieu — les plus
     décalées — sortiraient du cadre et se feraient rogner. */
  width: calc(100% - var(--arc-x));
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--glow-shadow);
  text-decoration: none;
  color: inherit;
  position: relative;
  overflow: hidden;
  opacity: calc(0.88 + var(--a) * 0.12);
  transition:
    transform var(--motion-base) ease,
    box-shadow var(--motion-base) ease,
    opacity var(--motion-base) ease,
    background var(--motion-base) ease;
  animation: aura-in var(--motion-slow) ease both;
  animation-delay: calc(var(--i) * 40ms);
}
.hud-flank--left .aura {
  margin-left: auto;
  transform: translateX(calc(var(--a) * var(--arc-x) * -1)) scale(calc(0.96 + var(--a) * 0.04));
}
.hud-flank--right .aura {
  margin-right: auto;
  transform: translateX(calc(var(--a) * var(--arc-x))) scale(calc(0.96 + var(--a) * 0.04));
}
.aura::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 140% at 100% 0%, var(--glow-soft), transparent 55%);
  opacity: 0;
  transition: opacity var(--motion-base) ease;
  pointer-events: none;
}
/* Au survol, la rangée revient au premier plan : elle reprend sa pleine
   opacité, son échelle réelle, et s'avance vers le cœur. */
.aura:hover,
.aura:focus-visible {
  opacity: 1;
  box-shadow: var(--glow-shadow-hover);
  background: var(--surface-2);
}
.hud-flank--left .aura:hover,
.hud-flank--left .aura:focus-visible {
  transform: translateX(calc(var(--a) * var(--arc-x) * -1 + 4px)) scale(1);
}
.hud-flank--right .aura:hover,
.hud-flank--right .aura:focus-visible {
  transform: translateX(calc(var(--a) * var(--arc-x) - 4px)) scale(1);
}
.aura:hover::after,
.aura:focus-visible::after {
  opacity: 1;
}
.aura:hover .aura-icon,
.aura:focus-visible .aura-icon {
  color: var(--brand);
  border-color: var(--brand-line);
}
.aura:hover .hud-arrow,
.aura:focus-visible .hud-arrow {
  transform: translateX(3px);
  color: var(--brand);
}
.aura-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--line-2);
  color: var(--muted);
  transition:
    color var(--motion-base) ease,
    border-color var(--motion-base) ease;
}
/* Compteur en coin, posé sur l'arête de l'icône. */
.aura-stack {
  position: absolute;
  right: -5px;
  bottom: -6px;
  min-width: 18px;
  padding: 0 3px;
  border-radius: var(--radius-xs);
  background: var(--surface);
  border: 1px solid var(--line-2);
  color: var(--text);
  font-size: var(--fs-2xs);
  font-weight: 600;
  line-height: 16px;
  text-align: center;
}
.aura-dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
}
.aura-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.aura-name {
  font-size: var(--fs-md);
  font-weight: 600;
  letter-spacing: -0.01em;
}
/* Une seule ligne, tronquée : la description complète est sur la page du
   module. Une ligne qui se déplie au survol ferait respirer tout l'arc. */
.aura-hint {
  margin-top: 1px;
  color: var(--muted);
  font-size: var(--fs-2xs);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hud-arrow {
  color: var(--dim);
  transition:
    transform var(--motion-base) ease,
    color var(--motion-base) ease;
}

@keyframes aura-in {
  from {
    opacity: 0;
  }
  to {
    opacity: calc(0.88 + var(--a) * 0.12);
  }
}

/* ── Repli : sous la largeur de trois colonnes, l'arc n'a plus de sens ─────── */
@media (max-width: 1280px) {
  .hud {
    align-items: flex-start;
  }
  .hud-frame {
    /* Deux colonnes fixes plutôt qu'un `auto-fit` : il n'y a que deux flancs,
       et une piste de plus resterait vide à droite. */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
  .hud-core,
  .hud-flank--left,
  .hud-flank--right {
    grid-column: auto;
    grid-row: auto;
  }
  .hud-core {
    grid-column: 1 / -1;
  }
  .hud-flank--left .aura,
  .hud-flank--right .aura,
  .hud-flank--left .aura:hover,
  .hud-flank--left .aura:focus-visible,
  .hud-flank--right .aura:hover,
  .hud-flank--right .aura:focus-visible {
    transform: none;
  }
  .aura {
    width: 100%;
    opacity: 1;
  }
}

@media (max-width: 780px) {
  .hud-frame {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .aura {
    animation: none;
  }
}
</style>
