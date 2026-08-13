// Le rejeu du plan de travail : `TaskCreate` / `TaskUpdate` sont des mutations,
// et la colonne du flux affiche un état. Tout le risque est là — un identifiant
// mal raccroché et le panneau montre une tâche en cours qui ne l'est plus.

import { describe, expect, it } from 'vitest';
import type { TranscriptEvent } from '../shared/transcript.ts';
import { blockKey, groupTaskPlans, trackTasks } from '../src/components/replay/taskList.ts';

let seq = 0;

/** Un tour d'assistant portant un seul appel d'outil. */
function call(
  name: string,
  input: Record<string, unknown>,
  meta?: Record<string, unknown>,
  isSidechain = false,
): TranscriptEvent {
  seq += 1;
  return {
    uuid: `u${seq}`,
    parentUuid: null,
    kind: 'assistant',
    timestamp: seq,
    isSidechain,
    isMeta: false,
    blocks: [
      {
        kind: 'tool_use',
        id: `t${seq}`,
        name,
        input,
        result: { content: '', isError: false, ...(meta ? { meta } : {}) },
      },
    ],
  };
}

describe('rejeu du plan de travail', () => {
  it("suit les statuts et retient l'identifiant du sidecar", () => {
    const events = [
      call(
        'TaskCreate',
        { subject: 'Route serveur', activeForm: 'Ajout de la route' },
        {
          task: { id: '1', subject: 'Route serveur' },
        },
      ),
      call('TaskCreate', { subject: 'Panneau' }, { task: { id: '2', subject: 'Panneau' } }),
      call('TaskUpdate', { taskId: '1', status: 'in_progress' }),
      call('TaskUpdate', { taskId: '1', status: 'completed' }),
      call('TaskUpdate', { taskId: '2', status: 'in_progress' }),
    ];

    const { tasks, done, current } = trackTasks(events);

    expect(tasks.map((t) => t.id)).toEqual(['1', '2']);
    expect(tasks.map((t) => t.status)).toEqual(['completed', 'in_progress']);
    expect(done).toBe(1);
    expect(current?.subject).toBe('Panneau');
    // Le renvoi vise le dernier mouvement de la tâche, pas sa création.
    expect(tasks[0]?.uuid).toBe(events[3]?.uuid);
  });

  it('renvoie au début du travail, pas à son accusé de fin', () => {
    const events = [
      call('TaskCreate', { subject: 'A' }, { task: { id: '1' } }),
      call('TaskUpdate', { taskId: '1', status: 'in_progress' }),
      call('TaskUpdate', { taskId: '1', status: 'completed' }),
    ];

    const [task] = trackTasks(events).tasks;
    expect(task?.startUuid).toBe(events[1]?.uuid);
    expect(task?.uuid).toBe(events[2]?.uuid);
  });

  it('déplace le repère sur la reprise quand une tâche redémarre', () => {
    const events = [
      call('TaskCreate', { subject: 'A' }, { task: { id: '1' } }),
      call('TaskUpdate', { taskId: '1', status: 'in_progress' }),
      call('TaskUpdate', { taskId: '1', status: 'pending' }),
      call('TaskUpdate', { taskId: '1', status: 'in_progress' }),
    ];

    expect(trackTasks(events).tasks[0]?.startUuid).toBe(events[3]?.uuid);
  });

  it("vise la naissance d'une tâche jamais démarrée", () => {
    const events = [call('TaskCreate', { subject: 'A' }, { task: { id: '1' } })];
    expect(trackTasks(events).tasks[0]?.startUuid).toBe(events[0]?.uuid);
  });

  it('numérote par rang de création quand le sidecar manque', () => {
    const events = [
      call('TaskCreate', { subject: 'A' }),
      call('TaskCreate', { subject: 'B' }),
      call('TaskUpdate', { taskId: '2', status: 'completed' }),
    ];

    const { tasks, done } = trackTasks(events);
    expect(tasks.map((t) => t.id)).toEqual(['1', '2']);
    expect(done).toBe(1);
  });

  it('ignore les listes des sous-agents', () => {
    // Un sous-agent numérote ses tâches à partir de 1, lui aussi : sans le
    // filtre, son `TaskCreate` écraserait la première tâche de la session.
    const events = [
      call('TaskCreate', { subject: 'Session' }, { task: { id: '1', subject: 'Session' } }),
      call('TaskCreate', { subject: 'Sous-agent' }, { task: { id: '1' } }, true),
      call('TaskUpdate', { taskId: '1', status: 'completed' }, undefined, true),
    ];

    const { tasks, done } = trackTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.subject).toBe('Session');
    expect(done).toBe(0);
  });

  it("laisse tomber un update sur une tâche qu'on n'a pas vue naître", () => {
    // Après une compaction, les premiers tours peuvent manquer au fichier relu.
    const { tasks } = trackTasks([call('TaskUpdate', { taskId: '7', status: 'completed' })]);
    expect(tasks).toEqual([]);
  });
});

describe('les plans successifs', () => {
  it('ouvre un plan neuf quand les créations reprennent après le travail', () => {
    // Le harness ne remet pas sa numérotation à zéro : rien, dans le fil des
    // appels, ne dit la couture — sinon la reprise elle-même.
    const events = [
      call('TaskCreate', { subject: 'A' }, { task: { id: '1' } }),
      call('TaskCreate', { subject: 'B' }, { task: { id: '2' } }),
      call('TaskUpdate', { taskId: '1', status: 'completed' }),
      call('TaskUpdate', { taskId: '2', status: 'completed' }),
      call('TaskCreate', { subject: 'C' }, { task: { id: '3' } }),
      call('TaskCreate', { subject: 'D' }, { task: { id: '4' } }),
      call('TaskUpdate', { taskId: '3', status: 'in_progress' }),
    ];

    const { waves, currentWave, tasks, done } = trackTasks(events);

    expect(waves.map((w) => w.tasks.map((t) => t.subject))).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(waves.map((w) => w.index)).toEqual([1, 2]);
    expect(waves.map((w) => w.done)).toEqual([2, 0]);
    expect(currentWave).toBe(waves[1]);
    // La liste à plat reste celle de la session entière, dans l'ordre de création.
    expect(tasks.map((t) => t.id)).toEqual(['1', '2', '3', '4']);
    expect(done).toBe(2);
  });

  it('ne coupe pas un plan posé en deux temps', () => {
    // Une phrase entre deux créations ne fait pas un second plan : tant que rien
    // n'a bougé, la session est encore en train d'écrire sa liste.
    const events = [
      call('TaskCreate', { subject: 'A' }),
      text(),
      call('TaskCreate', { subject: 'B' }),
    ];

    expect(trackTasks(events).waves).toHaveLength(1);
  });

  it('rattache au plan courant une tâche découverte en chemin', () => {
    // Tant qu'il reste du travail, une tâche de plus est un ajout, pas un plan
    // neuf : la couper ferait une couture — et un repli — à chaque étape.
    const events = [
      call('TaskCreate', { subject: 'A' }, { task: { id: '1' } }),
      call('TaskCreate', { subject: 'B' }, { task: { id: '2' } }),
      call('TaskUpdate', { taskId: '1', status: 'completed' }),
      call('TaskCreate', { subject: 'C' }, { task: { id: '3' } }),
    ];

    const { waves } = trackTasks(events);
    expect(waves).toHaveLength(1);
    expect(waves[0]?.tasks.map((t) => t.subject)).toEqual(['A', 'B', 'C']);
  });

  it('ne rouvre pas de plan sur un update qui ne trouve pas sa tâche', () => {
    // Après une compaction, l'update d'une tâche disparue ne close rien.
    const events = [
      call('TaskCreate', { subject: 'A' }, { task: { id: '1' } }),
      call('TaskUpdate', { taskId: '99', status: 'completed' }),
      call('TaskCreate', { subject: 'B' }, { task: { id: '2' } }),
    ];

    expect(trackTasks(events).waves).toHaveLength(1);
  });

  it('sans plan du tout, il n’y a pas de plan courant', () => {
    const { waves, currentWave } = trackTasks([]);
    expect(waves).toEqual([]);
    expect(currentWave).toBeNull();
  });

  it('désigne le travail du moment, pas la tâche restée en plan', () => {
    // Un plan abandonné laisse une tâche jamais close ; c'est le dernier
    // mouvement qui dit ce que la session est en train de faire.
    const events = [
      call('TaskCreate', { subject: 'Oubliée' }, { task: { id: '1' } }),
      call('TaskUpdate', { taskId: '1', status: 'in_progress' }),
      call('TaskCreate', { subject: 'En cours' }, { task: { id: '2' } }),
      call('TaskUpdate', { taskId: '2', status: 'in_progress' }),
    ];

    expect(trackTasks(events).current?.subject).toBe('En cours');
  });
});

// ── Le regroupement dans le flux ─────────────────────────────────────────────

/** Un tour qui ne dit qu'une phrase — ce qui coupe une série. */
function text(): TranscriptEvent {
  seq += 1;
  return {
    uuid: `u${seq}`,
    parentUuid: null,
    kind: 'assistant',
    timestamp: seq,
    isSidechain: false,
    isMeta: false,
    blocks: [{ kind: 'text', text: 'Je commence par le serveur.' }],
  };
}

const never = () => false;

describe('regroupement des créations dans le flux', () => {
  it('réunit une série et enjambe les jalons qu’elle traverse', () => {
    const events = [
      call('TaskCreate', { subject: 'A' }, { task: { id: '1' } }),
      call('TaskCreate', { subject: 'B' }, { task: { id: '2' } }),
      call('TaskCreate', { subject: 'C' }, { task: { id: '3' } }),
    ];

    const { starts, absorbed, marks } = groupTaskPlans(events, never);

    // La série s'ouvre sur le premier bloc du premier événement.
    expect([...starts.keys()]).toEqual([blockKey(0, 0)]);
    expect(starts.get(blockKey(0, 0))?.map((i) => i.subject)).toEqual(['A', 'B', 'C']);
    // Les deux suivants ne rendent plus rien pour leur compte.
    expect([...absorbed]).toEqual([blockKey(1, 0), blockKey(2, 0)]);
    // Le jalon du premier tour reste : il dit où le plan a été posé.
    expect([...marks]).toEqual([events[1]?.uuid, events[2]?.uuid]);
    // L'ancre de chaque tour survit, portée par la ligne de sa tâche.
    expect(starts.get(blockKey(0, 0))?.map((i) => i.uuid)).toEqual(events.map((e) => e.uuid));
  });

  it('ne groupe pas une création isolée', () => {
    // Une liste d'une ligne pèse plus que la ligne qu'elle remplace.
    const { starts, absorbed, marks } = groupTaskPlans(
      [call('TaskCreate', { subject: 'A' })],
      never,
    );
    expect(starts.size).toBe(0);
    expect(absorbed.size).toBe(0);
    expect(marks.size).toBe(0);
  });

  it('coupe la série sur ce qui s’intercale', () => {
    const events = [
      call('TaskCreate', { subject: 'A' }),
      call('TaskCreate', { subject: 'B' }),
      text(),
      call('TaskCreate', { subject: 'C' }),
      call('TaskCreate', { subject: 'D' }),
    ];

    const { starts } = groupTaskPlans(events, never);
    expect([...starts.keys()]).toEqual([blockKey(0, 0), blockKey(3, 0)]);
    expect(starts.get(blockKey(3, 0))?.map((i) => i.subject)).toEqual(['C', 'D']);
  });

  it('ne fait pas disparaître un jalon qui se déplie', () => {
    // Un tour qui a fait entrer un fichier en silence doit garder son jalon,
    // sinon l'injection devient invisible.
    const events = [
      call('TaskCreate', { subject: 'A' }),
      call('TaskCreate', { subject: 'B' }),
      call('TaskCreate', { subject: 'C' }),
    ];
    const noisy = events[1]!.uuid;

    const { starts, marks } = groupTaskPlans(events, (ev) => ev.uuid === noisy);
    expect(marks.has(noisy)).toBe(false);
    // La série est coupée en deux, et celle d'un seul élément n'en est pas une.
    expect([...starts.keys()]).toEqual([blockKey(1, 0)]);
    expect(starts.get(blockKey(1, 0))?.map((i) => i.subject)).toEqual(['B', 'C']);
  });

  it('ne groupe pas les mises à jour', () => {
    // Une transition est un battement du récit : elle garde sa ligne.
    const events = [
      call('TaskUpdate', { taskId: '1', status: 'completed' }),
      call('TaskUpdate', { taskId: '2', status: 'in_progress' }),
    ];
    expect(groupTaskPlans(events, never).starts.size).toBe(0);
  });
});
