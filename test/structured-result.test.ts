// Le résultat *structuré* d'un outil (`toolUseResult`), et la liste blanche qui
// le retient.
//
// L'enjeu n'est pas de vérifier qu'un champ se recopie : c'est que la liste
// blanche tienne. Le sidecar pèse jusqu'à 106 Ko sur un `Read` et le transcript
// parsé passe par le cache du BFF — ouvrir la vanne pour tous les outils
// coûterait des dizaines de mégaoctets pour n'afficher, presque partout, rien
// que le texte ne dise déjà.

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { parseTranscript, type Block } from '../server/transcript.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'artifact.jsonl');
const ASK = join(import.meta.dirname, 'fixtures', 'ask.jsonl');

/** La lecture que faisait le rejeu avant le sidecar : les couples du texte. */
function answersFromText(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of text.matchAll(/"([^"]*)"\s*=\s*"([^"]*)"/g)) {
    if (m[1] !== undefined) map.set(m[1], m[2] ?? '');
  }
  return map;
}

/** Tous les blocs `tool_use` d'un transcript parsé, à plat. */
async function blocksOf(path: string, id = ''): Promise<Block[]> {
  const { events } = await parseTranscript(path, id);
  return events.flatMap((e) => e.blocks).filter((b) => b.kind === 'tool_use');
}

describe('résultat structuré', () => {
  it('retient l’URL publiée d’un Artifact', async () => {
    const artifact = (await blocksOf(FIXTURE)).find((b) => b.name === 'Artifact');
    expect(artifact?.result?.meta).toEqual({
      url: 'https://claude.ai/code/artifact/3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
      path: '/w/recap.html',
      title: 'Diagnostic — recapitulatif',
      updated: false,
      version: '1700000000-0001',
      liveSubscription: 'flag_off',
    });
  });

  it('laisse tomber les objets imbriqués', async () => {
    // `nested` est dans la ligne mais hors liste : rien ne le rend, et c'est par
    // les objets qu'un sidecar explose en volume.
    const artifact = (await blocksOf(FIXTURE)).find((b) => b.name === 'Artifact');
    expect(artifact?.result?.meta).not.toHaveProperty('nested');
  });

  it('ne retient rien pour un outil hors liste', async () => {
    // Le `Read` de la fixture porte pourtant un `toolUseResult` complet.
    const read = (await blocksOf(FIXTURE)).find((b) => b.name === 'Read');
    expect(read?.result?.content).toBeTruthy();
    expect(read?.result?.meta).toBeUndefined();
  });
});

describe('réponses d’un AskUserQuestion', () => {
  it('retient la carte question → réponse, sans l’écho des questions', async () => {
    const ask = (await blocksOf(ASK)).find((b) => b.name === 'AskUserQuestion');
    expect(ask?.result?.meta?.answers).toEqual({
      'Le mock supporte une logique OU (champ `Logic: "OU"`). Comment le traduire ?':
        'Expression manuelle',
    });
    // `questions` est dans le sidecar mais hors liste : c'est l'écho de l'entrée,
    // que le bloc porte déjà.
    expect(ask?.result?.meta).not.toHaveProperty('questions');
  });

  it('rattrape une réponse que le texte seul faisait perdre', async () => {
    // Le cas réel : une question qui cite un champ entre guillemets. Le texte
    // énumère des couples `"…"="…"` et devient ambigu ; la carte, non.
    const ask = (await blocksOf(ASK)).find((b) => b.name === 'AskUserQuestion');
    const question = 'Le mock supporte une logique OU (champ `Logic: "OU"`). Comment le traduire ?';

    const fromText = answersFromText(ask?.result?.content ?? '');
    expect(fromText.get(question), 'le texte seul devrait échouer ici').toBeUndefined();

    const meta = ask?.result?.meta?.answers as Record<string, string>;
    expect(meta[question]).toBe('Expression manuelle');
  });
});

// ── Sur le vrai corpus ───────────────────────────────────────────────────────

const PROJECTS = join(homedir(), '.claude', 'projects');
const HAS_CORPUS = existsSync(PROJECTS);

/** Un échantillon de transcripts réels, sans rien assembler. */
function sample(limit = 40): string[] {
  const out: string[] = [];
  for (const project of readdirSync(PROJECTS)) {
    const dir = join(PROJECTS, project);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.jsonl')) out.push(join(dir, file));
      if (out.length >= limit) return out;
    }
  }
  return out;
}

describe.skipIf(!HAS_CORPUS)('résultat structuré sur le vrai corpus', () => {
  it('ne garde de sidecar que pour les outils de la liste, et jamais un gros', async () => {
    let kept = 0;
    for (const path of sample()) {
      for (const b of await blocksOf(path)) {
        const meta = b.result?.meta;
        if (!meta) continue;
        kept++;
        // La liste blanche est la garantie de volume : un `Read` ou un `Write`
        // qui commencerait à porter son sidecar ferait grossir chaque
        // transcript parsé de plusieurs dizaines de kilo-octets.
        expect(
          [
            'Artifact',
            'AskUserQuestion',
            'ExitPlanMode',
            'Skill',
            'TaskCreate',
            'ToolSearch',
            'WebFetch',
          ],
          `${path} — ${b.name}`,
        ).toContain(b.name);
        expect(JSON.stringify(meta).length, `${path} — sidecar trop gros`).toBeLessThan(8_192);
      }
    }
    // Zéro est une réponse valide : l'échantillon peut ne contenir aucun
    // Artifact. On vérifie la borne, pas la présence.
    expect(kept).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
