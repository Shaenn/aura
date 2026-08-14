// Le relevé par session, éprouvé sur le vrai corpus de la machine.
//
// L'invariant qui porte tout le reste est le premier : **les totaux de
// `getSignals` et ceux de `getUsage` doivent coïncider au token et au cent près**.
// Les deux plient les réponses API par `message.id` avec le même code partagé
// (`server/tokens.ts`), lisent les mêmes fichiers et chiffrent aux mêmes tarifs ;
// tout écart est donc un bug d'une des deux branches, pas une approximation. Sans
// ce test, un diagnostic pourrait accuser une session que la page Usage dit
// innocente, et rien ne le dirait.
//
// Sur une machine sans corpus, tout se saute — c'est un filet, pas une porte.

import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getSignals, scanFile, type SessionSignal } from '../server/diagnostics/signals.ts';
import { getUsage } from '../server/usage.ts';
import { costOf } from '../server/pricing.ts';
import { CONTEXT_CATEGORIES } from '../shared/context.ts';

const PROJECTS = join(homedir(), '.claude', 'projects');
const HAS_CORPUS = existsSync(PROJECTS);
const ACTIVITY = join(import.meta.dirname, 'fixtures', 'activity.jsonl');

/** Le corpus entier passe deux fois ; laisser le temps au premier scan. */
const TIMEOUT = 300_000;

/**
 * L'état du corpus à l'instant t : chaque transcript par sa taille et sa date.
 *
 * Le corpus n'est pas un jeu d'essai figé, c'est le `~/.claude` vivant de la
 * machine. Une session Claude Code qui écrit pendant qu'on le lit décale la
 * seconde lecture par rapport à la première, et l'invariant compare alors deux
 * instants au lieu de deux calculs. Mesuré : 671 transcripts, dont un modifié
 * en quatre secondes par la seule session en cours.
 *
 * Deux empreintes identiques prouvent que rien n'a bougé entre elles.
 */
async function empreinteCorpus(): Promise<string> {
  const lignes: string[] = [];
  for (const projet of await readdir(PROJECTS)) {
    let fichiers: string[];
    try {
      fichiers = await readdir(join(PROJECTS, projet));
    } catch {
      // Un projet supprimé entre l'énumération et la lecture est lui-même un
      // mouvement, mais il sera vu par la différence des deux empreintes.
      continue;
    }
    for (const nom of fichiers) {
      if (!nom.endsWith('.jsonl')) continue;
      const chemin = join(PROJECTS, projet, nom);
      try {
        const s = await stat(chemin);
        lignes.push(`${chemin}:${s.size}:${s.mtimeMs}`);
      } catch {
        continue;
      }
    }
  }
  return lignes.sort().join('\n');
}

// ── Les mesures d'activité, sur une fixture écrite à la main ─────────────────
//
// Ce que le corpus ne peut pas prouver : qu'un appel tombe dans la bonne
// famille, qu'un échec est compté une fois, qu'une seconde lecture du même
// fichier compte et pas la première, et surtout que les quatre genres de lignes
// qui portent `type: 'user'` ne sont pas confondus — l'écho d'un résultat
// d'outil, une injection du harness, une commande locale, et le tour de
// l'humain. C'est ce dernier tri qui décide du rapport tours/prompt, et il est
// invisible dans un total.

describe('activité d’une session', () => {
  it('range chaque appel dans sa famille, et compte chaque échec une fois', async () => {
    const scan = await scanFile({
      path: ACTIVITY,
      sessionId: 'fixture',
      project: 'p',
      agentId: null,
      agentType: null,
    });

    // Read ×2 et Grep ×1 explorent ; Edit et Write construisent ; `Bash` n'est
    // ni l'un ni l'autre et n'entre nulle part — il peut lancer des tests comme
    // lister un répertoire.
    expect(scan.families.explorationCalls).toBe(3);
    expect(scan.families.productionCalls).toBe(2);
    expect(scan.families.explorationErrors).toBe(0);
    // Le `Write` en erreur, une fois. Le `Bash` en erreur compte dans le total
    // des échecs, mais dans aucune famille.
    expect(scan.families.productionErrors).toBe(1);
    expect(scan.toolErrors).toBe(2);
  });

  it('ne compte une relecture qu’à partir de la seconde lecture', async () => {
    const scan = await scanFile({
      path: ACTIVITY,
      sessionId: 'fixture',
      project: 'p',
      agentId: null,
      agentType: null,
    });

    // `/w/a.ts` est lu deux fois : seule la seconde est une relecture, et elle
    // pèse ce que son résultat a remis dans la fenêtre.
    expect(scan.rereadCalls).toBe(1);
    expect(scan.rereadTokens).toBeGreaterThan(0);
    expect(scan.rereadTokens).toBeLessThan(scan.families.explorationTokens);
  });

  it('ne prend pour un prompt que ce qu’un humain a tapé', async () => {
    const scan = await scanFile({
      path: ACTIVITY,
      sessionId: 'fixture',
      project: 'p',
      agentId: null,
      agentType: null,
    });

    // Deux vrais prompts. Sont écartés : les deux lignes d'échos de résultats
    // (`isMeta`), la ligne de commande locale, l'injection du harness — et
    // l'interruption, qui n'est pas une consigne.
    expect(scan.userTurns).toBe(2);
    expect(scan.interruptions).toBe(1);
    expect(scan.turns).toBe(3);
  });

  it('produit un point de dépense par réponse, à sa date', async () => {
    const scan = await scanFile({
      path: ACTIVITY,
      sessionId: 'fixture',
      project: 'p',
      agentId: null,
      agentType: null,
    });

    expect(scan.points).toHaveLength(3);
    expect(scan.points[0]!.t).toBe(Date.parse('2026-01-01T10:01:00.000Z'));
    for (const p of scan.points) expect(p.cost).toBeGreaterThan(0);

    // La somme des points est celle des cellules : c'est la même dépense, vue
    // par l'autre bout. L'invariant qui autorise `pace.ts` à raisonner sur les
    // points sans jamais rouvrir un transcript.
    const fromPoints = scan.points.reduce((n, p) => n + p.cost, 0);
    const fromCells = scan.cells.reduce((n, c) => n + (costOf(c.model, c, c.day) ?? 0), 0);
    expect(fromPoints).toBeCloseTo(fromCells, 10);
  });
});

describe.skipIf(!HAS_CORPUS)('relevés par session', () => {
  let signals: SessionSignal[] = [];
  let usage!: Awaited<ReturnType<typeof getUsage>>;
  /** Le corpus a bougé pendant les deux lectures, et pendant la reprise aussi. */
  let corpusMouvant = false;

  /**
   * Les deux lectures dans le même souffle, et sous surveillance.
   *
   * Elles vivaient dans deux `it` distincts, séparés par le balayage complet du
   * corpus — plusieurs secondes pendant lesquelles une session pouvait écrire.
   * L'invariant échouait alors sur deux tokens : l'entrée non cachée d'une
   * seule réponse d'API, arrivée entre les deux. Les rapprocher ne suffit pas à
   * fermer la course, seulement à la réduire ; l'empreinte, elle, la détecte.
   */
  beforeAll(async () => {
    for (let essai = 1; essai <= 2; essai++) {
      const avant = await empreinteCorpus();
      const releve = await getSignals();
      const compte = await getUsage();
      const apres = await empreinteCorpus();
      signals = releve.signals;
      usage = compte;
      if (avant === apres) return;
      if (essai === 2) corpusMouvant = true;
    }
  }, TIMEOUT);

  it('produit un relevé par session', () => {
    expect(signals.length).toBeGreaterThan(0);
  });

  it('totalise exactement comme la page Usage', (ctx) => {
    // Sauter en le disant, jamais passer en silence : un test qui se tait
    // quand il n'a pas pu mesurer vaut moins que pas de test du tout.
    if (corpusMouvant) {
      ctx.skip(
        'le corpus a bougé pendant les deux lectures, reprise comprise : une session Claude Code écrivait.',
      );
      return;
    }
    const sum = (pick: (s: SessionSignal) => number): number =>
      signals.reduce((n, s) => n + pick(s), 0);

    expect(sum((s) => s.tokens.input)).toBe(usage.totals.input);
    expect(sum((s) => s.tokens.output)).toBe(usage.totals.output);
    expect(sum((s) => s.tokens.cacheRead)).toBe(usage.totals.cacheRead);
    expect(sum((s) => s.tokens.cacheCreate)).toBe(usage.totals.cacheCreate);
    expect(sum((s) => s.turns + s.subagentTurns)).toBe(usage.totals.turns);
    // Le coût est une somme de flottants : l'égalité stricte n'a pas de sens,
    // mais le cent près, si.
    expect(sum((s) => s.cost)).toBeCloseTo(usage.totals.cost, 2);
  });
  // Plus de délai à accorder : les deux lectures ont eu lieu dans le
  // `beforeAll`, ce test ne fait plus que sommer.

  it('ne déduit jamais un coût d’un modèle sans tarif', () => {
    for (const s of signals) {
      for (const m of s.models) {
        if (!m.priced) expect(m.cost).toBe(0);
      }
      // Un modèle sans tarif est nommé, jamais tu.
      expect(s.unpricedModels).toEqual(s.models.filter((m) => !m.priced).map((m) => m.model));
    }
  });

  it('garde le taux de cache dans [0, 1]', () => {
    for (const s of signals) {
      expect(s.cacheHitRatio).toBeGreaterThanOrEqual(0);
      expect(s.cacheHitRatio).toBeLessThanOrEqual(1);
    }
  });

  it('ne relève pas une fenêtre plus grande que ce qui a été observé', () => {
    for (const s of signals) {
      // La fenêtre d'un tour ne peut pas dépasser ce que la session a lu en tout.
      expect(s.peakContext).toBeLessThanOrEqual(
        s.tokens.input + s.tokens.cacheRead + s.tokens.cacheCreate,
      );
      expect(s.firstTurnContext).toBeLessThanOrEqual(s.peakContext);
    }
  });

  it('compte les sous-agents dans le total de leur session', () => {
    for (const s of signals) {
      const sub = s.subagents.reduce((n, a) => n + a.cost, 0);
      expect(sub).toBeLessThanOrEqual(s.cost + 1e-9);
      const turns = s.subagents.reduce((n, a) => n + a.turns, 0);
      expect(turns).toBe(s.subagentTurns);
    }
  });

  it('ne produit aucun compteur négatif', () => {
    for (const s of signals) {
      expect(s.cost).toBeGreaterThanOrEqual(0);
      expect(s.cacheReadCost).toBeGreaterThanOrEqual(0);
      expect(s.imageTokens).toBeGreaterThanOrEqual(0);
      for (const c of CONTEXT_CATEGORIES) expect(s.byCategory[c]).toBeGreaterThanOrEqual(0);
      for (const t of s.tools) {
        expect(t.tokens).toBe(t.inputTokens + t.outputTokens);
        expect(t.imageTokens).toBeLessThanOrEqual(t.outputTokens);
        expect(t.errors).toBeLessThanOrEqual(t.calls + t.errors);
      }
    }
  });

  it('trouve des sessions à sous-agents (sinon le sidecar n’est pas lu)', () => {
    // La régression qu'on ne verrait pas autrement : un `listFiles` qui rate le
    // répertoire `subagents/` rendrait ce champ vide partout, sans rien casser.
    expect(signals.some((s) => s.subagents.length > 0)).toBe(true);
  });

  it('attribue du coût aux outils (sinon le pass complet ne sert à rien)', () => {
    const withTools = signals.filter((s) => s.tools.length > 0);
    expect(withTools.length).toBeGreaterThan(0);
    expect(withTools.some((s) => s.byCategory.tools > 0)).toBe(true);
  });
});
