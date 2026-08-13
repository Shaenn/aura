// Les invariants, éprouvés sur le vrai corpus de la machine.
//
// Les fixtures disent ce que le modèle *doit* faire ; elles ne disent rien de ce
// que les vraies sessions contiennent. C'est pourtant là qu'était la régression
// des sous-agents : une fenêtre de 9 000 tokens repliée dans une de 131 000, sur
// 159 sessions, et aucune fixture ne l'aurait vue puisqu'aucune ne l'a décrite.
//
// Ce fichier ne fige rien et n'assemble aucune donnée : il ouvre `~/.claude` s'il
// existe, en lit un échantillon, et vérifie des propriétés qui doivent tenir quel
// que soit le contenu. Sur une machine sans corpus, il se saute — c'est un filet,
// pas une porte.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { eachImage, parseTranscript } from '../server/transcript.ts';
import { CONTEXT_CATEGORIES, type SessionContext } from '../shared/context.ts';

const PROJECTS = join(homedir(), '.claude', 'projects');
const HAS_CORPUS = existsSync(PROJECTS);

/** Assez pour que les propriétés mordent, assez peu pour rester une seconde. */
const SAMPLE = 60;

interface Session {
  name: string;
  path: string;
  /** Ce transcript a-t-il des sous-agents ? Eux seuls exercent l'isolation. */
  hasSubagents: boolean;
}

function sample(): Session[] {
  const out: Session[] = [];
  for (const project of readdirSync(PROJECTS)) {
    const dir = join(PROJECTS, project);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.jsonl')) continue;
      const id = file.slice(0, -6);
      out.push({
        name: `${project}/${id.slice(0, 8)}`,
        path: join(dir, file),
        hasSubagents: existsSync(join(dir, id, 'subagents')),
      });
    }
  }
  // Les sessions à sous-agents d'abord : ce sont elles qui portent l'invariant
  // le plus fragile, et elles sont minoritaires.
  out.sort((a, b) => Number(b.hasSubagents) - Number(a.hasSubagents));
  return out.slice(0, SAMPLE);
}

const attributedAt = (c: SessionContext, i: number): number =>
  CONTEXT_CATEGORIES.reduce((sum, cat) => sum + c.turns[i]!.byCategory[cat], 0);

describe.skipIf(!HAS_CORPUS)('invariants sur ~/.claude', () => {
  const sessions = HAS_CORPUS ? sample() : [];

  it('trouve des sessions à examiner', () => {
    expect(sessions.length).toBeGreaterThan(0);
  });

  it("n'attribue jamais plus que la fenêtre exacte", async () => {
    for (const s of sessions) {
      const { context } = await parseTranscript(s.path, '');
      context.turns.forEach((turn, i) => {
        if (!turn.total) return;
        // Une estimation qui dépasse son ancre ne dit plus rien : `unattributed`
        // serait négatif, et le panneau dessinerait une barre à l'envers.
        expect(attributedAt(context, i), `${s.name} tour ${i}`).toBeLessThanOrEqual(turn.total);
      });
    }
  });

  it('déduit un socle plausible dès que le premier tour est ancré', async () => {
    for (const s of sessions) {
      const { context } = await parseTranscript(s.path, '');
      const first = context.turns[0];
      if (!first?.total) continue;
      // Le prompt système et les schémas d'outils de Claude Code. Mesuré sur 488
      // sessions : médiane 26 441, p10 17 863, p90 32 156. Ces bornes sont larges
      // exprès — elles attrapent un socle tombé à zéro ou parti à la dérive, pas
      // une évolution du prompt d'Anthropic.
      expect(context.baseline, `${s.name}`).toBeGreaterThan(5_000);
      expect(context.baseline, `${s.name}`).toBeLessThan(80_000);
    }
  });

  it('adresse chaque image assez précisément pour la relire', async () => {
    let seen = 0;
    for (const s of sessions) {
      const id = s.path.split(/[\\/]/).at(-1)!.slice(0, -6);
      const { events } = await parseTranscript(s.path, id);
      for (const ev of events) {
        for (const b of ev.blocks) {
          for (const img of b.images ?? b.result?.images ?? []) {
            seen++;
            // L'adresse est tout ce que le front reçoit : sans `uuid`, la ligne
            // est introuvable ; sans le rang, l'image l'est dans sa ligne.
            expect(img.uuid, s.name).toMatch(/^[A-Za-z0-9-]{1,64}$/);
            expect(img.index, s.name).toBeGreaterThanOrEqual(0);
            expect(img.mediaType, s.name).toMatch(/^image\//);
            expect(img.bytes, s.name).toBeGreaterThan(0);

            // Et elle doit désigner les octets, pas seulement exister : on relit
            // le fichier comme le fera le BFF, en repartant de l'adresse seule.
            const file = img.agentId
              ? join(dirname(s.path), id, 'subagents', `agent-${img.agentId}.jsonl`)
              : s.path;
            const row = readFileSync(file, 'utf8')
              .split('\n')
              .filter((l) => l.includes(`"uuid":"${img.uuid}"`))
              .map((l) => JSON.parse(l) as Record<string, unknown>)
              .find((r) => r.uuid === img.uuid);
            expect(row, `${s.name} ligne ${img.uuid}`).toBeDefined();

            let data = '';
            eachImage((row!.message as { content?: unknown }).content, (source, _tool, at) => {
              if (at === img.index && typeof source.data === 'string') data = source.data;
            });
            expect(data.length, `${s.name} image ${img.uuid}#${img.index}`).toBeGreaterThan(0);
          }
        }
      }
    }
    // Le corpus en contient (captures Playwright, `Read` de PNG) ; zéro voudrait
    // dire que l'extraction ne trouve plus rien, pas qu'il n'y a rien à trouver.
    expect(seen, 'aucune image dans l’échantillon').toBeGreaterThan(0);
  });

  /**
   * Le contrat sur lequel repose le découpage du flux en pistes.
   *
   * Il ne peut se vérifier que sur de vraies sessions : ce sont elles qui portent
   * les cas qu'aucune fixture ne décrit — un sidecar qui n'est pas un sous-agent,
   * un run interrompu, un `status` de notification qu'on n'a jamais vu. Si un
   * `agentId` du flux n'avait pas son run, ses tours n'apparaîtraient dans aucune
   * piste et rien à l'écran ne le dirait.
   */
  it('annonce un run pour chaque agent que le flux porte, et pas un de plus', async () => {
    const withSub = sessions.filter((s) => s.hasSubagents);
    expect(withSub.length, 'aucune session à sous-agents dans l’échantillon').toBeGreaterThan(0);

    let runs = 0;
    for (const s of withSub) {
      const id = s.path.split(/[\\/]/).at(-1)!.slice(0, -6);
      const { subagents, events } = await parseTranscript(s.path, id);
      runs += subagents.length;

      const inStream = new Set(events.flatMap((e) => (e.agentId ? [e.agentId] : [])));
      expect([...inStream].sort(), s.name).toEqual(subagents.map((r) => r.agentId).sort());

      const announced = subagents.reduce((n, r) => n + r.events, 0);
      expect(announced, s.name).toBe(events.filter((e) => e.agentId).length);

      for (const run of subagents) {
        expect(run.events, `${s.name} ${run.agentId}`).toBeGreaterThan(0);
        expect(run.lastActivityAt, `${s.name} ${run.agentId}`).toBeGreaterThanOrEqual(
          run.startedAt,
        );
        expect(['running', 'completed', 'failed', 'unknown'], s.name).toContain(run.status);
        // Une fin datée est une fin avérée, et réciproquement.
        const terminal = run.status === 'completed' || run.status === 'failed';
        expect(run.endedAt !== undefined, `${s.name} ${run.agentId}`).toBe(terminal);
      }
    }
    expect(runs, 'aucun run dans l’échantillon').toBeGreaterThan(0);
  });

  it('ne replie jamais la fenêtre d’un sous-agent dans celle de son parent', async () => {
    const withSub = sessions.filter((s) => s.hasSubagents);
    expect(withSub.length, 'aucune session à sous-agents dans l’échantillon').toBeGreaterThan(0);

    for (const s of withSub) {
      const { context } = await parseTranscript(s.path, s.path.split(/[\\/]/).at(-1)!.slice(0, -6));
      // Une fenêtre grandit, tour après tour, jusqu'à ce qu'une compaction la
      // vide — et une compaction ouvre une phase. Un effondrement *au sein* d'une
      // phase n'a donc qu'une explication : deux fenêtres se sont mélangées.
      const byPhase = new Map<number, number[]>();
      for (const t of context.turns) {
        if (!t.total) continue;
        (byPhase.get(t.phase) ?? byPhase.set(t.phase, []).get(t.phase)!).push(t.total);
      }
      for (const [phase, totals] of byPhase) {
        for (let i = 1; i < totals.length; i++) {
          expect(totals[i], `${s.name} phase ${phase} tour ${i}`).toBeGreaterThan(
            totals[i - 1]! * 0.7,
          );
        }
      }
    }
  });
});
