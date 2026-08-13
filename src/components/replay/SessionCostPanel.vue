<template>
  <div class="sd-body">
    <div v-if="loading" class="sd-loading">
      <q-skeleton type="rect" height="90px" />
      <q-skeleton type="rect" height="140px" />
      <q-skeleton type="rect" height="120px" />
    </div>

    <p v-else-if="error" class="sd-state" role="alert">
      <q-icon name="error_outline" size="20px" aria-hidden="true" />
      {{ error }}
    </p>

    <p v-else-if="!report?.found" class="sd-state">
      <q-icon name="info" size="20px" aria-hidden="true" />
      {{ t('replay.cost.none') }}
    </p>

    <template v-else>
      <!-- ── Le total, et en quoi il se partage ─────────────────────── -->
      <section class="sd-sec">
        <p class="sd-total font-mono">
          {{ money(report.cost.total) }}
          <span v-if="report.cost.partial" class="sd-floor">{{ t('replay.cost.floor') }}</span>
        </p>
        <p class="sd-total-note">{{ t('replay.cost.rate') }}</p>

        <!-- Une seule barre : les quatre postes se somment au total, et leur
             rapport est tout le propos. -->
        <div class="sd-bar" role="img" :aria-label="breakdownAria">
          <span
            v-for="p in parts"
            :key="p.key"
            class="sd-bar-part"
            :style="{ width: widthOf(p.value), background: p.color }"
          />
        </div>

        <dl class="sd-parts">
          <div v-for="p in parts" :key="p.key" class="sd-part">
            <dt>
              <span class="sd-dot" :style="{ background: p.color }" aria-hidden="true" />
              {{ p.label }}
            </dt>
            <dd class="font-mono">{{ money(p.value) }}</dd>
            <dd class="sd-part-pct font-mono">{{ pctOf(p.value) }}</dd>
          </div>
        </dl>

        <p class="sd-hint">{{ hint }}</p>

        <p v-if="report.cost.partial" class="sd-warn">
          <q-icon name="info" size="14px" aria-hidden="true" />
          {{ t('replay.cost.unpriced', { models: report.cost.unpricedModels.join(', ') }) }}
        </p>
      </section>

      <!-- ── Où elle se situe ───────────────────────────────────────── -->
      <section class="sd-sec">
        <p class="section-label sd-sec-label">
          {{ t('replay.cost.parc', { n: report.parcSessions }) }}
        </p>
        <ul class="sd-ranks">
          <li v-for="r in report.ranks" :key="r.metric" class="sd-rank">
            <div class="sd-rank-head">
              <span class="sd-rank-label">{{ r.label }}</span>
              <span class="sd-rank-value font-mono">{{ unitValue(r.value, r.unit) }}</span>
            </div>
            <!-- Une règle, deux repères : la médiane du parc, et cette
                 session. Le remplissage porte le rang, pas la valeur — les
                 montants s'étalent sur trois ordres de grandeur. -->
            <div class="sd-scale">
              <span class="sd-scale-fill" :style="{ width: `${r.rank * 100}%` }" />
              <span class="sd-scale-median" aria-hidden="true" />
            </div>
            <p class="sd-rank-note">
              {{ rankSentence(r) }}
              <span class="sd-rank-median font-mono">
                {{ t('replay.cost.median', { v: unitValue(r.median, r.unit) }) }}
              </span>
            </p>
          </li>
        </ul>
      </section>

      <!-- ── Ce que les règles en disent ────────────────────────────── -->
      <section v-if="report.findings.length" class="sd-sec">
        <p class="section-label sd-sec-label">
          {{ t('replay.cost.findings', report.findings.length) }}
        </p>
        <ul class="sd-findings">
          <li v-for="f in report.findings" :key="f.id" class="sd-finding">
            <q-icon
              :name="severityIcon(f.severity)"
              :style="{ color: severityColor(f.severity) }"
              size="16px"
              :aria-label="severityLabel(f.severity)"
              class="sd-finding-icon"
            />
            <div class="sd-finding-body">
              <p class="sd-finding-title">{{ f.title }}</p>
              <p class="sd-finding-msg">{{ findingText(f) }}</p>
            </div>
          </li>
        </ul>
        <router-link class="sd-more" :to="{ name: 'diagnostic' }">
          {{ t('replay.cost.more') }}
          <q-icon name="chevron_right" size="16px" aria-hidden="true" />
        </router-link>
      </section>

      <p v-else class="sd-state sd-state--calm">
        <q-icon name="check_circle" size="20px" aria-hidden="true" />
        {{ t('replay.cost.calm') }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
// Le coût d'une session, décomposé et situé.
//
// Le total existe déjà dans l'en-tête du rejeu ; ce qu'il ne dit pas, c'est en
// quoi il se partage. Sur une session longue, la relecture d'historique domine
// le coût — et c'est le seul poste sur lequel on peut agir, en coupant les
// sessions plus tôt. Le reste (construire la fenêtre, générer) se paie de toute
// façon.
//
// Une précaution de ton : une session chère n'est pas une faute. Les sessions les
// plus coûteuses affichent souvent un excellent taux de cache — elles ne sont pas
// inefficaces, elles sont longues. L'écran informe, il ne note pas.
//
// Le panneau ne connaît pas sa surface d'accueil : il tient dans une colonne
// latérale de rejeu comme il tenait dans un tiroir. Le titre et le cadre sont à
// l'appelant.

import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  getSessionDiagnostic,
  type Finding,
  type SessionDiagnostic,
  type SessionRank,
  type Severity,
} from 'src/services/diagnostics';
import {
  severityIcon,
  severityColor,
  severityLabel,
  worstSeverity,
} from 'src/services/diagnostics/severity';
import { fmtMoney, fmtPercent } from 'src/utils/format';

const { t } = useI18n();

const props = defineProps<{ project: string; sessionId: string }>();

const emit = defineEmits<{
  /**
   * Le bilan en une ligne, pour qui affiche le panneau derrière un repli.
   * `null` tant que rien n'est chargé — un « 0 $ » pendant la requête se lirait
   * comme une session gratuite.
   */
  summary: [
    { totalUsd: number; partial: boolean; worst: Severity | null; findings: number } | null,
  ];
}>();

const loading = ref(false);
const error = ref('');
const report = ref<SessionDiagnostic | null>(null);

/**
 * Charger en tâche de fond, sans retenir le transcript.
 *
 * Situer une session demande de relire tout le parc : quelques dizaines de
 * millisecondes une fois le cache du serveur chaud, trois secondes à froid. Rien
 * de tout cela n'est attendu par le flux de la conversation, qui se rend de son
 * côté ; le panneau montre son squelette pendant ce temps.
 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  const asked = props.sessionId;
  try {
    const got = await getSessionDiagnostic(props.project, props.sessionId);
    // La session a pu changer sous nos pieds pendant la requête.
    if (asked !== props.sessionId) return;
    report.value = got;
  } catch (e) {
    if (asked !== props.sessionId) return;
    error.value = e instanceof Error ? e.message : t('replay.cost.error');
    report.value = null;
  } finally {
    if (asked === props.sessionId) loading.value = false;
  }
}

onMounted(() => void load());

// Changer de session invalide ce qu'on montre.
watch(
  () => [props.project, props.sessionId],
  () => {
    report.value = null;
    error.value = '';
    void load();
  },
);

// Ce que le panneau a trouvé, dit à qui nous affiche : replié, c'est tout ce
// qu'on saura de lui.
watch(
  report,
  (r) => {
    if (!r) return emit('summary', null);
    emit('summary', {
      totalUsd: r.cost.total,
      partial: r.cost.partial,
      worst: worstSeverity(r.findings),
      findings: r.findings.length,
    });
  },
  { immediate: true },
);

// ── Formatage ────────────────────────────────────────────────────────────────

// Au-delà de dix dollars, les cents ne disent plus rien : ils allongent la
// colonne sans changer la décision qu'on prend en la lisant.
const money = (n: number): string => fmtMoney(n, n < 10 ? 2 : 0);

function unitValue(v: number, unit: SessionRank['unit']): string {
  if (unit === 'usd') return money(v);
  if (unit === 'ratio') return `${(v * 100).toFixed(0)} %`;
  if (unit === 'tokens')
    return v >= 1e6 ? `~${(v / 1e6).toFixed(1)} M` : `~${Math.round(v / 1000)} k`;
  // Un rapport garde sa décimale : « 2 explorations par modification » perd
  // exactement ce qui distingue 1,5 de 2,4.
  if (unit === 'rate') return v.toFixed(1);
  return String(Math.round(v));
}

// ── Décomposition ────────────────────────────────────────────────────────────

/**
 * Les quatre postes, dans l'ordre où ils se paient : l'entrée neuve, l'écriture
 * du cache, sa relecture, puis la génération. Les couleurs viennent de la rampe
 * de séries — ce sont des catégories, pas des états.
 */
const parts = computed(() => {
  const c = report.value?.cost;
  if (!c) return [];
  return [
    {
      key: 'read',
      label: t('replay.cost.parts.read'),
      value: c.cacheRead,
      color: 'var(--series-1)',
    },
    {
      key: 'create',
      label: t('replay.cost.parts.write'),
      value: c.cacheCreate,
      color: 'var(--series-2)',
    },
    {
      key: 'input',
      label: t('replay.cost.parts.input'),
      value: c.input,
      color: 'var(--series-3)',
    },
    {
      key: 'output',
      label: t('replay.cost.parts.output'),
      value: c.output,
      color: 'var(--series-4)',
    },
  ].filter((p) => p.value > 0);
});

function share(value: number): number {
  const total = report.value?.cost.total ?? 0;
  return total > 0 ? value / total : 0;
}

/** La part, écrite pour être lue : espace avant le signe, comme en français. */
function pctOf(value: number): string {
  return fmtPercent(share(value));
}

/** La barre est décorative : son nom accessible redit la répartition en mots. */
const breakdownAria = computed(() =>
  t('replay.cost.breakdownAria', {
    parts: parts.value.map((p) => `${p.label} ${money(p.value)}`).join(', '),
  }),
);

/**
 * La même part, écrite pour CSS.
 *
 * Deux fonctions et non une : `pctOf` produit « 77 % », avec l'espace que la
 * typographie française impose — et qu'une déclaration `width` refuse en
 * silence. Les segments restaient alors sans largeur, et la barre vide.
 */
function widthOf(value: number): string {
  return `${(share(value) * 100).toFixed(2)}%`;
}

/** Une phrase qui dit ce que la répartition veut dire, sans la répéter. */
const hint = computed(() => {
  const c = report.value?.cost;
  if (!c || c.total <= 0) return '';
  const share = c.cacheRead / c.total;
  if (share >= 0.6) {
    return t('replay.cost.hintHeavy', { pct: pctOf(c.cacheRead) });
  }
  if (share >= 0.3) {
    return t('replay.cost.hintGrowing');
  }
  return t('replay.cost.hintLight');
});

// ── Rang ─────────────────────────────────────────────────────────────────────

/**
 * Le rang, dit dans le sens du signal.
 *
 * Pour un signal où plus haut est pire, être au 99ᵉ centile se dit « plus que
 * 99 % de vos sessions ». Pour le taux de cache, c'est l'inverse qu'il faut
 * lire — et un rang élevé y est une bonne nouvelle.
 *
 * Deux précautions sur les bords. Le rang « milieu » plafonne à 1 − 0,5/n, qui
 * s'arrondit à 100 % : « plus que 100 % de vos sessions » n'a pas de sens, une
 * session ne se dépasse pas elle-même. Aux extrêmes on nomme donc l'extrême, et
 * partout ailleurs le pourcentage est borné à 99.
 */
function rankSentence(r: SessionRank): string {
  const n = r.sampleSize;
  const pct = Math.min(99, Math.round(r.rank * 100));
  const highest = n > 0 && r.rank >= 1 - 1 / n;
  const lowest = n > 0 && r.rank <= 1 / n;

  if (r.direction === 'low') {
    if (highest) return t('replay.cost.rank.bestLow', { n });
    if (lowest) return t('replay.cost.rank.lowestLow', { n });
    return pct >= 50
      ? t('replay.cost.rank.betterThan', { pct: fmtPercent(pct / 100) })
      : t('replay.cost.rank.under', { pct: fmtPercent((100 - pct) / 100) });
  }
  if (highest) return t('replay.cost.rank.highest', { n });
  if (lowest) return t('replay.cost.rank.lowest', { n });
  if (pct >= 90) return t('replay.cost.rank.moreThan', { pct: fmtPercent(pct / 100) });
  if (pct <= 25) return t('replay.cost.rank.lessThan', { pct: fmtPercent((100 - pct) / 100) });
  return t('replay.cost.rank.aboveA', { pct: fmtPercent(pct / 100) });
}

/**
 * Le constat, débarrassé de son préfixe d'identité.
 *
 * Les messages sont rédigés pour la page du parc, où « Session 61e42a15… : »
 * situe le constat parmi cinquante autres. Dans un panneau qui ne parle que
 * d'elle, c'est du bruit répété à chaque ligne. Le préfixe est reconstruit à
 * partir de la cible plutôt que deviné : on ne retire que ce qu'on a écrit.
 */
function findingText(f: Finding): string {
  const prefix = t('replay.cost.findingPrefix', { id: f.target.slice(0, 8) });
  return f.message.startsWith(prefix) ? f.message.slice(prefix.length) : f.message;
}

// La table de gravité vit dans `services/diagnostics/severity` : l'en-tête qui
// coiffe ce panneau montre la même icône pour le même constat.
</script>

<style scoped lang="scss">
.sd-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
.sd-loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.sd-state {
  display: flex;
  gap: var(--space-sm);
  align-items: flex-start;
  color: var(--muted);
  font-size: var(--fs-sm);
  margin: 0;

  // La boîte de l'icône vaut une ligne de texte, pour que la glyphe se centre
  // dessus. Pas `1.5em` : sur une `q-icon`, `em` se résout sur la taille de
  // l'icône (20 px), soit une boîte de 30 px pour une ligne de 18 — la glyphe
  // tombait six pixels sous le texte.
  > .q-icon {
    flex: 0 0 auto;
    height: calc(var(--fs-sm) * 1.5);
  }
}
.sd-state--calm {
  color: var(--pulse);
}

.sd-sec {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.sd-sec-label {
  color: var(--dim);
  margin: 0;
}

// ── Total ────────────────────────────────────────────────────────────────────

.sd-total {
  font-size: var(--fs-xl);
  color: var(--brand);
  margin: 0;
  line-height: 1.1;
}
.sd-floor {
  font-size: var(--fs-xs);
  color: var(--dim);
  margin-left: var(--space-xs);
}
.sd-total-note {
  color: var(--faint);
  font-size: var(--fs-xs);
  margin: 0 0 var(--space-xs);
}

.sd-bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--surface-3);
}
.sd-bar-part {
  height: 100%;
  // Une hairline de surface sépare deux postes adjacents.
  box-shadow: inset -1px 0 0 var(--surface);
}

.sd-parts {
  margin: var(--space-xs) 0 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sd-part {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--space-sm);
  align-items: baseline;
  font-size: var(--fs-xs);

  dt {
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
  }
  dd {
    margin: 0;
    color: var(--text);
  }
}
.sd-part-pct {
  color: var(--faint);
  min-width: 2.6em;
  text-align: right;
}
.sd-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex: 0 0 auto;
}

.sd-hint {
  color: var(--muted);
  font-size: var(--fs-xs);
  line-height: 1.55;
  margin: var(--space-xs) 0 0;
}
.sd-warn {
  display: flex;
  gap: var(--space-xs);
  align-items: flex-start;
  color: var(--warn);
  font-size: var(--fs-xs);
  margin: 0;

  > .q-icon {
    flex: 0 0 auto;
    height: calc(var(--fs-xs) * 1.5);
  }
}

// ── Rangs ────────────────────────────────────────────────────────────────────

.sd-ranks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.sd-rank {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sd-rank-head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  align-items: baseline;
}
.sd-rank-label {
  color: var(--text);
  font-size: var(--fs-xs);
}
.sd-rank-value {
  color: var(--text);
  font-size: var(--fs-xs);
  flex: 0 0 auto;
}
.sd-scale {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: var(--surface-3);
  overflow: hidden;
}
.sd-scale-fill {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: 3px;
}
// La médiane du parc : toujours au milieu, par définition d'un rang.
.sd-scale-median {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--surface);
}
.sd-rank-note {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  color: var(--faint);
  font-size: var(--fs-2xs);
  margin: 0;
}
.sd-rank-median {
  flex: 0 0 auto;
}

// ── Constats ─────────────────────────────────────────────────────────────────

.sd-findings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.sd-finding {
  display: flex;
  gap: var(--space-sm);
  align-items: flex-start;
}
// Alignée sur la première ligne du constat, qui porte le titre en `--fs-sm`.
.sd-finding-icon {
  flex: 0 0 auto;
  height: calc(var(--fs-sm) * 1.5);
}
.sd-finding-body {
  min-width: 0;
}
.sd-finding-title {
  color: var(--text);
  font-size: var(--fs-sm);
  margin: 0;
}
.sd-finding-msg {
  color: var(--muted);
  font-size: var(--fs-xs);
  line-height: 1.55;
  margin: 2px 0 0;
}

.sd-more {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--brand);
  font-size: var(--fs-xs);
  text-decoration: none;
  margin-top: var(--space-xs);

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}
</style>
