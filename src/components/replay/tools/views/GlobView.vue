<template>
  <div class="tv">
    <ToolChips :items="params" />

    <OutputPane
      v-if="rawOnly"
      :content="raw"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />

    <p v-else-if="sameAsBefore" class="tv-empty">
      {{ t('replay.tools.views.glob.sameAsBefore', { tool: 'Glob' }) }}
    </p>

    <p v-else-if="!paths.length" class="tv-empty">{{ t('replay.tools.views.glob.empty') }}</p>

    <template v-else>
      <PathList
        :paths="paths"
        :root="root"
        :order="paths.length > 1 ? t('replay.tools.views.glob.order') : ''"
      />
      <p v-if="cut" class="tv-note">{{ cut }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from '@/services/projects';
import { asRecord, chips, str } from '../values';
import ToolChips from '../ToolChips.vue';
import OutputPane from '../OutputPane.vue';
import PathList from '../PathList.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

const input = computed(() => asRecord(props.block.input));
const raw = computed(() => props.block.result?.content ?? '');

/** Errors and disk-spilled outputs are not path lists: do not pretend to parse. */
const rawOnly = computed(
  () => props.block.result?.isError === true || raw.value.startsWith('<persisted-output>'),
);

const params = computed(() =>
  chips([
    [t('replay.tools.chips.pattern'), str(input.value.pattern)],
    [t('replay.tools.chips.in'), str(input.value.path)],
  ]),
);

/**
 * `Glob` répond un chemin par ligne, et glisse des lignes qui n'en sont pas :
 *
 *   `No files found`                         rien trouvé — 23,2 % des appels
 *   `(Results are truncated. …)`             la liste s'arrête là — 111 résultats
 *   `(Showing 100 of 748 matching files; …)` de même, en donnant le compte — 19
 *   `[result-id: r5]`                        la poignée que le CLI attache à une
 *                                            sortie pour qu'une autre y renvoie
 *   `<identical to result [r2] …>`           justement ce renvoi : le résultat
 *                                            entier tient dans une phrase
 *
 * Aucune ne porte de séparateur : toutes passaient le filtre et s'affichaient
 * comme un fichier trouvé, dans 164 résultats du parc.
 */
const NOTHING = /^No files found/;
const TRUNCATED = /^\(Results are truncated/;
const SHOWING = /^\(Showing \d+ of (\d+) matching files; (\d+) more are not listed/;
const RESULT_ID = /^\[result-id: [^\]]+\]$/;
const IDENTICAL = /^<identical to result/;

/**
 * Vérifié sur ce dépôt contre `ls -lt` : le dernier chemin rendu est le fichier
 * modifié le plus récemment. L'ordre n'est alphabétique que dans 131 des 871
 * résultats à quatre chemins ou plus — le corps ne permet pas de le deviner.
 */
const sameAsBefore = computed(() => !rawOnly.value && IDENTICAL.test(raw.value.trim()));

const lines = computed(() =>
  rawOnly.value || sameAsBefore.value
    ? []
    : raw.value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
);

const paths = computed(() =>
  lines.value.filter(
    (l) => !NOTHING.test(l) && !TRUNCATED.test(l) && !SHOWING.test(l) && !RESULT_ID.test(l),
  ),
);

/**
 * La coupure vaut d'être dite pour ce qu'elle emporte : la liste garde les cent
 * premiers, donc les plus anciens, et ce sont les fichiers touchés en dernier —
 * ceux qu'on cherchait, le plus souvent — qui manquent.
 */
const cut = computed(() => {
  const shown = lines.value.map((l) => SHOWING.exec(l)).find(Boolean);
  if (shown) {
    return t('replay.tools.views.glob.cutSome', { rest: shown[2] ?? '', total: shown[1] ?? '' });
  }
  if (lines.value.some((l) => TRUNCATED.test(l))) {
    return t('replay.tools.views.glob.cutAll');
  }
  return '';
});

/**
 * Le dossier que tous les chemins partagent, sorti une fois au-dessus de la
 * liste. 131 résultats du parc en ont un de plus de douze caractères, 79 en
 * médiane : sans ce repli, la colonne du dossier est coupée par la droite et
 * perd justement le segment qui distingue les fichiers entre eux.
 */
const root = computed(() => {
  const list = paths.value;
  const first = list[0];
  if (list.length < 2 || !first) return '';
  const sep = first.includes('\\') ? '\\' : '/';
  let common = first.slice(0, first.lastIndexOf(sep) + 1);
  while (common && !list.every((p) => p.startsWith(common))) {
    common = common.slice(0, common.lastIndexOf(sep, common.length - 2) + 1);
  }
  return common.length > 12 ? common : '';
});
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.tv-empty {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--faint);
}
.tv-note {
  margin: 0;
  font-size: var(--fs-2xs);
  color: var(--faint);
  font-style: italic;
}
</style>
