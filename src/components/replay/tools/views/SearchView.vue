<template>
  <div class="tv">
    <!-- Une recherche par mots-clés se lit mal sans sa requête : ce qu'elle a
         trouvé ne s'en déduit pas. Un `select:` la porte déjà dans ses noms. -->
    <p v-if="keywords" class="sv-query">
      <span class="section-label">{{ t('replay.tools.views.search.query') }}</span>
      <span class="font-mono">{{ keywords }}</span>
    </p>

    <section v-if="loaded.length" class="sv-block">
      <h4 class="section-label">
        {{
          keywords ? t('replay.tools.views.search.found') : t('replay.tools.views.search.loaded')
        }}
      </h4>
      <ul class="sv-tools">
        <li v-for="name in loaded" :key="name" class="sv-tool font-mono">{{ name }}</li>
      </ul>
    </section>

    <p v-else-if="empty" class="sv-empty">
      <q-icon name="search_off" size="15px" aria-hidden="true" />
      <span v-if="keywords">{{ t('replay.tools.views.search.noMatch') }}</span>
      <span v-else>{{ t('replay.tools.views.search.noSuchName', asked.length) }}</span>
    </p>

    <!-- Trois appels du parc n'ont laissé ni texte ni résultat structuré. On ne
         peut rien dire de ce qu'ils ont chargé ; on dit au moins ce qu'ils
         demandaient, plutôt que de laisser l'écran blanc. -->
    <section v-else-if="asked.length && !showOutput" class="sv-block">
      <h4 class="section-label">{{ t('replay.tools.views.search.asked') }}</h4>
      <ul class="sv-tools">
        <li v-for="name in asked" :key="name" class="sv-tool sv-tool--asked font-mono">
          {{ name }}
        </li>
      </ul>
      <p class="sv-reserve">{{ t('replay.tools.views.search.notKept') }}</p>
    </section>

    <p v-if="reserve" class="sv-reserve">
      {{ t('replay.tools.views.search.reserve', reserve) }}
    </p>

    <!-- Le texte est vide dans la quasi-totalité des appels ; quand il porte
         quelque chose, c'est une erreur ou la phrase du CLI. -->
    <OutputPane
      v-if="showOutput"
      :content="block.result?.content ?? ''"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from '@/services/projects';
import { asRecord, str } from '../values';
import OutputPane from '../OutputPane.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

const query = computed(() => str(asRecord(props.block.input).query));

/** La requête quand elle cherche par mots-clés ; vide pour un `select:`. */
const keywords = computed(() => (query.value.startsWith('select:') ? '' : query.value));

/** Les outils que la requête nomme — seulement la forme `select:A,B`. */
const asked = computed(() =>
  keywords.value
    ? []
    : query.value
        .slice('select:'.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
);

/** Les outils effectivement chargés, tels que le harness les a rendus. */
const loaded = computed(() => {
  const m = props.block.result?.meta?.matches;
  return Array.isArray(m) ? m.filter((x): x is string => typeof x === 'string' && Boolean(x)) : [];
});

/**
 * La recherche a répondu, et elle n'a rien chargé.
 *
 * À distinguer du résultat absent : trois appels du parc demandent un outil qui
 * n'existe pas et ne le disent aujourd'hui nulle part, l'Atelier n'affichant
 * qu'une requête sans réponse.
 *
 * Trois autres le disent en anglais, dans le seul texte que `ToolSearch` écrive
 * jamais. C'est la même chose ; autant la dire de la même façon.
 */
const NONE = 'No matching deferred tools found';

const empty = computed(
  () =>
    Array.isArray(props.block.result?.meta?.matches) || props.block.result?.content.trim() === NONE,
);

const reserve = computed(() => {
  const n = props.block.result?.meta?.total_deferred_tools;
  return typeof n === 'number' && n > 0 ? n : 0;
});

/** Le texte n'apporte rien quand la liste des outils le dit déjà. */
const showOutput = computed(() => {
  if (props.block.result?.isError) return true;
  if (loaded.value.length || empty.value) return false;
  return Boolean(props.block.result?.content.trim());
});
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.sv-query {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  font-size: var(--fs-sm);
  color: var(--text);
}
.sv-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
// Un `h4` garde sinon la marge par défaut du navigateur — 1,33 em de part et
// d'autre, qui s'ajoutent au `gap` et détachent le titre de sa liste.
.sv-block > h4 {
  margin: 0;
}
.sv-tools {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}
.sv-tool {
  color: var(--brand);
  font-size: var(--fs-2xs);
  border: 1px solid var(--brand-line);
  border-radius: 999px;
  padding: 1px 8px;
}
.sv-tool--asked {
  color: var(--muted);
  border-color: var(--line-2);
}
.sv-empty {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--fs-sm);
  color: var(--muted);
}
.sv-reserve {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--faint);
}
</style>
