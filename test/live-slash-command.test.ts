// La commande `/` tapée dans l'Atelier, telle que le direct la publie.
//
// Elle n'est pas un tour humain, et c'est tout l'enjeu : l'Atelier recoud le
// direct au disque en comptant les tours humains de part et d'autre. Le disque
// classe la commande en `slash-command` ; le direct la comptait comme humaine,
// et la couture se posait un tour trop tôt. Après un `/compact`, la frontière de
// compaction tombait alors des deux côtés de la couture et le fil affichait une
// phase de plus que la session n'en avait vécu.

import { describe, expect, it } from 'vitest';
import { Translator } from '../server/agent/translate.ts';
import { isHumanMessage } from '../src/composables/useTranscriptTurns.ts';
import type { TranscriptEvent } from '../shared/transcript.ts';

function prompt(text: string, images: never[] = []): TranscriptEvent {
  const t = new Translator();
  t.appendUserPrompt(text, images);
  return t.events[0]!;
}

describe('un tour tapé au composeur', () => {
  it('donne à la commande la forme que le disque lui donnera', () => {
    const e = prompt('/compact');
    expect(e.origin).toBe('slash-command');
    expect(e.blocks).toEqual([{ kind: 'slash_command', name: '/compact', text: '' }]);
  });

  it('garde les arguments à part du nom', () => {
    expect(prompt('/compact garde les décisions').blocks[0]).toEqual({
      kind: 'slash_command',
      name: '/compact',
      text: 'garde les décisions',
    });
  });

  it('accepte le nom d’une commande de plugin', () => {
    expect(prompt('/aura:revue').blocks[0]?.name).toBe('/aura:revue');
  });

  it('ne compte pas la commande comme un tour humain', () => {
    expect(isHumanMessage(prompt('/compact'))).toBe(false);
    expect(isHumanMessage(prompt('relis ce fichier'))).toBe(true);
  });

  it('laisse un chemin collé être ce qu’il est : du texte', () => {
    const e = prompt('/home/jean/notes.md à relire');
    expect(e.origin).toBe('human');
    expect(e.blocks[0]?.kind).toBe('text');
  });
});
