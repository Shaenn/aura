// Le découpage du flux en pistes.
//
// Une seule propriété compte vraiment, et les autres en découlent : la partition
// est *totale*. Concaténer le fil principal et toutes les pistes doit rendre
// exactement le flux de départ — sans quoi un événement peut n'apparaître nulle
// part, ce qu'aucun écran ne signalerait.

import { describe, expect, it } from 'vitest';
import { eventsOfTrack, trackOfEvent, MAIN_TRACK } from '../src/composables/useAgentTracks.ts';
import type { TranscriptEvent } from '../shared/transcript.ts';

/** Un événement réduit à ce que le découpage regarde. */
function ev(uuid: string, extra: Partial<TranscriptEvent> = {}): TranscriptEvent {
  return {
    uuid,
    parentUuid: null,
    kind: 'assistant',
    timestamp: 0,
    isSidechain: false,
    isMeta: false,
    blocks: [],
    ...extra,
  };
}

/**
 * Le cas qui interdit de revenir au drapeau : une ligne venue d'un sidecar qui
 * n'est pas un sous-agent porte bien un `agentId`, mais pas `isSidechain`.
 */
const flux: TranscriptEvent[] = [
  ev('m1'),
  ev('a1', { isSidechain: true, agentId: 'alpha' }),
  ev('m2'),
  ev('b1', { isSidechain: true, agentId: 'beta' }),
  ev('a2', { isSidechain: true, agentId: 'alpha' }),
  ev('c1', { agentId: 'aside' }),
  ev('m3'),
];

describe('eventsOfTrack', () => {
  it('rend au fil principal ce qu’aucun agent n’a écrit', () => {
    expect(eventsOfTrack(flux, MAIN_TRACK).map((e) => e.uuid)).toEqual(['m1', 'm2', 'm3']);
  });

  it('rend à une piste ses seuls événements, dans l’ordre du flux', () => {
    expect(eventsOfTrack(flux, 'alpha').map((e) => e.uuid)).toEqual(['a1', 'a2']);
    expect(eventsOfTrack(flux, 'beta').map((e) => e.uuid)).toEqual(['b1']);
  });

  it('sort du fil principal une ligne qui porte un `agentId` sans être une sidechain', () => {
    expect(eventsOfTrack(flux, MAIN_TRACK).map((e) => e.uuid)).not.toContain('c1');
    expect(eventsOfTrack(flux, 'aside').map((e) => e.uuid)).toEqual(['c1']);
  });

  it('partitionne le flux sans perte ni doublon', () => {
    const pistes = ['alpha', 'beta', 'aside'];
    const repartis = [
      ...eventsOfTrack(flux, MAIN_TRACK),
      ...pistes.flatMap((p) => eventsOfTrack(flux, p)),
    ].map((e) => e.uuid);

    expect(repartis).toHaveLength(flux.length);
    expect([...repartis].sort()).toEqual(flux.map((e) => e.uuid).sort());
  });

  it('rend une piste vide pour un agent qui n’a rien écrit', () => {
    expect(eventsOfTrack(flux, 'inconnu')).toEqual([]);
  });
});

describe('trackOfEvent', () => {
  it('situe chaque événement dans sa piste', () => {
    const où = trackOfEvent(flux);
    expect(où.get('m2')).toBe(MAIN_TRACK);
    expect(où.get('a2')).toBe('alpha');
    expect(où.get('c1')).toBe('aside');
    expect(où.get('absent')).toBeUndefined();
  });
});
