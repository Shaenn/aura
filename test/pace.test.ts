// Le rythme : la fenêtre de 5 h et les sessions de front.
//
// Deux moitiés, comme partout dans ce diagnostic. La somme mobile et le balayage
// des recouvrements se démontrent sur des points fabriqués — ce sont deux
// algorithmes, et leurs bords sont exactement là où ils se trompent : le point
// qui entre, le point qui sort, deux sessions bord à bord, une session incluse
// dans une autre. Le reste vérifie que, branché sur le vrai parc, l'ensemble
// reste cohérent avec les relevés dont il sort.

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildPace, concurrency, rollingWindows, WINDOW_MS } from '../server/diagnostics/pace.ts';
import { getSignals } from '../server/diagnostics/signals.ts';
import { detect } from '../server/diagnostics/rules.ts';
import { calibrate } from '../server/diagnostics/thresholds.ts';
import type { CostPoint } from '../server/diagnostics/signals.ts';

const HAS_CORPUS = existsSync(join(homedir(), '.claude', 'projects'));
const TIMEOUT = 300_000;

const HOUR = 3_600_000;
const T0 = Date.parse('2026-01-01T00:00:00.000Z');

/** Des points à `hours` heures de T0, chacun à 1 $. */
const points = (...hours: number[]): CostPoint[] =>
  hours.map((h, i) => ({ t: T0 + h * HOUR, cost: 1, sessionId: `s${i}` }));

describe('fenêtre glissante', () => {
  it('additionne ce qui est dans la fenêtre, et rien d’autre', () => {
    // Un point par heure sur douze heures : au bout de cinq heures la fenêtre est
    // pleine (5 points, celui d'il y a exactement 5 h étant sorti) et le reste.
    const sums = rollingWindows(points(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11));
    expect(sums.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(sums.slice(5)).toEqual([5, 5, 5, 5, 5, 5, 5]);
  });

  it('exclut le point vieux d’exactement cinq heures', () => {
    // Le bord qui décide de tout : la fenêtre est ouverte à gauche. Un point à
    // t=0 et un à t=5 h ne sont jamais comptés ensemble.
    expect(rollingWindows(points(0, 5))).toEqual([1, 1]);
    // Une seconde de moins, et ils le sont.
    const serre: CostPoint[] = [
      { t: T0, cost: 1, sessionId: 'a' },
      { t: T0 + WINDOW_MS - 1000, cost: 1, sessionId: 'b' },
    ];
    expect(rollingWindows(serre)).toEqual([1, 2]);
  });

  it('survit à l’absence de point', () => {
    expect(rollingWindows([])).toEqual([]);
  });

  it('situe la fenêtre courante parmi les autres', () => {
    // Douze heures de dépense régulière, puis on regarde à la fin.
    const pts = points(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
    const pace = buildPace([], pts, T0 + 11 * HOUR);
    // Les cinq dernières heures : les points à 7, 8, 9, 10 et 11 h — celui de
    // 6 h est sorti par le bord gauche.
    expect(pace.current.cost).toBe(5);
    expect(pace.current.sessions).toBe(5);
    expect(pace.windows.peak.cost).toBe(5);
  });

  it('ne compte rien quand la dernière dépense est ancienne', () => {
    const pace = buildPace([], points(0, 1, 2), T0 + 48 * HOUR);
    expect(pace.current.cost).toBe(0);
    expect(pace.current.sessions).toBe(0);
    // Les fenêtres passées, elles, restent mesurées : c'est l'état qui est nul,
    // pas l'historique.
    expect(pace.windows.samples).toBe(3);
  });
});

describe('sessions de front', () => {
  const span = (start: number, end: number): { start: number; end: number } => ({
    start: T0 + start * HOUR,
    end: T0 + end * HOUR,
  });

  it('compte le recouvrement, pas les durées', () => {
    // [0,4] et [2,6] : deux heures à deux, quatre heures à une.
    const c = concurrency([span(0, 4), span(2, 6)]);
    expect(c.max).toBe(2);
    expect(c.hoursAtLeast2).toBe(2);
    expect(c.hoursByLevel[0]).toBe(4);
    expect(c.activeHours).toBe(6);
  });

  it('ne voit aucun parallélisme entre deux sessions bord à bord', () => {
    const c = concurrency([span(0, 2), span(2, 4)]);
    expect(c.max).toBe(1);
    expect(c.hoursAtLeast2).toBe(0);
  });

  it('gère une session entièrement incluse dans une autre', () => {
    const c = concurrency([span(0, 10), span(3, 5)]);
    expect(c.max).toBe(2);
    expect(c.hoursAtLeast2).toBe(2);
    expect(c.hoursByLevel[0]).toBe(8);
  });

  it('empile trois sessions imbriquées', () => {
    const c = concurrency([span(0, 9), span(1, 8), span(2, 3)]);
    expect(c.max).toBe(3);
    expect(c.hoursByLevel[2]).toBe(1);
    expect(c.hoursAtLeast2).toBe(7);
  });

  it('écarte une borne illisible plutôt que de la corriger', () => {
    // Une durée négative fausserait tous les niveaux à la fois.
    const c = concurrency([
      { start: Number.NaN, end: T0 },
      { start: T0 + 5 * HOUR, end: T0 },
      span(0, 2),
    ]);
    expect(c.max).toBe(1);
    expect(c.activeHours).toBe(2);
  });
});

describe.skipIf(!HAS_CORPUS)('rythme sur le vrai parc', () => {
  it(
    'chiffre les fenêtres comme les relevés chiffrent les sessions',
    async () => {
      const { signals, points: pts } = await getSignals();
      expect(pts.length).toBeGreaterThan(0);

      // Les points sont l'autre face des mêmes réponses : leur somme est celle
      // du parc. Toute divergence serait un pliage par `message.id` fait deux
      // fois de deux façons.
      const total = pts.reduce((n, p) => n + p.cost, 0);
      const fromSessions = signals.reduce((n, s) => n + s.cost, 0);
      expect(total).toBeCloseTo(fromSessions, 2);

      // Et ils sont triés : toute somme mobile en dépend.
      for (let i = 1; i < pts.length; i++) expect(pts[i]!.t).toBeGreaterThanOrEqual(pts[i - 1]!.t);
    },
    TIMEOUT,
  );

  it(
    'ne fabrique ni fenêtre plus chère que le parc ni parallélisme impossible',
    async () => {
      const { signals, points: pts } = await getSignals();
      const pace = buildPace(signals, pts, Date.now());
      const total = pts.reduce((n, p) => n + p.cost, 0);

      expect(pace.windows.peak.cost).toBeLessThanOrEqual(total + 1e-9);
      expect(pace.windows.quantiles.p50).toBeLessThanOrEqual(pace.windows.quantiles.p90);
      expect(pace.windows.quantiles.p90).toBeLessThanOrEqual(pace.windows.peak.cost + 1e-9);
      expect(pace.concurrency.max).toBeGreaterThanOrEqual(1);
      expect(pace.concurrency.max).toBeLessThanOrEqual(signals.length);
      expect(pace.concurrency.hoursAtLeast2).toBeLessThanOrEqual(pace.concurrency.activeHours);
    },
    TIMEOUT,
  );

  it(
    'porte au plus un constat par règle de rythme',
    async () => {
      const { signals, points: pts } = await getSignals();
      const pace = buildPace(signals, pts, Date.now());
      const findings = detect(signals, calibrate(signals), { pace });

      for (const rule of ['rythme-5h', 'sessions-paralleles']) {
        expect(findings.filter((f) => f.rule === rule).length).toBeLessThanOrEqual(1);
      }
      for (const f of findings.filter((f) => f.scope === 'global')) {
        expect(f.target).toBe('');
        expect(f.impact.basis.length).toBeGreaterThan(20);
      }
    },
    TIMEOUT,
  );
});
