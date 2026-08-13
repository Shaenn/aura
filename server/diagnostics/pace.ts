// Le rythme : la dépense vue par le temps, et non par la session.
//
// Tout le reste du diagnostic raisonne par session — c'est l'unité dans laquelle
// on travaille, et celle qu'on peut ouvrir. Deux questions y échappent
// entièrement :
//
//   « **Où en est ma fenêtre de 5 h ?** » La limite d'usage ne connaît pas les
//   sessions : elle compte ce qui a été dépensé dans les cinq dernières heures,
//   toutes sessions confondues, et une session à cheval sur deux fenêtres compte
//   dans les deux. Aucun relevé par session ne peut répondre.
//
//   « **Combien de sessions ai-je menées de front ?** » Là encore la réponse est
//   dans le recouvrement des bornes, pas dans les bornes elles-mêmes.
//
// D'où ce module, et son entrée à lui : la suite des `CostPoint` que `signals.ts`
// produit dans la même passe — une réponse API, sa date, son prix. Rien n'est
// relu ; c'est le même scan, regardé par l'autre bout.
//
// Deux précautions sur ce que ces chiffres disent :
//
//  - Les fenêtres sont mesurées **là où il y a eu une réponse**. Une médiane de
//    fenêtre décrit donc les moments où l'on travaille, pas les heures du
//    calendrier — celles-ci sont majoritairement vides et tireraient tout à zéro.
//  - Le temps « de front » est celui du recouvrement des bornes d'une session,
//    qui vont de sa première à sa dernière ligne. Une session laissée ouverte
//    sans qu'on y touche compte donc comme ouverte : c'est ce qu'elle était.

import { calibrateFrom, type MetricNumbers } from './thresholds.ts';
import { getSignals, type CostPoint, type SessionSignal } from './signals.ts';

// ── Ce qu'on publie ──────────────────────────────────────────────────────────

/** La fenêtre glissante de la limite d'usage : cinq heures. */
export const WINDOW_MS = 5 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

export interface PaceWindows {
  /** Fenêtres mesurées — une par réponse API. */
  samples: number;
  /** Ce que valent ces fenêtres, en dollars. */
  quantiles: { p50: number; p75: number; p90: number; max: number };
  /** La plus chère, et quand elle s'est achevée. */
  peak: { cost: number; at: string };
  /**
   * Au-delà de quoi la fenêtre courante mérite qu'on en parle :
   * `max(P90 de vos fenêtres, un garde-fou)`. Même règle que partout ailleurs —
   * voir `thresholds.ts`.
   */
  threshold: number;
  /** Faux quand le parc n'offre pas assez de fenêtres pour un percentile. */
  calibrated: boolean;
}

export interface PaceCurrent {
  /** Dépense des cinq dernières heures, tous projets confondus. */
  cost: number;
  /** Bornes ISO de cette fenêtre. */
  from: string;
  to: string;
  /** Sessions distinctes qui y ont dépensé. */
  sessions: number;
  /** Place de cette fenêtre parmi les autres, entre 0 et 1. */
  rank: number;
}

export interface PaceConcurrency {
  /** Le plus grand nombre de sessions ouvertes en même temps. */
  max: number;
  /** Heures passées avec au moins deux sessions ouvertes. */
  hoursAtLeast2: number;
  /** Heures par niveau : `hoursByLevel[0]` = une seule session ouverte. */
  hoursByLevel: number[];
  /** Total des heures pendant lesquelles au moins une session était ouverte. */
  activeHours: number;
  /**
   * À partir de combien d'heures « de front » on en parle. Garde-fou seul : le
   * parc ne fournit qu'une valeur de ce signal, dont aucun percentile ne sort.
   */
  threshold: number;
}

export interface Pace {
  windowHours: number;
  current: PaceCurrent;
  windows: PaceWindows;
  concurrency: PaceConcurrency;
}

/**
 * Le garde-fou de la fenêtre de 5 h.
 *
 * Comme tous les garde-fous de ce diagnostic, il ne peut que faire taire : le
 * seuil est `max(P90, celui-ci)`. Sur un parc actif, la médiane des fenêtres et
 * son P90 passent tous deux au-dessus : c'est donc le parc qui décide, et cette
 * constante ne sert que sur une machine dont l'usage est trop maigre pour se
 * calibrer.
 */
const WINDOW_GUARD = 30;

/** Idem pour le temps passé à mener plusieurs sessions de front. */
const CONCURRENCY_GUARD_HOURS = 10;

// Les mots du signal ne sont pas ici : `calibrateFrom` les lit au catalogue sous
// son nom, `paceWindow`. Ne reste que ce qui se calibre.
const WINDOW_METRIC: MetricNumbers = {
  unit: 'usd',
  direction: 'high',
  rank: 0.9,
  guard: WINDOW_GUARD,
};

// ── La somme mobile ──────────────────────────────────────────────────────────

/**
 * Ce que valait la fenêtre de 5 h à l'instant de chaque point.
 *
 * Deux index et une somme courante : le point qui entre s'ajoute, ceux qui
 * sortent par la gauche se retranchent. Linéaire, là où recalculer chaque
 * fenêtre serait quadratique — et les points se comptent en dizaines de milliers.
 *
 * `points` doit être trié par `t` croissant ; `getSignals` s'en charge.
 */
export function rollingWindows(points: CostPoint[], windowMs = WINDOW_MS): number[] {
  const out: number[] = [];
  let sum = 0;
  let left = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i]!.cost;
    // La fenêtre est ouverte à gauche et fermée à droite : un point vieux d'exactement
    // cinq heures n'y est plus, ce qui est aussi la lecture d'une limite glissante.
    while (points[left]!.t <= points[i]!.t - windowMs) {
      sum -= points[left]!.cost;
      left++;
    }
    out.push(sum);
  }
  return out;
}

/** La dépense d'une fenêtre qui s'achève à `at`, et les sessions qui y ont part. */
function windowAt(points: CostPoint[], at: number, windowMs = WINDOW_MS): PaceCurrent {
  const from = at - windowMs;
  let cost = 0;
  const sessions = new Set<string>();
  // À rebours : les points récents sont à la fin, et on s'arrête dès qu'on sort
  // de la fenêtre plutôt que de balayer tout le corpus.
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!;
    if (p.t <= from) break;
    if (p.t > at) continue;
    cost += p.cost;
    sessions.add(p.sessionId);
  }
  return {
    cost,
    from: new Date(from).toISOString(),
    to: new Date(at).toISOString(),
    sessions: sessions.size,
    rank: 0,
  };
}

// ── Le recouvrement des sessions ─────────────────────────────────────────────

/**
 * Combien de sessions étaient ouvertes en même temps, et combien de temps.
 *
 * Balayage classique : `+1` à chaque ouverture, `−1` à chaque fermeture, les
 * bornes triées. Entre deux événements le niveau est constant, et la durée
 * écoulée s'ajoute au compte de ce niveau.
 *
 * Une session sans bornes lisibles, ou dont la fin précède le début, est écartée
 * plutôt que corrigée : une durée négative fausserait tous les niveaux à la fois.
 */
export function concurrency(
  spans: { start: number; end: number }[],
  guardHours = CONCURRENCY_GUARD_HOURS,
): PaceConcurrency {
  const events: { t: number; delta: number }[] = [];
  for (const s of spans) {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end < s.start) continue;
    events.push({ t: s.start, delta: 1 });
    events.push({ t: s.end, delta: -1 });
  }
  // Les fermetures avant les ouvertures à date égale : deux sessions bord à bord
  // ne se recouvrent pas, et les compter ensemble inventerait du parallélisme.
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);

  const hoursByLevel: number[] = [];
  let level = 0;
  let max = 0;
  let previous = 0;

  for (const e of events) {
    if (level > 0 && e.t > previous) {
      const hours = (e.t - previous) / HOUR_MS;
      hoursByLevel[level - 1] = (hoursByLevel[level - 1] ?? 0) + hours;
    }
    level += e.delta;
    if (level > max) max = level;
    previous = e.t;
  }

  for (let i = 0; i < max; i++) hoursByLevel[i] ??= 0;
  const activeHours = hoursByLevel.reduce((a, b) => a + b, 0);
  const hoursAtLeast2 = hoursByLevel.slice(1).reduce((a, b) => a + b, 0);

  return { max, hoursAtLeast2, hoursByLevel, activeHours, threshold: guardHours };
}

// ── Composition ──────────────────────────────────────────────────────────────

/**
 * Le rythme d'un parc, à un instant donné.
 *
 * `now` est un paramètre et non `Date.now()` : c'est ce qui rend la fenêtre
 * courante vérifiable sur des points fabriqués.
 */
export function buildPace(signals: SessionSignal[], points: CostPoint[], now: number): Pace {
  const sums = rollingWindows(points);
  const calibration = calibrateFrom('paceWindow', WINDOW_METRIC, sums);

  let peakCost = 0;
  let peakAt = 0;
  for (let i = 0; i < sums.length; i++) {
    if (sums[i]! > peakCost) {
      peakCost = sums[i]!;
      peakAt = points[i]!.t;
    }
  }

  const current = windowAt(points, now);
  // Le rang de la fenêtre courante parmi les autres — « plus chargée que 80 % de
  // vos fenêtres » se lit, là où un montant nu ne dit rien.
  let below = 0;
  for (const v of sums) if (v < current.cost) below++;
  current.rank = sums.length ? below / sums.length : 0;

  return {
    windowHours: WINDOW_MS / HOUR_MS,
    current,
    windows: {
      samples: sums.length,
      quantiles: {
        p50: calibration.quantiles.p50,
        p75: calibration.quantiles.p75,
        p90: calibration.quantiles.p90,
        max: calibration.quantiles.max,
      },
      peak: { cost: peakCost, at: peakAt ? new Date(peakAt).toISOString() : '' },
      threshold: calibration.value,
      calibrated: calibration.calibrated,
    },
    concurrency: concurrency(
      signals.map((s) => ({ start: Date.parse(s.firstTs), end: Date.parse(s.lastTs) })),
    ),
  };
}

// ── Cache court ──────────────────────────────────────────────────────────────
//
// Le stream interroge cette surface en boucle, et `getSignals()` coûte quelques
// centaines de millisecondes même tout chaud — un `stat()` par transcript du
// dossier, et ils se comptent par centaines. Trente secondes de péremption
// suffisent à rendre l'appel gratuit sans qu'un utilisateur voie jamais un
// chiffre qui traîne : la fenêtre de 5 h ne bouge pas en une demi-minute.

const CACHE_MS = 30_000;

let cached: { at: number; pace: Pace } | null = null;

/** Vide le cache du rythme. Réservé aux tests. */
export function resetPaceCache(): void {
  cached = null;
}

export async function getPace(): Promise<Pace> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.pace;
  const { signals, points } = await getSignals();
  const pace = buildPace(signals, points, now);
  cached = { at: now, pace };
  return pace;
}
