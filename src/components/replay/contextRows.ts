// D'une injection à une ligne affichable.
//
// Le panneau montre les mêmes injections de trois façons — groupées par
// catégorie, classées par taille, ou mises à plat. Les trois partagent une ligne,
// donc une seule forme, construite ici. Rien de ce fichier ne touche au DOM.

import { t } from '@/i18n';
import { turnDeltas } from '@/../shared/context';
import type { ContextCategory, ContextInjection, SessionContext } from '@/services/projects';

/** Une sous-ligne révélée par le pli : un outil, ou une moitié d'une réponse. */
export interface ContextDetailLine {
  label: string;
  tokens: number;
  isError?: boolean;
}

export interface ContextRowModel {
  category: ContextCategory;
  label: string;
  tokens: number;
  turnIndex: number;
  /** Chemin absolu, quand l'injection en vient — sert au titre et à la copie. */
  path?: string | undefined;
  /**
   * UUID de la réponse à laquelle se rendre. Absent quand le tour n'a pas été
   * ancré : mieux vaut pas de lien qu'un lien qui ne mène nulle part.
   */
  uuid?: string | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  detail: ContextDetailLine[];
}

/** L'identifiant de la réponse d'un tour, ou `undefined` s'il n'en a pas. */
function uuidOfTurn(context: SessionContext, turnIndex: number): string | undefined {
  return context.turns[turnIndex]?.uuid;
}

/**
 * Ce qu'un pli révèle.
 *
 * Pour les outils : lesquels, du plus lourd au plus léger. « 12 appels d'outil au
 * tour 7 » ne nomme rien — le lecteur ne distingue pas un `Read` de 5 k de douze
 * `Bash` à trois sous. Pour une réponse : le raisonnement d'un côté, la réponse de
 * l'autre, car seul le premier se raccourcit en demandant moins de réflexion.
 */
function detailOf(injection: ContextInjection): ContextDetailLine[] {
  if (injection.tools?.length) {
    return injection.tools.map((t) => ({
      label: t.count > 1 ? `${t.name} ×${t.count}` : t.name,
      tokens: t.tokens,
      ...(t.isError ? { isError: true } : {}),
    }));
  }
  if (injection.thinkingTokens !== undefined || injection.textTokens !== undefined) {
    return [
      { label: t('replay.context.rows.thinking'), tokens: injection.thinkingTokens ?? 0 },
      { label: t('replay.context.rows.answer'), tokens: injection.textTokens ?? 0 },
    ].filter((d) => d.tokens > 0);
  }
  // Un catalogue : ses lignes nommées, la plus coûteuse d'abord. Répond au « 18
  // skills, mais lesquels ? » sans quitter le panneau.
  if (injection.entries?.length) {
    return [...injection.entries]
      .sort((a, b) => b.tokens - a.tokens)
      .map((e) => ({ label: e.label, tokens: e.tokens }));
  }
  return [];
}

export function toRow(context: SessionContext, injection: ContextInjection): ContextRowModel {
  return {
    category: injection.category,
    label: injection.label,
    tokens: injection.tokens,
    turnIndex: injection.turnIndex,
    path: injection.path,
    uuid: uuidOfTurn(context, injection.turnIndex),
    inputTokens: injection.inputTokens,
    outputTokens: injection.outputTokens,
    detail: detailOf(injection),
  };
}

/** Ce qu'un tour a fait entrer *en silence* — ce que le corps de la carte ne montre pas. */
export interface CardTurn {
  turnIndex: number;
  /** Croissance exacte de la fenêtre à ce tour. */
  delta: number;
  /** Les injections invisibles de ce tour : fichiers, règles, réhydratation. */
  rows: ContextRowModel[];
}

/** Ce qu'une carte du fil a ajouté au contexte — une carte couvre plusieurs tours. */
export interface CardContext {
  /** Bornes 0-based des tours de la carte, pour l'affichage « Tours N–M ». */
  turnStart: number;
  turnEnd: number;
  /** Taille exacte de la fenêtre au dernier tour de la carte. */
  window: number;
  /** Croissance exacte de la fenêtre sur toute la carte. */
  delta: number;
  /**
   * Le détail par tour, indexé par l'UUID de la première ligne de la réponse.
   *
   * C'est cette clé qui permet à une carte de soixante-dix réponses de poser un
   * jalon au bon endroit — et de lui rattacher ce qui, à ce tour précis, est
   * entré sans qu'on le voie dans la conversation.
   */
  byUuid: Record<string, CardTurn>;
}

/**
 * Les catégories qu'on ne voit pas dans le corps d'une carte.
 *
 * Un outil, un raisonnement, un message : ils sont rendus là, sous les yeux. Une
 * mémoire, une règle, un fichier réinjecté après compaction : rien ne les montre.
 * Le détail d'un tour ne répète donc pas le visible — il révèle l'invisible.
 */
const SILENT = new Set<ContextCategory>(['memory', 'skills', 'files', 'harness']);

/**
 * Le contexte d'une carte du fil, tour par tour.
 *
 * Le fil groupe une réponse humaine et tout ce qui suit en une carte ; une carte
 * couvre donc plusieurs tours du contexte (neuf en moyenne sur une vraie session).
 * C'est ce qui déroute : « le tour 148 fait entrer ce fichier » alors que rien
 * dans la conversation ne le montre — le fichier vient d'une injection du harness
 * (une réhydratation post-compaction). Le jalon du tour l'expose enfin.
 *
 * Une carte ne franchit jamais une compaction (celle-ci ouvre sa propre place
 * dans le fil), donc tous ses tours sont d'une même phase.
 */
export function cardContext(context: SessionContext, turnIndices: number[]): CardContext | null {
  if (!turnIndices.length) return null;
  const set = new Set(turnIndices);
  const turns = context.turns.filter((t) => set.has(t.turnIndex));
  if (!turns.length) return null;

  const phase = turns[0]!.phase;
  const deltaByTurn = new Map<number, number>();
  let delta = 0;
  for (const d of turnDeltas(context, phase)) {
    if (!set.has(d.turnIndex)) continue;
    deltaByTurn.set(d.turnIndex, d.delta);
    delta += d.delta;
  }

  const silentByTurn = new Map<number, ContextRowModel[]>();
  for (const inj of context.injections) {
    if (!set.has(inj.turnIndex) || !SILENT.has(inj.category)) continue;
    const list = silentByTurn.get(inj.turnIndex) ?? [];
    list.push({ ...toRow(context, inj), uuid: undefined }); // on est déjà sur la carte
    silentByTurn.set(inj.turnIndex, list);
  }

  const byUuid: Record<string, CardTurn> = {};
  for (const t of turns) {
    byUuid[t.uuid] = {
      turnIndex: t.turnIndex,
      delta: deltaByTurn.get(t.turnIndex) ?? 0,
      rows: (silentByTurn.get(t.turnIndex) ?? []).sort((a, b) => b.tokens - a.tokens),
    };
  }

  return {
    turnStart: turns[0]!.turnIndex,
    turnEnd: turns[turns.length - 1]!.turnIndex,
    window: turns[turns.length - 1]!.total,
    delta,
    byUuid,
  };
}

/** Ce qu'un tour a ajouté au contexte, l'exact et l'estimé côte à côte. */
export interface TurnGroup {
  turnIndex: number;
  /** La réponse à laquelle se rendre. */
  uuid?: string | undefined;
  /** Taille exacte de la fenêtre à ce tour. */
  total: number;
  /** Croissance exacte depuis le tour précédent (ou le socle, au premier). Exacte. */
  delta: number;
  /** Ce qu'on sait rattacher à ce tour, sans lien de tour (l'en-tête l'a déjà). */
  rows: ContextRowModel[];
}

/**
 * Ce que chaque tour ajoute à la fenêtre, dans l'ordre chronologique.
 *
 * Deux mesures, jamais confondues. La *croissance exacte* (`turnDeltas`, dans
 * `shared`) est la différence entre la fenêtre de ce tour et celle du précédent —
 * un chiffre que le harness a relevé. L'*estimé* est la somme de ce qu'on sait
 * itemiser comme entré à ce tour ; il en explique une part, rarement tout, le
 * reste tenant à ce que `chars/4` sous-compte et aux sorties d'outils écrites
 * hors du transcript.
 *
 * L'ordre est celui des tours, pas de leur poids : une conversation se lit dans
 * le temps. La sélection des tours à montrer, quand il y en a trop, se fait
 * ailleurs.
 */
export function toTurnGroups(
  context: SessionContext,
  phase: number,
  injections: ContextInjection[],
): TurnGroup[] {
  const byTurn = new Map<number, ContextInjection[]>();
  for (const inj of injections) {
    const list = byTurn.get(inj.turnIndex) ?? [];
    list.push(inj);
    byTurn.set(inj.turnIndex, list);
  }

  return turnDeltas(context, phase)
    .map((d): TurnGroup => {
      const injs = byTurn.get(d.turnIndex) ?? [];
      return {
        turnIndex: d.turnIndex,
        uuid: d.uuid,
        total: d.total,
        delta: d.delta,
        // Pas de lien par ligne : c'est l'en-tête du tour qui navigue.
        rows: injs
          .sort((a, b) => b.tokens - a.tokens)
          .map((i) => ({ ...toRow(context, i), uuid: undefined })),
      };
    })
    .filter((g) => g.delta > 0 || g.rows.length > 0);
}

/**
 * La vue à plat : chaque appel d'outil, chaque moitié de réponse, sur sa propre
 * ligne, la plus lourde en tête.
 *
 * C'est ce qui fait ressortir l'unique `Read` de 40 k noyé parmi cent appels
 * bon marché — une ligne agrégée le cache derrière un total qui semble normal.
 * Les lignes à plat ne se déplient plus : il n'y a plus rien dessous.
 */
export function toFlatRows(
  context: SessionContext,
  injections: ContextInjection[],
): ContextRowModel[] {
  const out: ContextRowModel[] = [];
  for (const injection of injections) {
    const uuid = uuidOfTurn(context, injection.turnIndex);
    const base = {
      category: injection.category,
      turnIndex: injection.turnIndex,
      uuid,
      detail: [] as ContextDetailLine[],
    };

    if (injection.tools?.length) {
      for (const t of injection.tools) {
        out.push({
          ...base,
          label: t.count > 1 ? `${t.name} ×${t.count}` : t.name,
          tokens: t.tokens,
        });
      }
    } else if (injection.thinkingTokens || injection.textTokens) {
      if (injection.thinkingTokens) {
        out.push({
          ...base,
          label: t('replay.context.rows.thinking'),
          tokens: injection.thinkingTokens,
        });
      }
      if (injection.textTokens) {
        out.push({ ...base, label: t('replay.context.rows.answer'), tokens: injection.textTokens });
      }
    } else {
      out.push({ ...base, label: injection.label, path: injection.path, tokens: injection.tokens });
    }
  }
  return out.sort((a, b) => b.tokens - a.tokens);
}
