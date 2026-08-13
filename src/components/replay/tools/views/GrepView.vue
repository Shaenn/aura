<template>
  <div class="tv">
    <ToolChips :items="params" />

    <!-- An error, or an output spilled to disk: nothing to parse, show it raw. -->
    <OutputPane
      v-if="rawOnly"
      :content="raw"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />

    <p v-else-if="!hits.length" class="tv-empty font-mono">
      {{ raw.trim() || t('replay.tools.views.grep.empty') }}
    </p>

    <!-- `files_with_matches`: no excerpt was quoted, so this is a file list like
         Glob's, and it reads better rendered as one. -->
    <PathList v-else-if="filesOnly" :paths="hits.map((g) => g.file)" icon="description" />

    <ol v-else class="gv-files">
      <li v-for="group in hits" :key="group.file" class="gv-file">
        <p v-if="group.file" class="gv-path font-mono" :title="group.file">
          <q-icon name="description" size="13px" aria-hidden="true" />
          <span class="gv-dir">{{ dirOf(group.file) }}</span>
          <span class="gv-base">{{ baseOf(group.file) }}</span>
        </p>
        <ul class="gv-lines">
          <li
            v-for="(m, i) in group.matches"
            :key="i"
            class="gv-line"
            :class="{ 'gv-ctx': m.context }"
          >
            <span v-if="m.line" class="gv-no" aria-hidden="true">{{ m.line }}</span>
            <code class="gv-text">{{ m.text }}</code>
          </li>
        </ul>
      </li>
    </ol>

    <p v-if="limited" class="tv-note">{{ limited }}</p>
    <p v-if="overflow" class="tv-note">
      {{ t('replay.tools.views.grep.overflow', overflow) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from 'src/services/projects';
import { asRecord, bool, chips, num, str } from '../values';
import { basename, dirname } from '../language';
import { RESULT_ID } from '../serviceLines';
import ToolChips from '../ToolChips.vue';
import OutputPane from '../OutputPane.vue';
import PathList from '../PathList.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

/** Beyond this the list stops being scannable and starts being a wall. */
const MAX_MATCHES = 200;

const input = computed(() => asRecord(props.block.input));
const raw = computed(() => props.block.result?.content ?? '');

/** Errors and disk-spilled outputs are not match lists: do not pretend to parse. */
const rawOnly = computed(
  () => props.block.result?.isError === true || raw.value.startsWith('<persisted-output>'),
);

/**
 * Le mode n'est dit que s'il change la forme du corps. `content` — 71,7 % des
 * appels — donne des extraits, ce que le corps montre déjà ; l'annoncer serait
 * une puce permanente qui n'apprend rien. Les deux autres expliquent pourquoi on
 * lit une liste nue ou un décompte au lieu du code.
 */
const modeLabel = (mode: string): string =>
  mode === 'files_with_matches' || mode === 'count'
    ? t(`replay.tools.views.grep.modes.${mode}`)
    : '';

/** `-C` and its alias `context`, or either half of the pair. 18,4 % des appels. */
const wantsContext = computed(() =>
  ['-C', '-A', '-B', 'context'].some((k) => num(input.value[k]) > 0),
);

const params = computed(() =>
  chips([
    [t('replay.tools.chips.pattern'), str(input.value.pattern)],
    [t('replay.tools.chips.in'), str(input.value.path)],
    [t('replay.tools.chips.glob'), str(input.value.glob)],
    [t('replay.tools.chips.type'), str(input.value.type)],
    [t('replay.tools.chips.mode'), modeLabel(str(input.value.output_mode))],
    [
      t('replay.tools.chips.caseInsensitive'),
      bool(input.value['-i']) ? t('replay.tools.chips.yes') : '',
    ],
  ]),
);

const baseOf = (p: string): string => basename(p);
const dirOf = (p: string): string => {
  const d = dirname(p);
  return d ? `${d}/` : '';
};

/**
 * `Grep` speaks several dialects, and the declared `output_mode` does not settle
 * which one you get: 47 of the corpus's `files_with_matches` calls answer with
 * `path:12:text` anyway. So each line is read for what it looks like.
 *
 *   `Found 22 files`   a header, not a result (711 calls open with it)
 *   `path:12:text`     a match, with its file
 *   `12:text`          a match in the single file that was scanned
 *   `path-11-text`     a *context* line, asked for by `-C`/`-A`/`-B`
 *   `11-text`          a context line in the single file that was scanned
 *   `--`               rg's separator between two blocks of the same file
 *   `path:37`          a count, in `output_mode: count`
 *   `path`             a file that matched, nothing quoted
 *
 * The `path:` prefix is greedy on purpose: a Windows path carries its own colon
 * (`C:\src\a.ts:12:…`), so only the *last* `:digits:` can be the line number.
 *
 * The dash forms are tried only after the colon forms have failed: a match whose
 * *text* happens to contain `-12-` must stay a match. 789 calls in the parc ask
 * for context, and without these two patterns their context lines fall through to
 * `LOOKS_LIKE_PATH` and each become a phantom file — 9 805 such lines measured.
 */
const HEADER = /^Found \d+ files?$/;
const NOTHING = /^No (files|matches) found/;
const SEPARATOR = /^--$/;
/** Pieds de sortie : un décompte et un aveu de pagination, pas des résultats. */
const TOTAL = /^Found \d+ total occurrences across \d+ files?\.?$/;
const PAGINATION = /^\[Showing results with pagination = (.+)\]$/m;
const WITH_FILE = /^(.*):(\d+):([\s\S]*)$/;
const LINE_ONLY = /^(\d+):([\s\S]*)$/;
const CTX_FILE = /^(.*)-(\d+)-([\s\S]*)$/;
const CTX_FILE_FIRST = /^(.*?)-(\d+)-([\s\S]*)$/;
const CTX_LINE = /^(\d+)-([\s\S]*)$/;
const WITH_COUNT = /^(.*):(\d+)$/;
const LOOKS_LIKE_PATH = /[\\/]/;

interface Match {
  line: string;
  text: string;
  /** Neighbouring line printed for context, not something the pattern matched. */
  context?: boolean;
}

const parsed = computed(() => {
  const content = raw.value;
  if (!content.trim() || rawOnly.value) return { groups: [], overflow: 0 };

  const counting = str(input.value.output_mode) === 'count';
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !HEADER.test(l) &&
        !NOTHING.test(l) &&
        !SEPARATOR.test(l) &&
        !TOTAL.test(l) &&
        !PAGINATION.test(l) &&
        // La poignée du CLI n'est ni un chemin ni une correspondance : faute de
        // filtre elle tombait dans le dernier cas du parseur — « la
        // correspondance elle-même, sans position » — et 67 résultats du parc
        // affichaient `[result-id: r2]` comme une ligne trouvée.
        !RESULT_ID.test(l),
    );

  const capped = lines.slice(0, MAX_MATCHES);
  const byFile = new Map<string, Match[]>();

  for (const line of capped) {
    const withFile = WITH_FILE.exec(line);
    if (withFile) {
      push(byFile, withFile[1] ?? '', { line: withFile[2] ?? '', text: withFile[3] ?? '' });
      continue;
    }
    const lineOnly = LINE_ONLY.exec(line);
    if (lineOnly) {
      push(byFile, str(input.value.path), { line: lineOnly[1] ?? '', text: lineOnly[2] ?? '' });
      continue;
    }
    const ctxFile = wantsContext.value ? contextLine(line) : null;
    if (ctxFile) {
      push(byFile, ctxFile[1] ?? '', {
        line: ctxFile[2] ?? '',
        text: ctxFile[3] ?? '',
        context: true,
      });
      continue;
    }
    const ctxLine = wantsContext.value ? CTX_LINE.exec(line) : null;
    if (ctxLine) {
      push(byFile, str(input.value.path), {
        line: ctxLine[1] ?? '',
        text: ctxLine[2] ?? '',
        context: true,
      });
      continue;
    }
    const withCount = counting ? WITH_COUNT.exec(line) : null;
    if (withCount) {
      push(byFile, withCount[1] ?? '', { line: '', text: `${withCount[2]} correspondance(s)` });
      continue;
    }
    if (LOOKS_LIKE_PATH.test(line)) {
      // A file that matched. Nothing was quoted from it.
      if (!byFile.has(line)) byFile.set(line, []);
      continue;
    }
    // `-o`, or no `-n`: the match itself, with no position to show.
    push(byFile, str(input.value.path), { line: '', text: line });
  }

  return { groups: merge(byFile), overflow: Math.max(0, lines.length - capped.length) };
});

/**
 * `chemin-11-texte`, en préférant le *dernier* séparateur : un chemin peut porter
 * son propre `-2-` (`src/step-2-init.ts`). Mais le texte aussi — une date
 * `2026-03-30` a fait basculer 4 lignes du parc dans le nom du fichier. Un chemin
 * n'a pas d'espace, une ligne de code presque toujours : quand le premier essai
 * en produit un, on retient le premier séparateur au lieu du dernier.
 */
function contextLine(line: string): RegExpExecArray | null {
  const greedy = CTX_FILE.exec(line);
  if (!greedy) return null;
  return /\s/.test(greedy[1] ?? '') ? CTX_FILE_FIRST.exec(line) : greedy;
}

function push(map: Map<string, Match[]>, file: string, match: Match): void {
  const list = map.get(file);
  if (list) list.push(match);
  else map.set(file, [match]);
}

const slash = (p: string): string => p.replace(/\\/g, '/');
const isAbsolute = (p: string): boolean => /^([a-z]:[\\/]|[\\/])/i.test(p);

/**
 * rg names a match by a path relative to the cwd, but its context lines by the
 * absolute path — the same file arrives under two keys, in 144 of the parc's
 * results. They are folded together under the shorter, readable name, then
 * re-ordered by line number, which the two interleaved streams had scrambled.
 *
 * Only an *absolute* key folds into a relative one. Two relative paths that end
 * alike are two different files: `README.md` and `docs/README.md` must stay apart.
 */
function merge(byFile: Map<string, Match[]>): { file: string; matches: Match[] }[] {
  const relatives = [...byFile.keys()].filter((k) => !isAbsolute(k));
  const out = new Map<string, Match[]>();

  for (const [key, matches] of byFile) {
    const name = isAbsolute(key)
      ? (relatives.find((k) => slash(key).endsWith(`/${slash(k)}`)) ?? key)
      : key;
    const list = out.get(name);
    if (list) list.push(...matches);
    else out.set(name, [...matches]);
  }

  return [...out].map(([file, matches]) => ({
    file,
    // Only when every line is numbered: otherwise arrival order is all we have.
    matches: matches.every((m) => m.line)
      ? [...matches].sort((a, b) => Number(a.line) - Number(b.line))
      : matches,
  }));
}

const hits = computed(() => parsed.value.groups);
const overflow = computed(() => parsed.value.overflow);

/**
 * `head_limit` coupe à la source : la liste paraît complète et ne l'est pas.
 * L'outil le dit lui-même en pied de sortie, 233 fois dans le parc — on relaie
 * son constat plutôt que de le déduire d'un comptage, et surtout on cesse de
 * l'afficher comme s'il était une correspondance trouvée dans un fichier.
 */
const limited = computed(() => {
  const found = PAGINATION.exec(raw.value);
  if (!found || rawOnly.value) return '';
  const limit = /limit: (\d+)/.exec(found[1] ?? '')?.[1];
  const offset = /offset: (\d+)/.exec(found[1] ?? '')?.[1];
  const parts = [
    offset && t('replay.tools.views.grep.pagedOffset', { n: offset }),
    limit && t('replay.tools.views.grep.pagedLimit', { n: limit }),
  ].filter(Boolean);
  return t('replay.tools.views.grep.paged', { parts: parts.join(', ') });
});

/** Every group is a bare file name: nothing was quoted, so show a file list. */
const filesOnly = computed(() => hits.value.every((g) => g.matches.length === 0));
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
.gv-files {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-height: 420px;
  overflow: auto;
}
.gv-path {
  display: flex;
  // Une `q-icon` se cale sur son bord inférieur en `baseline`, un peu au-dessus
  // du texte à côté. Le chemin tient toujours sur une ligne — `center` aligne
  // donc le glyphe sur elle, sans avoir à lui calculer une hauteur.
  align-items: center;
  gap: var(--space-xs);
  margin: 0 0 var(--space-xs);
  font-size: var(--fs-xs);
  overflow: hidden;
  white-space: nowrap;
}
.gv-dir {
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
}
.gv-base {
  color: var(--text);
  flex-shrink: 0;
}
.gv-lines {
  list-style: none;
  margin: 0;
  padding: 0;
  border-left: 2px solid var(--line-2);
}
.gv-line {
  display: flex;
  gap: var(--space-md);
  padding: 1px var(--space-sm);
}
.gv-line:hover {
  background: var(--hover-overlay);
}
// Le voisinage demandé par `-C` : présent pour situer, pas pour être lu d'abord.
.gv-ctx .gv-text {
  color: var(--faint);
}
.gv-no {
  flex: 0 0 3.5em;
  text-align: right;
  color: var(--faint);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-xs);
  user-select: none;
}
.gv-text {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-word;
  min-width: 0;
}
</style>
