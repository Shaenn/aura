<template>
  <!-- `overlay` : le manuel se consulte au-dessus de l'écran courant, il ne le
       recompose pas. En mode « push », ouvrir l'aide reflouait tout le launchpad
       (5 tuiles par rangée → 3), ce qui fait perdre le repère qu'on cherchait
       justement à documenter — et le fond de verre n'avait rien à révéler.

       560 et non 440 : les pages du manuel portent des tableaux de trois
       colonnes (une clé, son rôle, la valeur supposée quand elle manque). Sous
       cette largeur, ils défilaient horizontalement chez eux — ce qui revient à
       cacher la colonne qui porte l'information. -->
  <q-drawer
    v-model="open"
    side="right"
    overlay
    bordered
    :width="560"
    :breakpoint="1024"
    class="help-drawer"
    @hide="unpinHelp"
  >
    <section class="hd" aria-labelledby="hd-title">
      <header class="hd-head">
        <q-icon
          v-if="section"
          :name="section.icon"
          size="16px"
          class="hd-icon"
          aria-hidden="true"
        />
        <h2 id="hd-title" class="hd-cmd font-mono">{{ command }}</h2>
        <q-btn
          flat
          dense
          round
          size="sm"
          icon="close"
          :aria-label="t('layout.help.close')"
          @click="closeHelp"
        />
      </header>

      <div class="hd-body">
        <MarkdownView v-if="section" :key="section.id" :source="section.body" />
        <p v-else class="hd-empty">{{ t('layout.help.empty') }}</p>
      </div>

      <footer class="hd-foot">
        <router-link class="hd-link font-mono" :to="manualTo" @click="closeHelp">
          <q-icon name="menu_book" size="15px" aria-hidden="true" />
          {{ t('layout.help.full') }}
          <q-icon name="arrow_forward" size="14px" class="hd-arrow" aria-hidden="true" />
        </router-link>
      </footer>
    </section>
  </q-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, type RouteLocationRaw } from 'vue-router';
import MarkdownView from '@/components/replay/MarkdownView.vue';
import { findSection, sectionForRoute } from '@/help';
import { useHelp, closeHelp, unpinHelp } from '@/composables/useHelp';

const { t } = useI18n();
const route = useRoute();
const { open, pinned } = useHelp();

// A pinned section wins; otherwise the drawer tracks the current route, so
// navigating with the drawer open swaps the manual page under it.
const section = computed(() => findSection(pinned.value) ?? sectionForRoute(route.name));

const command = computed(() => (section.value ? `man aura-${section.value.id}` : 'man aura'));

const manualTo = computed<RouteLocationRaw>(() =>
  section.value ? { name: 'help', query: { s: section.value.id } } : { name: 'help' },
);
</script>

<style scoped lang="scss">
/* Transparent on purpose: the glass fill lives on the drawer shell. An opaque
   layer here would sit on top of it and cancel the blur entirely. */
.hd {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

/* ── Header: the manpage command line ─────────────────────────────────────── */
.hd-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 0 0 auto;
  height: 40px;
  padding: 0 var(--space-sm) 0 var(--space-lg);
  border-bottom: 1px solid var(--line);
  background: var(--topbar-bg);
}
.hd-icon {
  color: var(--brand);
  flex: 0 0 auto;
}
.hd-cmd {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--brand-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Body: the rendered section ───────────────────────────────────────────── */
.hd-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-lg);
}
/* The section title already sits in the header — the body opens on prose. */
.hd-body :deep(.md-view > h2:first-child),
.hd-body :deep(.md-view > p:first-child) {
  margin-top: 0;
}
.hd-empty {
  margin: 0;
  color: var(--dim);
  font-size: var(--fs-sm);
}

/* ── Footer: escape hatch to the full manual ──────────────────────────────── */
/* Sits outside the scroll area, so the rule alone separates it — an opaque fill
   would only punch a hole in the glass. */
.hd-foot {
  flex: 0 0 auto;
  padding: var(--space-sm) var(--space-lg);
  border-top: 1px solid var(--line);
}
.hd-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--fs-xs);
  color: var(--muted);
  text-decoration: none;
  transition: color var(--motion-fast) ease;
}
.hd-link:hover {
  color: var(--brand);
}
.hd-arrow {
  transition: transform var(--motion-base) ease;
}
.hd-link:hover .hd-arrow {
  transform: translateX(3px);
}
</style>

<style lang="scss">
/* The drawer surface itself is outside the scoped tree. */
/* Fond et tranche viennent du système (surfaces flottantes en verre, app.scss).
   Ce sélecteur est plus spécifique que la règle globale : il doit reprendre le
   token, pas réintroduire une surface opaque. La bordure, elle, est laissée au
   système — elle doit y battre celle de Quasar, ce qui demande un sélecteur
   plus fort que ce qu'on peut écrire ici. */
.q-drawer.help-drawer {
  background: var(--glass-bg);
  box-shadow: var(--drawer-shadow);
}
.help-drawer .q-drawer__content {
  overflow: hidden; /* the body scrolls, not the shell */
}
</style>
