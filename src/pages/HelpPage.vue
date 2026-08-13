<template>
  <q-page class="hp">
    <h1 class="sr-only">{{ t('pages.help.title') }}</h1>

    <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

    <header class="hp-head">
      <div class="hp-head-main">
        <div class="hp-kicker font-mono">{{ t('pages.help.kicker') }}</div>
        <div class="hp-title">AURA</div>
        <p class="hp-desc">
          <i18n-t keypath="pages.help.intro" scope="global">
            <template #icon>
              <q-icon name="help_outline" size="15px" aria-hidden="true" />
            </template>
          </i18n-t>
        </p>
      </div>

      <q-input
        v-model="query"
        outlined
        dense
        clearable
        debounce="120"
        class="hp-search"
        :placeholder="t('common.search')"
        :aria-label="t('pages.help.searchAria')"
      >
        <template #prepend>
          <q-icon name="search" />
        </template>
      </q-input>
    </header>

    <p class="sr-only" role="status">{{ resultsLabel }}</p>

    <div class="hp-cols">
      <nav class="hp-toc" :aria-label="t('pages.help.tocAria')">
        <ul class="hp-toc-list">
          <li v-for="s in results" :key="s.id">
            <a
              class="hp-toc-item"
              :class="{ 'hp-toc-item--on': active === s.id }"
              :href="hrefFor(s.id)"
              :aria-current="active === s.id ? 'true' : undefined"
              @click.prevent="goTo(s.id)"
            >
              <q-icon :name="s.icon" size="17px" class="hp-toc-icon" aria-hidden="true" />
              <span class="hp-toc-label">{{ s.title }}</span>
            </a>
          </li>
        </ul>
      </nav>

      <div ref="main" class="hp-main">
        <p v-if="!results.length" class="hp-empty">
          {{ t('pages.help.noMatch', { query }) }}
        </p>

        <section
          v-for="s in results"
          :id="`sec-${s.id}`"
          :key="s.id"
          class="hp-sec surface-card"
          :aria-labelledby="`h-${s.id}`"
        >
          <header class="hp-sec-head">
            <span class="hp-sec-icon"><q-icon :name="s.icon" size="20px" /></span>
            <h2 :id="`h-${s.id}`" class="hp-sec-title">{{ s.title }}</h2>
            <code class="hp-sec-cmd font-mono">man aura-{{ s.id }}</code>
          </header>
          <MarkdownView :source="s.body" />
        </section>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import MarkdownView from 'src/components/replay/MarkdownView.vue';
import { helpSections, searchSections } from 'src/help';
import { closeHelp } from 'src/composables/useHelp';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const query = ref('');
// q-input with `clearable` writes null on clear, hence the ?? ''.
const results = computed(() => searchSections(query.value ?? ''));
const active = ref<string>(helpSections()[0]?.id ?? '');
const main = ref<HTMLElement | null>(null);

const resultsLabel = computed(() =>
  !query.value
    ? t('pages.help.count', helpSections().length)
    : t('pages.help.found', results.value.length),
);

/** Scroll a section under the fixed statusbar; `scroll-margin-top` does the offset. */
async function scrollToSection(id: string): Promise<void> {
  await nextTick();
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** A real, resolvable URL so ctrl-click and "open in new tab" behave. */
function hrefFor(id: string): string {
  return router.resolve({ name: 'help', query: { s: id } }).href;
}

function goTo(id: string): void {
  active.value = id;
  void scrollToSection(id);
  void router.replace({ name: 'help', query: { s: id } });
}

// Scroll-spy: the section crossing the band just under the header wins. The
// observer is rebuilt whenever the rendered set changes (i.e. on every search).
let io: IntersectionObserver | null = null;
function observeSections(): void {
  io?.disconnect();
  const els = main.value?.querySelectorAll<HTMLElement>('.hp-sec');
  if (!els?.length) return;

  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) active.value = e.target.id.replace(/^sec-/, '');
      }
    },
    { rootMargin: '-56px 0px -70% 0px', threshold: 0 },
  );
  els.forEach((el) => obs.observe(el));
  io = obs;
}

watch(results, () => void nextTick(observeSections));

// Deep link: /aide?s=<id>, set by the drawer's "Manuel complet" link. A query
// param plutôt qu'une ancre : le fragment appartient au défilement natif du
// navigateur, qui viserait une section pas encore rendue au premier passage.
watch(
  () => route.query.s,
  (s) => {
    if (typeof s === 'string' && s) {
      active.value = s;
      void scrollToSection(s);
    }
  },
);

onMounted(() => {
  // The contextual drawer would document the screen you just left — and there is
  // no manual page for the manual itself.
  closeHelp();
  observeSections();
  const s = route.query.s;
  if (typeof s === 'string' && s) {
    active.value = s;
    void scrollToSection(s);
  }
});
onBeforeUnmount(() => io?.disconnect());
</script>

<style scoped lang="scss">
.hp {
  padding: var(--space-xl);
  width: 100%;
  max-width: var(--page-max);
  margin: 0 auto;
}

/* ── Head ─────────────────────────────────────────────────────────────────── */
.hp-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-xl);
  flex-wrap: wrap;
  margin-bottom: var(--space-xl);
}
.hp-head-main {
  min-width: 0;
}
.hp-kicker {
  font-size: var(--fs-xs);
  letter-spacing: 0.18em;
  color: var(--brand-muted);
}
.hp-title {
  font-size: 30px; // display size — off the type scale, as on the launchpad
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.05;
  margin-top: var(--space-xs);
}
.hp-desc {
  max-width: 62ch;
  margin: var(--space-sm) 0 0;
  color: var(--muted);
  font-size: var(--fs-md);
  line-height: 1.5;
}
.hp-search {
  width: 260px;
  max-width: 100%;
}

/* ── Two columns: sticky table of contents + sections ─────────────────────── */
.hp-cols {
  display: grid;
  grid-template-columns: 210px 1fr;
  gap: var(--space-xl);
  align-items: start;
}
.hp-toc {
  position: sticky;
  top: 56px; // statusbar (40px) + breathing room
}
.hp-toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.hp-toc-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border-left: 2px solid transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-decoration: none;
  transition:
    color var(--motion-fast) ease,
    background var(--motion-fast) ease,
    border-color var(--motion-fast) ease;
}
.hp-toc-item:hover {
  background: var(--hover-overlay);
  color: var(--text);
}
.hp-toc-item--on {
  color: var(--brand);
  border-left-color: var(--brand);
  background: var(--hover-overlay);
}
.hp-toc-icon {
  flex: 0 0 auto;
}
.hp-toc-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Sections ─────────────────────────────────────────────────────────────── */
.hp-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
.hp-sec {
  padding: var(--space-lg) var(--space-xl) var(--space-xl);
  scroll-margin-top: 56px;
}
.hp-sec-head {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding-bottom: var(--space-md);
  margin-bottom: var(--space-sm);
  border-bottom: 1px solid var(--line);
}
.hp-sec-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--line-2);
  color: var(--brand);
}
.hp-sec-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.hp-sec-cmd {
  flex: 0 0 auto;
  font-size: var(--fs-2xs);
  color: var(--dim);
  background: none;
  border: none;
  padding: 0;
}
/* The card header already names the section — the prose starts flush. */
.hp-sec :deep(.md-view > *:first-child) {
  margin-top: 0;
}
.hp-empty {
  margin: 0;
  color: var(--dim);
  font-size: var(--fs-sm);
}

@media (max-width: 900px) {
  .hp-cols {
    grid-template-columns: 1fr;
  }
  .hp-toc {
    position: static;
  }
  .hp-toc-list {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .hp-search {
    width: 100%;
  }
}
</style>
