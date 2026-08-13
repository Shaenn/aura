// Les règles : ce qui, dans un relevé, mérite qu'on en parle.
//
// `signals.ts` mesure, `thresholds.ts` dit à partir de quand, ce module désigne.
// Il ne fait rien d'autre : ni regroupement, ni priorisation, ni rédaction de
// recommandation — c'est l'étape suivante. Une règle prend un relevé et un seuil
// déjà calibré, et rend un constat ou rien.
//
// Trois principes qui décident de la forme des constats :
//
//  1. **Un chiffre mesuré n'est pas une économie.** Le CLI dont ce module descend
//     annonçait « ~2,4 M tokens potentiellement gaspillés » en multipliant une
//     mesure par un coefficient inventé (`compactSavingsRatio: 0.3`). Ici,
//     `impact` porte ce qu'on a *lu* — ce que la relecture d'historique a coûté,
//     ce que les sous-agents ont coûté — et `kind` dit d'où il sort. Personne ne
//     promet qu'on récupérerait cette somme : on dit où elle est passée. C'est
//     moins vendeur et c'est vrai.
//
//  2. **Le dollar quand il existe, le token sinon.** Le coût d'une réponse est
//     exact ; le poids d'un outil dans la fenêtre est une estimation en tokens
//     qu'aucune conversion honnête ne transforme en dollars — un token entré au
//     tour 3 est relu à chaque tour suivant, et rien dans le transcript ne dit à
//     quel tour il est entré. Un `impact` porte donc `usd`, `tokens`, ou les deux.
//
//  3. **Aucune constante de gravité.** La sévérité se déduit du dépassement du
//     seuil, uniformément : deux fois le seuil est critique, un tiers au-dessus
//     est un avertissement. Un parc qui se calme voit ses `critical` s'éteindre
//     tout seuls, sans qu'on ait retouché quoi que ce soit.

import { createHash } from 'node:crypto';
import { t } from '../i18n/index.ts';
import { pct, ratio, tok, usd } from './format.ts';
import type { SessionSignal } from './signals.ts';
import type { Pace } from './pace.ts';
import {
  exceeds,
  valueOf,
  type Calibration,
  type MetricName,
  type Thresholds,
} from './thresholds.ts';

// ── Ce qu'on publie ──────────────────────────────────────────────────────────

export type Severity = 'info' | 'warn' | 'critical';
export type Scope = 'session' | 'project' | 'global';

/**
 * Le chiffre qui porte le constat.
 *
 * `measured` : lu dans le transcript, ou somme de valeurs lues.
 * `estimated` : dérivé d'un `chars / 4` ou d'un prorata. Tout affichage doit le
 * marquer d'un `~`.
 *
 * Les deux chiffres peuvent manquer, et c'est un cas normal : « cette tâche a été
 * donnée en douze morceaux » est un constat vérifiable dont aucune dépense ne se
 * déduit. Lui coller le coût de la session serait lui attribuer une facture qu'il
 * n'a pas causée. `basis` porte alors ce qui a été compté, et rien de plus.
 */
export interface Impact {
  usd?: number;
  tokens?: number;
  kind: 'measured' | 'estimated';
  /** D'où sort le chiffre, en une phrase. Rendu à l'utilisateur. */
  basis: string;
}

/** Le seuil qui a déclenché, tel qu'il a été calibré — pour que l'UI puisse douter. */
export interface Trigger {
  metric: MetricName;
  value: number;
  threshold: number;
  /** Faux quand l'échantillon était trop maigre : le seuil vient du garde-fou. */
  calibrated: boolean;
  bound: Calibration['bound'];
}

export interface Finding {
  /** Stable d'un scan à l'autre : c'est lui qu'on met en liste d'exclusion. */
  id: string;
  rule: RuleName;
  severity: Severity;
  scope: Scope;
  /** `sessionId`, slug de projet, ou `''` pour un constat de parc. */
  target: string;
  /** Le projet concerné, pour le renvoi vers la session. */
  project: string;
  title: string;
  message: string;
  /** Ce que l'UI peut afficher en détail. Toujours des nombres, jamais du texte. */
  metrics: Record<string, number>;
  impact: Impact;
  trigger?: Trigger;
}

export const RULE_NAMES = [
  // Ce qui coûte
  'historique-relu',
  'cache-faible',
  'sous-agents-couteux',
  'outils-gourmands',
  'outils-en-echec',
  'compaction-lourde',
  'contexte-injecte',
  'socle-gaspille',
  // Ce qui fait patiner — des manières de travailler, pas des dépenses
  'exploration-sans-fin',
  'brief-morcele',
  'reorientations',
  'relectures',
  'fenetre-proche-limite',
  // Ce qui consomme la ressource — des rythmes, lisibles en direct
  'rythme-5h',
  'sessions-paralleles',
] as const;

export type RuleName = (typeof RULE_NAMES)[number];

export interface DetectOptions {
  /** Constats à taire, par `id`. Un faux positif se fait taire sans bouger un seuil. */
  ignore?: string[];
  /** Règles désactivées. */
  disabled?: RuleName[];
  /**
   * Le rythme du parc, quand on l'a calculé. Sans lui, les deux règles qui en
   * dépendent se taisent : elles ne portent aucun jugement par défaut.
   */
  pace?: Pace;
}

// ── Outillage commun ─────────────────────────────────────────────────────────

/**
 * Un identifiant qui survit au prochain scan.
 *
 * Il ne dépend que de la règle et de sa cible — jamais d'une mesure. Un constat
 * dont le chiffre bouge d'un scan à l'autre reste le même constat, sinon la liste
 * d'exclusion de l'utilisateur se viderait à chaque relecture du corpus.
 */
function makeId(rule: RuleName, scope: Scope, target: string): string {
  return createHash('sha1').update(`${rule}|${scope}|${target}`).digest('hex').slice(0, 12);
}

/**
 * La gravité, déduite du dépassement — la même échelle pour toutes les règles.
 *
 * Pour un signal « plus bas est pire », le rapport s'inverse : un taux de cache à
 * 35 % sous un seuil de 70 % dépasse d'autant qu'un coût double de son seuil.
 */
function severityOf(calibration: Calibration, value: number): Severity {
  const ratio =
    calibration.direction === 'high'
      ? value / (calibration.value || 1)
      : (calibration.value || 1) / (value || calibration.value || 1);
  if (ratio >= 2) return 'critical';
  if (ratio >= 1.3) return 'warn';
  return 'info';
}

function triggerOf(metric: MetricName, calibration: Calibration, value: number): Trigger {
  return {
    metric,
    value,
    threshold: calibration.value,
    calibrated: calibration.calibrated,
    bound: calibration.bound,
  };
}

/**
 * Un montant, ou rien du tout.
 *
 * Un `usd: 0` se lit « gratuit », alors qu'il signifie presque toujours « aucun
 * tarif connu pour ce modèle » — un modèle local, ou plus récent que la table de
 * `pricing.ts`. `usage.ts` tient déjà cette ligne avec `unpricedModels` : on ne
 * présente jamais un total qui omet silencieusement une dépense. Un montant nul
 * est donc absent, et l'impact retombe sur ses tokens, qui eux sont comptés.
 */
function money(n: number): number | undefined {
  return n > 0 ? n : undefined;
}

/** Le début d'un `sessionId`, seule forme lisible dans une phrase. */
const short = (id: string): string => `${id.slice(0, 8)}…`;

/**
 * Le contexte réellement attribué d'une session.
 *
 * Rappel de `shared/context.ts` : les catégories n'expliquent qu'un quart environ
 * de la fenêtre. Une part calculée sur ce total est donc une part *de ce qu'on
 * sait nommer*, jamais une part de la fenêtre — les messages le disent.
 */
function attributed(s: SessionSignal): number {
  return Object.values(s.byCategory).reduce((a, b) => a + b, 0);
}

// ── Les règles, une par constat ──────────────────────────────────────────────
//
// Chacune reçoit un relevé et la calibration de son signal, et rend un constat ou
// `null`. Le déclenchement est toujours délégué à `exceeds` : aucune règle ne
// compare elle-même à un nombre.

type SessionRule = (s: SessionSignal, t: Thresholds) => Finding | null;

/** Ce que coûte la seule relecture de l'historique déjà lu. */
const historiqueRelu: SessionRule = (s, th) => {
  const c = th.metrics.cacheReadCost;
  const value = valueOf('cacheReadCost', s);
  if (!exceeds(c, value) || value === null) return null;

  const share = s.cost > 0 ? value / s.cost : 0;
  return {
    id: makeId('historique-relu', 'session', s.sessionId),
    rule: 'historique-relu',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.historique-relu.title'),
    message: t('diagnostics.rules.historique-relu.message', {
      id: short(s.sessionId),
      cost: usd(value),
      share: pct(share),
      total: usd(s.cost),
      turns: s.turns,
      peak: tok(s.peakContext),
    }),
    metrics: {
      cacheReadCost: value,
      sessionCost: s.cost,
      share,
      turns: s.turns,
      peakContext: s.peakContext,
      compactions: s.compactions.length,
    },
    impact: {
      usd: value,
      kind: 'measured',
      basis: t('diagnostics.rules.historique-relu.basis'),
    },
    trigger: triggerOf('cacheReadCost', c, value),
  };
};

/** Une fenêtre reconstruite plutôt que relue : le cache ne prend pas. */
const cacheFaible: SessionRule = (s, th) => {
  const c = th.metrics.cacheHitRatio;
  const value = valueOf('cacheHitRatio', s);
  if (!exceeds(c, value) || value === null) return null;

  // Le prix de *construction* de la fenêtre : l'entrée jamais mise en cache, plus
  // le cache qu'il a fallu écrire. C'est ce que la session n'a pas amorti — et
  // c'est non nul par construction, puisque la règle ne tire qu'en dessous de
  // 70 % de relecture.
  const building = s.inputCost + s.cacheCreateCost;
  const buildingTokens = s.tokens.input + s.tokens.cacheCreate;

  return {
    id: makeId('cache-faible', 'session', s.sessionId),
    rule: 'cache-faible',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.cache-faible.title'),
    message:
      t('diagnostics.rules.cache-faible.message', {
        id: short(s.sessionId),
        ratio: pct(value),
        turns: s.turns,
        median: pct(c.quantiles.p50),
        tokens: tok(buildingTokens),
      }) +
      (s.unpricedModels.length
        ? t('diagnostics.rules.cache-faible.unpriced')
        : t('diagnostics.rules.cache-faible.priced', { cost: usd(building) })),
    metrics: {
      cacheHitRatio: value,
      parcMedian: c.quantiles.p50,
      buildingTokens,
      cacheCreateTokens: s.tokens.cacheCreate,
      inputTokens: s.tokens.input,
      buildingCost: building,
      turns: s.turns,
      models: s.models.length,
      unpricedModels: s.unpricedModels.length,
    },
    impact: {
      ...(money(building) !== undefined ? { usd: building } : {}),
      tokens: buildingTokens,
      kind: 'measured',
      // Ce que construire la fenêtre a coûté — pas ce qu'on récupérerait : le
      // premier passage se paie toujours, quoi qu'on fasse.
      basis: t('diagnostics.rules.cache-faible.basis'),
    },
    trigger: triggerOf('cacheHitRatio', c, value),
  };
};

/** Ce que les délégations ont coûté, lu dans leurs propres fichiers. */
const sousAgentsCouteux: SessionRule = (s, th) => {
  const c = th.metrics.subagentCost;
  const value = valueOf('subagentCost', s);
  if (!exceeds(c, value) || value === null) return null;

  const share = s.cost > 0 ? value / s.cost : 0;
  const types = [...new Set(s.subagents.map((a) => a.agentType).filter(Boolean))];
  return {
    id: makeId('sous-agents-couteux', 'session', s.sessionId),
    rule: 'sous-agents-couteux',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.sous-agents-couteux.title'),
    message: t('diagnostics.rules.sous-agents-couteux.message', {
      id: short(s.sessionId),
      count: s.subagents.length,
      types: types.length
        ? types.join(', ')
        : t('diagnostics.rules.sous-agents-couteux.unknownType'),
      cost: usd(value),
      share: pct(share),
      turns: s.subagentTurns,
    }),
    metrics: {
      subagentCost: value,
      sessionCost: s.cost,
      share,
      agents: s.subagents.length,
      subagentTurns: s.subagentTurns,
    },
    impact: {
      usd: value,
      kind: 'measured',
      basis: t('diagnostics.rules.sous-agents-couteux.basis'),
    },
    trigger: triggerOf('subagentCost', c, value),
  };
};

/** Les outils occupent la fenêtre — et c'est le premier poste du parc. */
const outilsGourmands: SessionRule = (s, th) => {
  const c = th.metrics.toolTokens;
  const value = valueOf('toolTokens', s);
  if (!exceeds(c, value) || value === null) return null;

  const top = s.tools[0];
  const known = attributed(s);
  return {
    id: makeId('outils-gourmands', 'session', s.sessionId),
    rule: 'outils-gourmands',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.outils-gourmands.title'),
    message:
      t('diagnostics.rules.outils-gourmands.message', {
        id: short(s.sessionId),
        tokens: tok(value),
        share: pct(known > 0 ? value / known : 0),
      }) +
      (top
        ? t('diagnostics.rules.outils-gourmands.top', {
            name: top.name,
            tokens: tok(top.tokens),
            calls: top.calls,
            inputShare: pct(top.tokens > 0 ? top.inputTokens / top.tokens : 0),
          })
        : ''),
    metrics: {
      toolTokens: value,
      attributedTokens: known,
      imageTokens: s.imageTokens,
      topToolTokens: top?.tokens ?? 0,
      topToolCalls: top?.calls ?? 0,
      topToolInputTokens: top?.inputTokens ?? 0,
    },
    impact: {
      // Pas de dollar : un token entré au tour 3 est relu à chaque tour suivant,
      // et le transcript ne dit pas à quel tour il est entré. Toute conversion
      // serait un coefficient inventé — précisément ce qu'on refuse.
      tokens: value,
      kind: 'estimated',
      basis: t('diagnostics.rules.outils-gourmands.basis'),
    },
    trigger: triggerOf('toolTokens', c, value),
  };
};

/** Des appels qui échouent : des tokens dépensés sans rien produire. */
const outilsEnEchec: SessionRule = (s, th) => {
  const c = th.metrics.toolErrorRate;
  const value = valueOf('toolErrorRate', s);
  if (!exceeds(c, value) || value === null) return null;

  const calls = s.tools.reduce((n, x) => n + x.calls, 0);
  const worst = [...s.tools].sort((a, b) => b.errors - a.errors)[0];
  // Le coût d'un appel raté n'est pas relevé : on prorate le poids de l'outil par
  // sa part d'échecs. Ordre de grandeur, et rien de plus.
  const wasted = s.tools.reduce(
    (n, x) => n + (x.calls > 0 ? (x.tokens * x.errors) / x.calls : 0),
    0,
  );

  return {
    id: makeId('outils-en-echec', 'session', s.sessionId),
    rule: 'outils-en-echec',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.outils-en-echec.title'),
    message:
      t('diagnostics.rules.outils-en-echec.message', {
        id: short(s.sessionId),
        errors: s.toolErrors,
        calls,
        rate: pct(value),
        median: pct(c.quantiles.p50),
      }) +
      (worst && worst.errors > 0
        ? t('diagnostics.rules.outils-en-echec.worst', {
            name: worst.name,
            errors: worst.errors,
          })
        : t('diagnostics.rules.outils-en-echec.noWorst')) +
      t('diagnostics.rules.outils-en-echec.wasted', { tokens: tok(wasted) }),
    metrics: {
      errorRate: value,
      parcMedian: c.quantiles.p50,
      errors: s.toolErrors,
      calls,
      wastedTokens: wasted,
    },
    impact: {
      tokens: wasted,
      kind: 'estimated',
      basis: t('diagnostics.rules.outils-en-echec.basis'),
    },
    trigger: triggerOf('toolErrorRate', c, value),
  };
};

/** Une compaction jette du contexte qu'il a fallu payer pour construire. */
const compactionLourde: SessionRule = (s, th) => {
  const c = th.metrics.compactionWaste;
  const value = valueOf('compactionWaste', s);
  if (!exceeds(c, value) || value === null) return null;

  const auto = s.compactions.filter((x) => x.trigger === 'auto').length;
  return {
    id: makeId('compaction-lourde', 'session', s.sessionId),
    rule: 'compaction-lourde',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.compaction-lourde.title'),
    message: t('diagnostics.rules.compaction-lourde.message', {
      id: short(s.sessionId),
      count: s.compactions.length,
      kind: auto
        ? t('diagnostics.rules.compaction-lourde.auto', { count: auto })
        : t('diagnostics.rules.compaction-lourde.manual'),
      tokens: tok(value),
      peak: tok(s.peakContext),
    }),
    metrics: {
      discardedTokens: value,
      compactions: s.compactions.length,
      autoCompactions: auto,
      peakContext: s.peakContext,
      turns: s.turns,
    },
    impact: {
      tokens: value,
      kind: 'measured',
      basis: t('diagnostics.rules.compaction-lourde.basis'),
    },
    trigger: triggerOf('compactionWaste', c, value),
  };
};

/** Des mémoires, catalogues et hooks qui entrent dans chaque fenêtre. */
const contexteInjecte: SessionRule = (s, th) => {
  const c = th.metrics.injectedContext;
  const value = valueOf('injectedContext', s);
  if (!exceeds(c, value) || value === null) return null;

  const top = s.topInjections.slice(0, 3);
  return {
    id: makeId('contexte-injecte', 'session', s.sessionId),
    rule: 'contexte-injecte',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.contexte-injecte.title'),
    message:
      t('diagnostics.rules.contexte-injecte.message', {
        id: short(s.sessionId),
        tokens: tok(value),
      }) +
      (top.length
        ? t('diagnostics.rules.contexte-injecte.top', {
            list: top.map((i) => `${i.label} (~${tok(i.tokens)})`).join(', '),
          })
        : t('diagnostics.rules.contexte-injecte.noTop')),
    metrics: {
      injectedTokens: value,
      memoryTokens: s.byCategory.memory,
      skillTokens: s.byCategory.skills,
      harnessTokens: s.byCategory.harness,
      turns: s.turns,
    },
    impact: {
      tokens: value,
      kind: 'estimated',
      basis: t('diagnostics.rules.contexte-injecte.basis'),
    },
    trigger: triggerOf('injectedContext', c, value),
  };
};

// ── Ce qui fait patiner ──────────────────────────────────────────────────────
//
// Les règles qui précèdent disent où l'argent est parti. Celles-ci décrivent des
// gestes. Deux précautions les gouvernent, et elles se lisent dans chaque phrase :
//
//  - **Décrire, jamais noter.** « Cette session a beaucoup exploré pour peu de
//    modifications » se vérifie sur le transcript ; « cette session était
//    improductive » est un jugement qu'aucune mesure ne soutient — une session
//    qui traque deux heures un bug subtil et le corrige en une ligne serait la
//    pire de toutes selon un décompte d'éditions par heure.
//  - **Pas de dollar inventé.** Une manière de travailler n'a pas de facture. Là
//    où rien n'est chiffrable, `impact` ne porte aucun nombre et le dit.

/** Chercher plus qu'on ne construit. */
const explorationSansFin: SessionRule = (s, th) => {
  const c = th.metrics.explorationRatio;
  const value = valueOf('explorationRatio', s);
  if (!exceeds(c, value) || value === null) return null;

  const f = s.families;
  return {
    id: makeId('exploration-sans-fin', 'session', s.sessionId),
    rule: 'exploration-sans-fin',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.exploration-sans-fin.title'),
    message: t('diagnostics.rules.exploration-sans-fin.message', {
      id: short(s.sessionId),
      explorations: f.explorationCalls,
      edits: f.productionCalls,
      ratio: ratio(value),
      median: ratio(c.quantiles.p50),
      tokens: tok(f.explorationTokens),
    }),
    metrics: {
      explorationRatio: value,
      parcMedian: c.quantiles.p50,
      explorationCalls: f.explorationCalls,
      productionCalls: f.productionCalls,
      explorationTokens: f.explorationTokens,
      productionTokens: f.productionTokens,
      turns: s.turns,
    },
    impact: {
      tokens: f.explorationTokens,
      kind: 'estimated',
      basis: t('diagnostics.rules.exploration-sans-fin.basis'),
    },
    trigger: triggerOf('explorationRatio', c, value),
  };
};

/**
 * La tâche donnée en morceaux.
 *
 * La règle dont l'énoncé compte le plus, parce que l'intuition qu'elle contredit
 * est répandue : elle ne dit pas « fais moins de tours », elle dit « donne la
 * tâche entière d'un coup et laisse-la courir ». Les sessions qui produisent le
 * plus font 23 tours par prompt ; celles qui produisent le moins, 11,7.
 */
const briefMorcele: SessionRule = (s, th) => {
  const c = th.metrics.turnsPerPrompt;
  const value = valueOf('turnsPerPrompt', s);
  if (!exceeds(c, value) || value === null) return null;

  return {
    id: makeId('brief-morcele', 'session', s.sessionId),
    rule: 'brief-morcele',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.brief-morcele.title'),
    message: t('diagnostics.rules.brief-morcele.message', {
      id: short(s.sessionId),
      prompts: s.userTurns,
      turns: s.turns,
      ratio: ratio(value),
      median: ratio(c.quantiles.p50),
    }),
    metrics: {
      turnsPerPrompt: value,
      parcMedian: c.quantiles.p50,
      userTurns: s.userTurns,
      turns: s.turns,
      interruptions: s.interruptions,
    },
    impact: {
      // Aucun chiffre : le morcellement d'un brief ne cause pas une dépense qu'on
      // saurait isoler. Ce qu'il coûte est du temps, et le transcript ne dit pas
      // combien on en aurait gagné autrement.
      kind: 'measured',
      basis: t('diagnostics.rules.brief-morcele.basis'),
    },
    trigger: triggerOf('turnsPerPrompt', c, value),
  };
};

/** Le travail partait ailleurs qu'attendu. */
const reorientations: SessionRule = (s, th) => {
  const c = th.metrics.interruptions;
  const value = valueOf('interruptions', s);
  if (!exceeds(c, value) || value === null) return null;

  return {
    id: makeId('reorientations', 'session', s.sessionId),
    rule: 'reorientations',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.reorientations.title'),
    message: t('diagnostics.rules.reorientations.message', {
      id: short(s.sessionId),
      count: s.interruptions,
      turns: s.turns,
    }),
    metrics: {
      interruptions: s.interruptions,
      turns: s.turns,
      userTurns: s.userTurns,
      parcMedian: c.quantiles.p50,
    },
    impact: {
      kind: 'measured',
      basis: t('diagnostics.rules.reorientations.basis'),
    },
    trigger: triggerOf('interruptions', c, value),
  };
};

/** Les mêmes fichiers relus plusieurs fois dans la même session. */
const relectures: SessionRule = (s, th) => {
  const c = th.metrics.rereadTokens;
  const value = valueOf('rereadTokens', s);
  if (!exceeds(c, value) || value === null) return null;

  const readTool = s.tools.find((x) => x.name === 'Read');
  const share = readTool && readTool.tokens > 0 ? value / readTool.tokens : 0;
  return {
    id: makeId('relectures', 'session', s.sessionId),
    rule: 'relectures',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.relectures.title'),
    message:
      t('diagnostics.rules.relectures.message', {
        id: short(s.sessionId),
        calls: s.rereadCalls,
        tokens: tok(value),
      }) +
      (share > 0
        ? t('diagnostics.rules.relectures.share', { share: pct(share) })
        : t('diagnostics.rules.relectures.noShare')),
    metrics: {
      rereadTokens: value,
      rereadCalls: s.rereadCalls,
      readTokens: readTool?.tokens ?? 0,
      readCalls: readTool?.calls ?? 0,
      share,
      compactions: s.compactions.length,
    },
    impact: {
      tokens: value,
      kind: 'estimated',
      basis: t('diagnostics.rules.relectures.basis'),
    },
    trigger: triggerOf('rereadTokens', c, value),
  };
};

/** La fenêtre approche de ce que le modèle peut tenir. */
const fenetreProcheLimite: SessionRule = (s, th) => {
  const c = th.metrics.contextFill;
  const value = valueOf('contextFill', s);
  if (!exceeds(c, value) || value === null) return null;

  const auto = s.compactions.filter((x) => x.trigger === 'auto').length;
  return {
    id: makeId('fenetre-proche-limite', 'session', s.sessionId),
    rule: 'fenetre-proche-limite',
    severity: severityOf(c, value),
    scope: 'session',
    target: s.sessionId,
    project: s.project,
    title: t('diagnostics.rules.fenetre-proche-limite.title'),
    message:
      t('diagnostics.rules.fenetre-proche-limite.message', {
        id: short(s.sessionId),
        peak: tok(s.peakContext),
        fill: pct(value),
        limit: tok(s.contextLimit),
      }) +
      (auto
        ? t('diagnostics.rules.fenetre-proche-limite.auto', { count: auto })
        : t('diagnostics.rules.fenetre-proche-limite.noAuto')),
    metrics: {
      contextFill: value,
      peakContext: s.peakContext,
      contextLimit: s.contextLimit,
      compactions: s.compactions.length,
      autoCompactions: auto,
      turns: s.turns,
    },
    impact: {
      tokens: s.peakContext,
      kind: 'measured',
      basis: t('diagnostics.rules.fenetre-proche-limite.basis'),
    },
    trigger: triggerOf('contextFill', c, value),
  };
};

// ── La règle de parc ─────────────────────────────────────────────────────────

/**
 * Le socle payé par des sessions qui n'ont presque rien fait.
 *
 * Seule règle qui ne regarde pas une session mais leur ensemble : une session de
 * deux tours ne pose aucun problème, quarante en posent un. Le coût est exact —
 * c'est celui, relevé, de ces sessions ; l'estimation ne porte que sur la part
 * qu'y tient le socle.
 */
function socleGaspille(signals: SessionSignal[], th: Thresholds): Finding | null {
  const c = th.metrics.shortSessionBaseline;
  const shortOnes = signals.filter((s) => exceeds(c, valueOf('shortSessionBaseline', s)));
  // Un cas isolé n'est pas un motif ; c'est l'accumulation qui en fait un.
  if (shortOnes.length < 5) return null;

  const baseline = shortOnes.reduce((n, s) => n + s.firstTurnContext, 0);
  const cost = shortOnes.reduce((n, s) => n + s.cost, 0);
  const turns = shortOnes.reduce((n, s) => n + s.turns, 0);

  return {
    id: makeId('socle-gaspille', 'global', ''),
    rule: 'socle-gaspille',
    severity: shortOnes.length >= 20 ? 'warn' : 'info',
    scope: 'global',
    target: '',
    project: '',
    title: t('diagnostics.rules.socle-gaspille.title'),
    message: t('diagnostics.rules.socle-gaspille.message', {
      sessions: shortOnes.length,
      threshold: tok(c.value),
      tokens: tok(baseline),
      turns,
      cost: usd(cost),
    }),
    metrics: {
      sessions: shortOnes.length,
      baselineTokens: baseline,
      cost,
      turns,
      threshold: c.value,
    },
    impact: {
      ...(money(cost) !== undefined ? { usd: cost } : {}),
      tokens: baseline,
      kind: 'measured',
      basis: t('diagnostics.rules.socle-gaspille.basis'),
    },
    trigger: triggerOf('shortSessionBaseline', c, c.value),
  };
}

// ── Les règles de rythme ─────────────────────────────────────────────────────
//
// Elles ne regardent ni une session ni leur ensemble, mais le temps : ce que les
// cinq dernières heures ont coûté, et combien de sessions ont couru de front. Ce
// sont des *états*, pas des totaux — d'où leur place naturelle sur le stream, que
// les règles de coût ne pouvaient pas occuper.

/** Où en est la fenêtre de 5 h. */
function rythme5h(pace: Pace): Finding | null {
  const w = pace.windows;
  const value = pace.current.cost;
  if (value <= w.threshold) return null;

  const ratio = value / (w.threshold || 1);
  return {
    id: makeId('rythme-5h', 'global', ''),
    rule: 'rythme-5h',
    severity: ratio >= 2 ? 'critical' : ratio >= 1.3 ? 'warn' : 'info',
    scope: 'global',
    target: '',
    project: '',
    title: t('diagnostics.rules.rythme-5h.title'),
    message: t('diagnostics.rules.rythme-5h.message', {
      cost: usd(value),
      sessions: pace.current.sessions,
      median: usd(w.quantiles.p50),
      p90: usd(w.quantiles.p90),
      peak: usd(w.peak.cost),
    }),
    metrics: {
      windowCost: value,
      threshold: w.threshold,
      rank: pace.current.rank,
      p50: w.quantiles.p50,
      p90: w.quantiles.p90,
      peak: w.peak.cost,
      sessions: pace.current.sessions,
    },
    impact: {
      usd: value,
      kind: 'measured',
      basis: t('diagnostics.rules.rythme-5h.basis'),
    },
    trigger: {
      metric: 'sessionCost',
      value,
      threshold: w.threshold,
      calibrated: w.calibrated,
      bound: w.calibrated ? 'percentile' : 'guard',
    },
  };
}

/** Plusieurs sessions menées en même temps : la ressource part d'autant plus vite. */
function sessionsParalleles(pace: Pace): Finding | null {
  const c = pace.concurrency;
  if (c.max < 2 || c.hoursAtLeast2 <= c.threshold) return null;

  const share = c.activeHours > 0 ? c.hoursAtLeast2 / c.activeHours : 0;
  return {
    id: makeId('sessions-paralleles', 'global', ''),
    rule: 'sessions-paralleles',
    severity: c.max >= 4 ? 'warn' : 'info',
    scope: 'global',
    target: '',
    project: '',
    title: t('diagnostics.rules.sessions-paralleles.title'),
    message: t('diagnostics.rules.sessions-paralleles.message', {
      hours: Math.round(c.hoursAtLeast2),
      share: pct(share),
      max: c.max,
    }),
    metrics: {
      maxConcurrent: c.max,
      hoursAtLeast2: c.hoursAtLeast2,
      activeHours: c.activeHours,
      share,
      threshold: c.threshold,
    },
    impact: {
      // Ni dollar ni token : le recouvrement ne crée aucune dépense en propre —
      // les mêmes tours auraient coûté pareil à la suite. Ce qu'il change est le
      // *rythme* auquel la fenêtre se remplit.
      kind: 'measured',
      basis: t('diagnostics.rules.sessions-paralleles.basis'),
    },
  };
}

// ── Composition ──────────────────────────────────────────────────────────────

const SESSION_RULES: Record<
  Exclude<RuleName, 'socle-gaspille' | 'rythme-5h' | 'sessions-paralleles'>,
  SessionRule
> = {
  'historique-relu': historiqueRelu,
  'cache-faible': cacheFaible,
  'sous-agents-couteux': sousAgentsCouteux,
  'outils-gourmands': outilsGourmands,
  'outils-en-echec': outilsEnEchec,
  'compaction-lourde': compactionLourde,
  'contexte-injecte': contexteInjecte,
  'exploration-sans-fin': explorationSansFin,
  'brief-morcele': briefMorcele,
  reorientations,
  relectures,
  'fenetre-proche-limite': fenetreProcheLimite,
};

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warn: 1, critical: 2 };

/** Le poids d'un constat, pour trier. Un dollar prime sur un token, faute de taux. */
function weight(f: Finding): number {
  if (f.impact.usd !== undefined) return f.impact.usd;
  // Les constats en tokens passent après ceux en dollars, mais restent ordonnés
  // entre eux. Aucun taux de change n'est inventé pour les mêler.
  return -1 / ((f.impact.tokens ?? 0) + 1);
}

/**
 * Tous les constats d'un parc, les plus graves puis les plus lourds d'abord.
 *
 * Rien n'est agrégé ici : huit sessions à la relecture d'historique coûteuse
 * donnent huit constats. Les rassembler en une recommandation est le travail de
 * l'étape suivante, qui a besoin de les voir tous.
 */
export function detect(
  signals: SessionSignal[],
  thresholds: Thresholds,
  options: DetectOptions = {},
): Finding[] {
  const disabled = new Set(options.disabled ?? []);
  const ignored = new Set(options.ignore ?? []);
  const findings: Finding[] = [];

  for (const signal of signals) {
    for (const [name, rule] of Object.entries(SESSION_RULES) as [RuleName, SessionRule][]) {
      if (disabled.has(name)) continue;
      const found = rule(signal, thresholds);
      if (found) findings.push(found);
    }
  }

  if (!disabled.has('socle-gaspille')) {
    const found = socleGaspille(signals, thresholds);
    if (found) findings.push(found);
  }

  if (options.pace) {
    if (!disabled.has('rythme-5h')) {
      const found = rythme5h(options.pace);
      if (found) findings.push(found);
    }
    if (!disabled.has('sessions-paralleles')) {
      const found = sessionsParalleles(options.pace);
      if (found) findings.push(found);
    }
  }

  return findings
    .filter((f) => !ignored.has(f.id))
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        weight(b) - weight(a) ||
        a.rule.localeCompare(b.rule),
    );
}
