<template>
  <div class="cx">
    <p v-if="!hasAnyTurn" class="cx-empty">
      {{ t('replay.context.empty') }}
    </p>

    <template v-else>
      <!-- Header: the only exact figures on this panel. -->
      <header class="cx-head">
        <template v-if="windowTokens > 0">
          <p class="cx-fill font-mono">
            <strong>{{ fmtNum(windowTokens) }}</strong>
            <span class="cx-fill-limit">{{
              t('replay.context.fillLimit', { n: fmtNum(context.limit) })
            }}</span>
            <span class="cx-fill-pct">{{ fillLabel }}</span>
          </p>
          <!-- Repeats the figures above, so it is decorative. -->
          <div class="cx-gauge" role="presentation">
            <div class="cx-gauge-fill" :style="{ width: `${Math.min(100, fillPercent)}%` }" />
          </div>
          <p class="cx-caption">
            <template v-if="lastTurn">
              {{ t('replay.context.captionLast') }}
            </template>
            <template v-else>
              {{ t('replay.context.captionAfterCompaction') }}
            </template>
          </p>
        </template>
        <!-- Une taille d'après nulle veut dire « pas encore su » : le harness
             l'écrit à la fin du tour. Un socle pèse toujours des milliers de
             tokens, donc zéro ne peut pas être une vraie fenêtre. -->
        <p v-else class="cx-caption">
          {{ t('replay.context.captionPending') }}
        </p>

        <!-- La montée du remplissage sur toute la session, compactions comprises :
             une donnée qu'on stockait déjà tour par tour et qu'on ne montrait pas. -->
        <ContextFillCurve :context="context" />

        <!-- Le coût, quand on sait le chiffrer. Prix catalogue de l'API, pas ce
             qu'un abonnement facture : la nuance est dite, pas sous-entendue. -->
        <p v-if="cost !== null" class="cx-cost font-mono">
          <span>{{ cost }}</span>
          <!-- L'espace qui sépare les deux vit ici : vue-i18n rabote celui d'un
               message, et « au moins —prix catalogue » se lirait mal. -->
          <span class="cx-cost-note">
            {{ costPartial ? `${t('replay.context.costFloor')} ` : ''
            }}{{ t('replay.context.costNote') }}
          </span>
        </p>
      </header>

      <!-- Phases exist only once the window has been collapsed at least once. -->
      <fieldset v-if="phases.length > 1" class="cx-phases">
        <legend class="cx-legend">{{ t('replay.context.phaseLegend') }}</legend>
        <q-btn
          v-for="p in phases"
          :key="p"
          flat
          dense
          no-caps
          size="sm"
          :label="p === phases.length - 1 ? t('replay.context.phaseCurrent') : String(p + 1)"
          :class="{ 'cx-phase--on': p === phase }"
          :aria-pressed="p === phase"
          @click="selectPhase(p)"
        />
      </fieldset>

      <fieldset v-if="lastTurn" class="cx-views">
        <legend class="cx-legend">{{ t('replay.context.viewLegend') }}</legend>
        <q-btn
          flat
          dense
          no-caps
          size="sm"
          icon="list"
          :label="t('replay.context.views.category')"
          :class="{ 'cx-phase--on': view === 'category' }"
          :aria-pressed="view === 'category'"
          @click="view = 'category'"
        />
        <q-btn
          flat
          dense
          no-caps
          size="sm"
          icon="sort"
          :label="t('replay.context.views.ranked')"
          :class="{ 'cx-phase--on': view === 'ranked' }"
          :aria-pressed="view === 'ranked'"
          @click="view = 'ranked'"
        />
        <!-- Dénormalisée : un Read de 40 k ne se cache plus derrière son agrégat. -->
        <q-btn
          flat
          dense
          no-caps
          size="sm"
          icon="format_align_left"
          :label="t('replay.context.views.flat')"
          :class="{ 'cx-phase--on': view === 'flat' }"
          :aria-pressed="view === 'flat'"
          @click="view = 'flat'"
        />
        <!-- Ce que chaque tour a ajouté : croissance exacte, détail estimé. -->
        <q-btn
          flat
          dense
          no-caps
          size="sm"
          icon="timeline"
          :label="t('replay.context.views.byTurn')"
          :class="{ 'cx-phase--on': view === 'byTurn' }"
          :aria-pressed="view === 'byTurn'"
          @click="view = 'byTurn'"
        />
      </fieldset>

      <!-- Une phase qui vient de s'ouvrir n'a pas encore de tour : le panneau
           gardait alors le silence complet, sélecteur de phase compris, et la
           session paraissait n'avoir jamais rien mesuré. -->
      <p v-if="!lastTurn" class="cx-empty">
        {{ t('replay.context.emptyPhase') }}
      </p>
      <p v-else-if="!visible.length" class="cx-empty">{{ t('replay.context.emptyInjections') }}</p>

      <!-- Grouped: what kind of thing is eating the window. -->
      <ul v-else-if="view === 'category'" class="cx-sections">
        <li v-for="g in groups" :key="g.key">
          <details
            class="cx-section"
            :open="openKeys.has(g.key)"
            @toggle="onSectionToggle(g.key, $event)"
          >
            <summary class="cx-section-head">
              <span class="cx-swatch" :style="{ background: g.color }" aria-hidden="true" />
              <span class="cx-section-label">{{ g.label }}</span>
              <span class="cx-count">{{ g.rows.length }}</span>
              <span class="cx-tokens font-mono">~{{ fmtNum(g.tokens) }}</span>
            </summary>
            <!-- Une catégorie faite de chemins (les mémoires, les règles) se lit
                 en arbre de dossiers ; les autres, en liste. -->
            <ContextTree
              v-if="g.asTree"
              :nodes="g.tree"
              class="cx-tree"
              @navigate="emit('navigate', $event)"
            />
            <ul v-else class="cx-items">
              <ContextRow
                v-for="(row, i) in g.rows"
                :key="i"
                :row="row"
                @navigate="emit('navigate', $event)"
              />
            </ul>
          </details>
        </li>
      </ul>

      <!-- Par tour : ce que chaque tour a ajouté à la fenêtre. -->
      <template v-else-if="view === 'byTurn'">
        <p class="cx-caption cx-byturn-cap">
          <i18n-t keypath="replay.context.byTurnCaption" tag="span" scope="global">
            <template #exact>
              <strong>{{ t('replay.context.byTurnExact') }}</strong>
            </template>
          </i18n-t>
          <template v-if="live"> {{ t('replay.context.byTurnLiveOrder') }}</template>
        </p>
        <ul class="cx-turns">
          <li v-for="g in shownTurns" :key="g.turnIndex">
            <details class="cx-turn">
              <summary class="cx-turn-head">
                <q-icon name="chevron_right" size="14px" class="cx-turn-chev" aria-hidden="true" />
                <a
                  class="cx-turn-link font-mono"
                  href="#"
                  :aria-label="t('replay.context.goToTurn', { n: g.turnIndex + 1 })"
                  @click.prevent.stop="g.uuid && emit('navigate', g.uuid)"
                  >{{ t('replay.context.turnLink', { n: g.turnIndex + 1 }) }}</a
                >
                <span class="cx-turn-delta font-mono">+{{ fmtNum(g.delta) }}</span>
              </summary>
              <ul class="cx-items">
                <ContextRow
                  v-for="(row, i) in g.rows"
                  :key="i"
                  :row="row"
                  :pill="pillFor(row)"
                  :color="colorOf(row.category)"
                  @navigate="emit('navigate', $event)"
                />
              </ul>
            </details>
          </li>
        </ul>
      </template>

      <!-- Par taille, puis à plat : la chose la plus chère, d'abord. -->
      <ul v-else class="cx-ranked">
        <ContextRow
          v-for="(row, i) in view === 'ranked' ? rankedRows : flatRows"
          :key="i"
          :row="row"
          :pill="pillFor(row)"
          :color="colorOf(row.category)"
          @navigate="emit('navigate', $event)"
        />
      </ul>

      <!--
        Le reste, qu'aucune injection n'explique. Il n'est pas d'une seule nature :
        le socle se déduit d'un chiffre exact, le résidu ne se déduit de rien. Les
        confondre sous une ligne unique laissait croire qu'on savait.
      -->
      <section v-if="lastTurn && unattributed > 0" class="cx-rest">
        <p v-if="baseline > 0" class="cx-rest-line">
          <span class="cx-swatch" :style="{ background: tokens.muted }" aria-hidden="true" />
          <span class="cx-item-label">{{ t('replay.context.baseline') }}</span>
          <span class="cx-tokens font-mono">{{ fmtNum(baseline) }}</span>
        </p>
        <i18n-t
          v-if="baseline > 0"
          keypath="replay.context.baselineNote"
          tag="p"
          class="cx-note"
          scope="global"
        >
          <template #exact>
            <strong>{{ t('replay.context.baselineExact') }}</strong>
          </template>
        </i18n-t>

        <p class="cx-rest-line" :class="{ 'cx-rest-line--gap': baseline > 0 }">
          <span class="cx-swatch cx-swatch--faint" aria-hidden="true" />
          <span class="cx-item-label">{{ t('replay.context.residual') }}</span>
          <span class="cx-tokens font-mono">{{ fmtNum(residual) }}</span>
        </p>
        <p class="cx-note">
          {{ t('replay.context.residualNote') }}
          <template v-if="context.compactions.length">
            {{ t('replay.context.residualCompacted') }}
          </template>
        </p>
      </section>

      <i18n-t
        v-if="lastTurn"
        keypath="replay.context.estimateNote"
        tag="p"
        class="cx-note"
        scope="global"
      >
        <template #estimated>
          <strong>{{ t('replay.context.estimateEmphasis') }}</strong>
        </template>
      </i18n-t>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { onExpandAll } from 'src/composables/useExpandAll';
import { useChartTokens, seriesColor } from 'src/composables/useChartTokens';
import { fmtCost, fmtNum, fmtPercent } from 'src/utils/format';
import ContextRow from './ContextRow.vue';
import ContextTree from './ContextTree.vue';
import ContextFillCurve from './ContextFillCurve.vue';
import { toFlatRows, toRow, toTurnGroups, type ContextRowModel } from './contextRows';
import { buildTree, hasFolders } from './contextTree';
import type { ContextCategory, ContextInjection, SessionContext } from 'src/services/projects';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    context: SessionContext;
    /** Coût de la session en dollars, prix catalogue API ; `null` si non chiffrable. */
    costUsd?: number | null;
    /** Le coût est un plancher : un modèle sans tarif a été rencontré. */
    costPartial?: boolean;
    /**
     * Le panneau accompagne une session en cours.
     *
     * Deux conséquences, et une seule raison : devant un direct, ce qui vient
     * d'arriver prime sur le bilan. La vue par tour est celle qu'on ouvre, et
     * les tours se lisent du plus récent au plus ancien — sans quoi il faudrait
     * défiler jusqu'en bas à chaque nouvelle réponse.
     */
    live?: boolean;
  }>(),
  { costUsd: null, costPartial: false, live: false },
);

const emit = defineEmits<{
  /** L'uuid de la réponse à laquelle le lecteur veut se rendre. */
  navigate: [uuid: string];
  /**
   * Le remplissage, pour qui affiche le panneau derrière un repli et doit dire
   * en une ligne ce qu'il contient. `null` quand la session n'a aucun relevé :
   * un « 0 % » se lirait comme une fenêtre vide, ce qui est faux.
   *
   * Le chiffre suit le sélecteur de phase interne — l'en-tête décrit ce que le
   * panneau montre, pas une autre phase.
   */
  summary: [{ total: number; limit: number; percent: number } | null];
}>();

const tokens = useChartTokens();

/**
 * Fixed order: it assigns the colour slots, and `app.scss` documents that the
 * order *is* the colour-blind safety mechanism. Never sort these by value.
 */
const CATEGORIES: ContextCategory[] = [
  'memory',
  'skills',
  'files',
  'tools',
  'thinking',
  'userMessage',
  // La machinerie, pas le contenu : listings d'agents et d'outils, instructions
  // MCP, rappels de tâches, sortie des hooks, notifications de sous-agents. Elle
  // se dessine en gris — la palette n'a que six teintes, et le thème interdit
  // d'en réutiliser une.
  'harness',
];

// Le bilan par défaut ; le direct s'ouvre sur les tours. Une fois posée, la vue
// suit le lecteur : c'est un point de départ, jamais un mode imposé.
const view = ref<'category' | 'ranked' | 'flat' | 'byTurn'>(props.live ? 'byTurn' : 'category');

// Tous les tours : chaque `<details>` tient sur une ligne repliée, et en cacher
// ferait mentir la vue sur ce que la session a fait. En direct, l'ordre
// s'inverse — le dernier tour est celui qu'on vient de voir passer.
const shownTurns = computed(() => {
  const groups = toTurnGroups(props.context, phase.value, visible.value);
  return props.live ? [...groups].reverse() : groups;
});

/**
 * Le coût, mis en forme, ou `null` s'il n'y a rien à dire.
 *
 * Un vrai zéro (session locale gratuite) reste `null` — le serveur ne le
 * distingue du « non chiffrable » que par cette valeur.
 */
const cost = computed(() => {
  const usd = props.costUsd;
  if (usd === null || usd === undefined) return null;
  if (usd === 0) return null;
  return fmtCost(usd);
});
const costPartial = computed(() => props.costPartial);

/** One phase per compaction, plus the one running now. */
const phases = computed(() =>
  props.context.compactions.map((_, i) => i).concat(props.context.compactions.length),
);
const phase = ref(0);

/**
 * Où le fil doit se rendre quand on choisit une phase : sur ce qui l'ouvre.
 *
 * Pour une phase née d'une compaction, c'est le marqueur lui-même — le résumé
 * conservé le suit immédiatement, et c'est exactement ce que le modèle a vu en
 * premier. Son `uuid` est celui de la ligne `compact_boundary`, donc celui du
 * nœud que le fil rend. La première phase, elle, s'ouvre sur son premier tour :
 * rien ne la précède.
 *
 * Le repli sur le premier tour couvre la phase dont le marqueur n'aurait pas
 * d'ancre. Vide quand la phase n'a encore rien joué : le panneau change alors de
 * phase sans faire bouger le fil, plutôt que de l'envoyer ailleurs.
 */
function anchorOfPhase(p: number): string {
  const compaction = p > 0 ? props.context.compactions[p - 1] : undefined;
  if (compaction?.uuid) return compaction.uuid;
  return props.context.turns.find((t) => t.phase === p && t.total > 0)?.uuid ?? '';
}

/**
 * Choisir une phase, c'est demander à la lire : le panneau la montre, et le fil
 * la déplie et s'y rend. Les deux vues parlaient de la même frontière sans
 * jamais se suivre.
 */
function selectPhase(p: number): void {
  phase.value = p;
  const uuid = anchorOfPhase(p);
  if (uuid) emit('navigate', uuid);
}

// Land on the phase the session ended in; that is the one the reader cares about.
watch(
  () => props.context,
  () => (phase.value = props.context.compactions.length),
  { immediate: true },
);

/** The last anchored turn of the selected phase — the window at its fullest. */
const lastTurn = computed(() => {
  const anchored = props.context.turns.filter((t) => t.total > 0 && t.phase === phase.value);
  return anchored[anchored.length - 1] ?? null;
});

/**
 * La session a-t-elle jamais produit un relevé ?
 *
 * À distinguer d'une *phase* sans tour, qui est l'état normal de la seconde qui
 * suit une compaction : la fenêtre existe, elle vient d'être vidée, et rien ne
 * l'a encore remplie. Confondre les deux faisait disparaître le panneau entier
 * — sélecteur de phase compris — sur une session qui avait pourtant tout mesuré.
 */
const hasAnyTurn = computed(() => props.context.turns.some((t) => t.total > 0));

/**
 * La fenêtre de la phase : sa taille au dernier tour, ou celle dont elle repart
 * quand aucun tour ne l'a encore garnie. Les deux sont des chiffres du harness.
 *
 * `0` veut dire « pas encore su » — le harness écrit `postTokens` à la fin du
 * tour de compaction, et un socle seul pèse des milliers de tokens.
 */
const windowTokens = computed(() => {
  if (lastTurn.value) return lastTurn.value.total;
  if (phase.value === 0) return props.context.baseline;
  return props.context.compactions[phase.value - 1]?.postTokens ?? 0;
});

const fillPercent = computed(() =>
  windowTokens.value > 0 ? Math.round((windowTokens.value / props.context.limit) * 100) : 0,
);

// L'espace insécable du français devant le signe vient d'`Intl`, pas de la
// chaîne : la recoller à la main donnerait « 68 % » des deux côtés.
const fillLabel = computed(() => fmtPercent(fillPercent.value / 100));

// Le même chiffre que l'en-tête, dit à qui nous affiche.
watch(
  [windowTokens, fillPercent],
  ([total, percent]) => {
    emit('summary', total > 0 ? { total, limit: props.context.limit, percent } : null);
  },
  { immediate: true },
);

/**
 * Injections of this phase, up to and including the turn we report on. A later
 * turn's output has not entered the window we are describing.
 */
const visible = computed<ContextInjection[]>(() => {
  const turn = lastTurn.value;
  if (!turn) return [];
  return props.context.injections.filter(
    (i) => i.phase === phase.value && i.turnIndex <= turn.turnIndex && i.tokens > 0,
  );
});

const rankedRows = computed(() =>
  [...visible.value].sort((a, b) => b.tokens - a.tokens).map((i) => toRow(props.context, i)),
);

const flatRows = computed(() => toFlatRows(props.context, visible.value));

const groups = computed(() =>
  CATEGORIES.map((key) => {
    const items = visible.value
      .filter((x) => x.category === key)
      .sort((a, b) => b.tokens - a.tokens);
    const rows = items.map((i) => toRow(props.context, i));
    const tree = buildTree(rows);
    return {
      key,
      label: t(`replay.context.categories.${key}`),
      color: colorOf(key),
      tokens: items.reduce((sum, x) => sum + x.tokens, 0),
      rows,
      tree,
      // Un arbre n'a de sens que s'il y a des dossiers à montrer.
      asTree: hasFolders(tree),
    };
  }).filter((g) => g.rows.length > 0),
);

// One `<details>` per category, so the fold is a set of open keys rather than a
// ref per element. Starts empty: the drawer is a summary first, a listing second.
const openKeys = ref(new Set<string>());
function onSectionToggle(key: string, e: Event): void {
  const next = new Set(openKeys.value);
  if ((e.target as HTMLDetailsElement).open) next.add(key);
  else next.delete(key);
  openKeys.value = next;
}
onExpandAll((open) => {
  openKeys.value = open ? new Set(groups.value.map((g) => g.key)) : new Set();
});

/**
 * What the injections fail to account for. Recomputed here rather than read from
 * `turn.unattributed`, so that the figures on screen add up to the total shown
 * above them — the server clamps against a slightly different set of injections.
 */
const unattributed = computed(() => {
  const turn = lastTurn.value;
  if (!turn) return 0;
  const attributed = visible.value.reduce((sum, x) => sum + x.tokens, 0);
  return Math.max(0, turn.total - attributed);
});

/**
 * Le socle, borné par ce qu'il reste à expliquer.
 *
 * Il est mesuré sur le premier tour de la session, jamais sur la phase affichée :
 * le prompt système ne disparaît pas à la compaction. Le plafond n'intervient
 * qu'au premier tour lui-même, où l'estimation des catégories peut mordre dessus
 * de quelques tokens ; sans lui le « reste » passerait sous zéro.
 */
// `?? 0` par prudence : si un serveur d'une version antérieure renvoyait un
// contexte sans `baseline`, `Math.min(undefined, …)` vaudrait NaN et le « reste »
// s'afficherait « NaN ». Mieux vaut ne rien affirmer que mentir.
const baseline = computed(() => Math.min(props.context.baseline ?? 0, unattributed.value));
const residual = computed(() => Math.max(0, unattributed.value - baseline.value));

function indexOf(category: ContextCategory): number {
  return CATEGORIES.indexOf(category);
}
/**
 * `harness` n'est pas une catégorie de graphique : c'est ce que la machine met
 * là toute seule. Elle prend le gris du socle et du reste, pas une teinte de
 * `--series-*` — qui n'en a que six, toutes attribuées.
 */
function colorOf(category: ContextCategory): string {
  if (category === 'harness') return tokens.value.muted;
  const i = indexOf(category);
  return i >= 0 ? seriesColor(tokens.value, i) : tokens.value.muted;
}
function pillOf(category: ContextCategory): string {
  return t(`replay.context.pills.${category}`);
}
/**
 * La pastille d'une ligne, pas seulement de sa catégorie.
 *
 * Une règle chargée par glob vit dans la catégorie mémoire, dont la pastille dit
 * « CLAUDE.md » — ce qu'une règle n'est pas. Hors de l'arbre (vues à plat, par
 * taille, par tour), son label commence par `rules/` : on l'étiquette pour ce
 * qu'elle est.
 */
function pillFor(row: ContextRowModel): string {
  if (row.category === 'memory' && row.label.startsWith('rules/')) {
    return t('replay.context.pills.rule');
  }
  return pillOf(row.category);
}
</script>

<style scoped lang="scss">
.cx {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  font-size: var(--fs-xs);
}

.cx-empty {
  color: var(--muted);
  margin: 0;
}

// ── Header ───────────────────────────────────────────────────────────────────
.cx-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.cx-fill {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  margin: 0;

  strong {
    font-size: var(--fs-lg);
    color: var(--text);
  }
}

.cx-fill-limit {
  font-size: var(--fs-2xs);
  color: var(--faint);
}

.cx-fill-pct {
  margin-left: auto;
  color: var(--muted);
}

.cx-gauge {
  height: 5px;
  border-radius: var(--radius-xs);
  background: var(--surface-3);
  overflow: hidden;
}

.cx-gauge-fill {
  height: 100%;
  background: var(--brand);
}

.cx-caption {
  margin: 0;
  font-size: var(--fs-2xs);
  color: var(--faint);
}

.cx-cost {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  flex-wrap: wrap;

  > span:first-child {
    color: var(--text);
    font-size: var(--fs-sm);
  }
}
.cx-cost-note {
  font-size: var(--fs-2xs);
  color: var(--faint);
}

// ── Toggles ──────────────────────────────────────────────────────────────────
.cx-phases,
.cx-views {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  border: 0;
  padding: 0;
  margin: 0;
}

.cx-legend {
  font-size: var(--fs-2xs);
  color: var(--faint);
  padding: 0 var(--space-xs) 0 0;
}

.cx-phase--on {
  background: var(--brand-soft);
  color: var(--brand);
}

// ── Sections & rows ──────────────────────────────────────────────────────────
.cx-sections,
.cx-ranked,
.cx-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.cx-sections > li + li {
  margin-top: 2px;
}

.cx-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs);
  border-radius: var(--radius-xs);
  cursor: pointer;

  &:hover {
    background: var(--surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
}

.cx-section-label {
  flex: 1;
  color: var(--text);
}

.cx-count {
  min-width: 18px;
  text-align: center;
  border-radius: var(--radius-xs);
  background: var(--surface-3);
  color: var(--muted);
  font-size: var(--fs-2xs);
  padding: 0 4px;
}

.cx-tokens {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.cx-swatch {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  flex: none;
}

// Les listes portent le retrait ; chaque ligne est un `ContextRow`.
.cx-items {
  padding: 2px 0 var(--space-xs) var(--space-xs);
}
.cx-tree {
  padding: 2px 0 var(--space-xs) var(--space-xs);
}

// ── Vue par tour ─────────────────────────────────────────────────────────────
.cx-byturn-cap {
  margin: 0 0 var(--space-xs);
}
.cx-turns {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cx-turns > li + li {
  margin-top: 1px;
}
.cx-turn > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px var(--space-xs);
  border-radius: var(--radius-xs);

  &:hover {
    background: var(--surface-2);
  }
  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
}
.cx-turn > summary::-webkit-details-marker {
  display: none;
}
.cx-turn-chev {
  color: var(--faint);
  flex: none;
  transition: transform 0.12s ease;
}
.cx-turn[open] .cx-turn-chev {
  transform: rotate(90deg);
}
.cx-turn-link {
  color: var(--brand-muted);
  text-decoration: none;
  border-bottom: 1px dotted currentcolor;

  &:hover {
    color: var(--brand);
  }
  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
}
.cx-turn-delta {
  margin-left: auto;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.cx-turn-est {
  flex: none;
  font-size: var(--fs-2xs);
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.cx-ranked {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

// Sert encore aux deux lignes du « reste » (socle, résidu), qui ne sont pas des
// `ContextRow` : elles ne mènent nulle part et n'ont rien à déplier.
.cx-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
}

// ── Remainder & note ─────────────────────────────────────────────────────────
.cx-rest {
  border-top: 1px solid var(--line);
  padding-top: var(--space-sm);
}

.cx-rest-line {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
}

.cx-rest-line--gap {
  margin-top: var(--space-sm);
}

.cx-swatch--faint {
  background: var(--faint);
}

.cx-note {
  margin: var(--space-xs) 0 0;
  font-size: var(--fs-2xs);
  color: var(--faint);
  line-height: 1.5;
}
</style>
