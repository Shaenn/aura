// La couture de l'Atelier : ce que l'écran montre du fichier, et ce qu'il montre
// du direct.
//
// Le cas qui a motivé ces tests : une commande n'ouvre pas de tour humain, donc
// la couture n'a aucun repère pour la poser. Un `/compact` disparaissait de
// l'écran à la seconde où il partait, avec la frontière de compaction qu'il
// provoque — et si le harnais finissait d'écrire le fichier après la dernière
// relecture, elle n'y revenait qu'au tour suivant ou au rechargement de la page.

import { describe, expect, it } from 'vitest';
import { diskCaughtUp, stitch } from '../src/components/replay/seam.ts';
import type { TranscriptEvent } from '../shared/transcript.ts';

let clock = 0;

function event(
  part: Partial<TranscriptEvent> & { kind: TranscriptEvent['kind'] },
): TranscriptEvent {
  clock += 1000;
  return {
    uuid: `e${clock}`,
    parentUuid: null,
    timestamp: clock,
    isSidechain: false,
    isMeta: false,
    blocks: [],
    ...part,
  };
}

const human = (text: string) =>
  event({ kind: 'user', origin: 'human', blocks: [{ kind: 'text', text }] });

const answer = (text: string) => event({ kind: 'assistant', blocks: [{ kind: 'text', text }] });

const command = (name: string) =>
  event({
    kind: 'user',
    origin: 'slash-command',
    blocks: [{ kind: 'slash_command', name, text: '' }],
  });

const boundary = (uuid: string) =>
  event({
    kind: 'compaction',
    uuid,
    isMeta: true,
    compaction: {
      uuid,
      timestamp: clock,
      trigger: 'manual',
      preTokens: 0,
      postTokens: 0,
      durationMs: 0,
    },
  });

/** Ce que le harnais écrit après une compaction, et que le direct ne porte pas. */
const kept = () =>
  event({ kind: 'user', origin: 'compact-summary', blocks: [{ kind: 'text', text: 'résumé' }] });

describe('la couture du fil', () => {
  it('montre le direct seul tant que le fichier n’existe pas', () => {
    const live = [human('bonjour'), answer('voilà')];
    expect(stitch([], live, 0)).toEqual(live);
  });

  it('prolonge le fichier du tour en cours', () => {
    const disk = [human('un'), answer('un')];
    const live = [human('un'), answer('un'), human('deux'), answer('deux')];
    expect(stitch(disk, live, 1)).toEqual([...disk, live[2], live[3]]);
  });

  it('garde à l’écran une commande que le fichier n’a pas encore', () => {
    const disk = [human('un'), answer('un')];
    const compact = command('/compact');
    expect(stitch(disk, [...disk, compact], 1)).toEqual([...disk, compact]);
  });

  it('montre la frontière de compaction dès que le direct l’annonce', () => {
    const disk = [human('un'), answer('un')];
    const compact = command('/compact');
    const mark = boundary('c1');
    expect(stitch(disk, [...disk, compact, mark], 1)).toEqual([...disk, compact, mark]);
  });

  it('ne la montre pas deux fois une fois le fichier rattrapé', () => {
    const compact = command('/compact');
    const mark = boundary('c1');
    const written = [human('un'), answer('un'), boundary('c1'), kept(), command('/compact')];
    const live = [human('un'), answer('un'), compact, mark];
    expect(stitch(written, live, 1)).toEqual(written);
  });
});

describe('le disque a-t-il rattrapé le direct', () => {
  const live = [human('un'), answer('un'), command('/compact'), boundary('c1')];

  it('non tant que la frontière n’est pas écrite', () => {
    expect(diskCaughtUp([human('un'), answer('un')], live)).toBe(false);
  });

  it('oui quand elle l’est', () => {
    const disk = [human('un'), answer('un'), boundary('c1'), kept()];
    expect(diskCaughtUp(disk, live)).toBe(true);
  });

  it('non tant qu’un tour humain manque', () => {
    expect(diskCaughtUp([human('un')], [human('un'), human('deux')])).toBe(false);
  });
});
