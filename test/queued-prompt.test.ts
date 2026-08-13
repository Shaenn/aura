// Le message tapé pendant que l'agent travaille.
//
// Le CLI ne lui donne pas de ligne `user` : il le met en file, puis le dépile au
// milieu du tour sous forme d'`attachment`. L'agent l'a bien reçu — la suite du
// tour y répond — mais rien dans la timeline ne le montrait. 180 messages du
// parc, sur 116 sessions, disparaissaient ainsi du rejeu comme du direct.
//
// Ce qui compte ici : qu'il revienne, qu'il revienne *à sa place* (au milieu du
// tour, pas à la fin), et que la file ne serve pas de porte d'entrée à ce que le
// harnais s'envoie à lui-même.

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseTranscript } from '../server/transcript.ts';
import { isHumanMessage, useTranscriptTurns } from '../src/composables/useTranscriptTurns.ts';
import type { TranscriptEvent } from '../shared/transcript.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'queued.jsonl');

async function events(): Promise<TranscriptEvent[]> {
  return (await parseTranscript(FIXTURE, 'fixture')).events;
}

describe('message mis en file', () => {
  it('rend le message humain que la file transportait', async () => {
    const queued = (await events()).filter((e) => e.origin === 'queued');
    expect(queued).toHaveLength(1);
    expect(queued[0]?.kind).toBe('user');
    expect(queued[0]?.blocks[0]?.text).toBe('et si la carte prenait la couleur de l’agent ?');
  });

  it('le place là où il est arrivé, entre les deux réponses', async () => {
    const ordre = (await events()).map((e) => e.uuid);
    expect(ordre).toEqual(['u1', 's1', 'q1', 's2']);
  });

  it('laisse dehors ce que le harnais s’envoie à lui-même', async () => {
    // `q2` est une notification de sous-agent : elle passe par la même file, et
    // la rendre comme « Vous » serait le même mensonge qu'une ligne `user`
    // injectée. `q3` est humaine mais appartient à une sidechain : personne ne
    // tape dans la conversation d'un agent.
    const uuids = (await events()).map((e) => e.uuid);
    expect(uuids).not.toContain('q2');
    expect(uuids).not.toContain('q3');
  });

  it('compte pour l’humain qui parle, donc coupe le tour en deux', async () => {
    const evs = await events();
    expect(evs.filter(isHumanMessage).map((e) => e.uuid)).toEqual(['u1', 'q1']);

    const nodes = useTranscriptTurns(evs).value;
    expect(nodes.map((n) => n.kind)).toEqual(['user', 'turn', 'user', 'turn']);
  });

  it('ne touche ni au nombre de tours ni au premier prompt', async () => {
    // Les seuils du diagnostic sont calibrés sur la définition actuelle de
    // `userTurns` : un message en file est une prise de parole de plus à
    // l'écran, pas une mesure qui change rétroactivement.
    const { stats, firstPrompt } = await parseTranscript(FIXTURE, 'fixture');
    expect(stats.userTurns).toBe(1);
    expect(firstPrompt).toBe('regarde la carte de l’agent');
  });
});
