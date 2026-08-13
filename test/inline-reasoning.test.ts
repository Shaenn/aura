// Le raisonnement qu'un modèle auto-hébergé écrit dans son texte.
//
// Claude Code n'écrit le raisonnement de Claude nulle part : le bloc `thinking`
// arrive sur le disque avec sa seule signature. Un backend placé derrière
// ANTHROPIC_BASE_URL n'a pas ce bloc du tout — il ouvre sa réponse par un
// <think>. Sur le parc mesuré, 1208 réponses sur 1208 suivaient cette forme, et
// 84 % des caractères produits y tenaient : sans extraction, le fil affiche les
// balises en clair et le raisonnement au même rang que la réponse.

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseTranscript, type Block } from '../server/transcript.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'inline-think.jsonl');

/** Les blocs d'un tour, désigné par l'uuid de sa ligne. */
async function blocksOf(uuid: string): Promise<Block[]> {
  const { events } = await parseTranscript(FIXTURE, '');
  return events.find((e) => e.uuid === uuid)?.blocks ?? [];
}

describe('raisonnement en ligne', () => {
  it('sépare le <think> de la réponse qui le suit', async () => {
    const blocks = await blocksOf('s1');
    expect(blocks.map((b) => b.kind)).toEqual(['thinking', 'text']);
    expect(blocks[0]?.text).toBe('The user asks about the tag. Let me answer plainly.');
    expect(blocks[1]?.text).toBe('La balise encadre le raisonnement.');
  });

  it('n’invente pas de réponse quand le tour n’en porte pas', async () => {
    const blocks = await blocksOf('s2');
    expect(blocks.map((b) => b.kind)).toEqual(['thinking', 'tool_use']);
    expect(blocks[0]?.text).toBe('No answer this turn, straight to the tool.');
  });

  it('laisse le texte intact si la balise n’est pas refermée', async () => {
    // Un tour coupé : sans fermeture, aucun découpage n'est sûr.
    const blocks = await blocksOf('s3');
    expect(blocks.map((b) => b.kind)).toEqual(['text']);
    expect(blocks[0]?.text).toContain('<think>');
  });

  it('ne touche pas au prompt de l’utilisateur', async () => {
    // Qui écrit <think> dans sa question le dit littéralement.
    const blocks = await blocksOf('u1');
    expect(blocks.map((b) => b.kind)).toEqual(['text']);
    expect(blocks[0]?.text).toContain('<think>');
  });

  it('laisse le bloc thinking de Claude à son sort', async () => {
    const blocks = await blocksOf('s4');
    expect(blocks.map((b) => b.kind)).toEqual(['thinking', 'text']);
    expect(blocks[0]?.redacted).toBe(true);
    expect(blocks[0]?.text).toBe('');
  });
});
