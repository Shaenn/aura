// Les commandes qu'une session lance en arrière-plan, suivies au fil du flux.
//
// Les messages de ce fichier ne sont pas inventés : c'est l'échange relevé le
// jour où la surface a été décidée, en lançant une boucle de deux minutes depuis
// une session ouverte sur ce dépôt. L'identifiant `btt4xdjh2`, le chemin
// temporaire en forme courte de Windows, le `(exit code 0)` de la notification —
// tout vient de là.
//
// Ce qui compte ici tient en trois points. Qu'un shell n'entre dans la liste
// qu'une fois nommé, parce qu'un appel sans identifiant ne se relit pas. Que sa
// fin soit *reçue* et non déduite — le harnais emploie le même jeton des deux
// bouts, là où un rapprochement par processus devrait deviner. Et que la garde
// de chemin résiste à la forme courte de Windows, qui a précisément de quoi
// faire échouer un `startsWith`.

import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isOutputPath, readSince, readTail, ShellTracker } from '../server/agent/shells.ts';

const TOOL_USE = 'toolu_01AaBbCcDdEeFfGgHhIiJjKk';
const SHELL = 'btt4xdjh2';
const COMMAND = 'for i in $(seq 1 60); do echo "tick $i"; sleep 2; done';

/** Le chemin tel que le CLI l'écrit : forme courte, séparateurs Windows. */
const OUTPUT =
  'C:\\Users\\JEANDU~1.DUP\\AppData\\Local\\Temp\\claude\\' +
  'C--Users-jean-dupont-Documents-devl-aura\\0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0\\' +
  'tasks\\btt4xdjh2.output';

const lance = (input: Record<string, unknown>): Record<string, unknown> => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: TOOL_USE, name: 'Bash', input }] },
});

const repond = (text: string): Record<string, unknown> => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: TOOL_USE, content: text }] },
});

/**
 * La forme sous laquelle le harnais injecte réellement sa nouvelle.
 *
 * `content` est une **chaîne**, pas une liste de blocs — relevé dans le
 * transcript d'une session de l'Atelier. Ne lire que la liste faisait manquer
 * toutes les fins de shell, sans que rien ne le signale : la ligne restait
 * simplement « en cours » pour toujours.
 */
const notifie = (text: string): Record<string, unknown> => ({
  type: 'user',
  message: { content: text },
});

/** La même nouvelle, en liste de blocs — l'autre forme que le SDK sait rendre. */
const notifieEnBlocs = (text: string): Record<string, unknown> => ({
  type: 'user',
  message: { content: [{ type: 'text', text }] },
});

/** La réponse du CLI, mot pour mot. */
const PROMESSE =
  `Command running in background with ID: ${SHELL}. ` +
  `Output is being written to: ${OUTPUT}. ` +
  'You will be notified when it completes. To check interim output, use Read on that file path.';

/** La notification de fin, mot pour mot. */
const FIN = [
  '<task-notification>',
  `<task-id>${SHELL}</task-id>`,
  `<output-file>${OUTPUT}</output-file>`,
  '<status>completed</status>',
  '<summary>Background command "Lancer un shell de test" completed (exit code 0)</summary>',
  '</task-notification>',
].join('\n');

describe('ShellTracker', () => {
  it('retient un shell une fois que la réponse le nomme', () => {
    const suiveur = new ShellTracker();

    // L'appel seul ne suffit pas : il porte la commande, pas l'identifiant. Une
    // ligne posée ici serait une ligne qu'on ne saurait pas relire.
    expect(suiveur.consume(lance({ command: COMMAND, run_in_background: true }))).toBe(false);
    expect(suiveur.snapshot()).toEqual([]);

    expect(suiveur.consume(repond(PROMESSE))).toBe(true);
    const [shell] = suiveur.snapshot();
    expect(shell?.id).toBe(SHELL);
    expect(shell?.command).toBe(COMMAND);
    expect(shell?.state).toBe('running');
    expect(suiveur.outputPath(SHELL)).toBe(OUTPUT);
  });

  it('reçoit la fin du harnais, avec son code de sortie', () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    expect(suiveur.consume(notifie(FIN))).toBe(true);
    const [shell] = suiveur.snapshot();
    expect(shell?.state).toBe('done');
    expect(shell?.exitCode).toBe(0);
    // Terminé, donc plus rien à relire sur le disque : c'est ce que le runner
    // interroge pour savoir s'il doit garder un minuteur armé.
    expect(suiveur.running()).toEqual([]);
  });

  it("distingue l'arrêt de la fin, sur le seul `status`", () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    // Même enveloppe, même `task-id` : seul le `<status>` dit qu'on a coupé.
    // Sans lui, la ligne annoncerait « terminé, code 0 » d'un shell arrêté.
    const coupe = FIN.replace('<status>completed</status>', '<status>killed</status>').replace(
      'exit code 0',
      'exit code 143',
    );
    expect(suiveur.consume(notifie(coupe))).toBe(true);
    const [shell] = suiveur.snapshot();
    expect(shell?.state).toBe('killed');
    expect(shell?.exitCode).toBe(143);
  });

  it('garde une fin en échec du côté des fins', () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    // `failed` est une fin, pas un arrêt : la commande est allée jusqu'au bout,
    // c'est son code de sortie qui porte la mauvaise nouvelle.
    const rate = FIN.replace('<status>completed</status>', '<status>failed</status>').replace(
      'exit code 0',
      'exit code 1',
    );
    suiveur.consume(notifie(rate));
    expect(suiveur.snapshot()[0]?.state).toBe('done');
    expect(suiveur.snapshot()[0]?.exitCode).toBe(1);
  });

  /** L'appel d'arrêt, tel qu'il passe dans le flux assistant. */
  const arrete = (name: string, input: Record<string, unknown>): Record<string, unknown> => ({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 'toolu_kill', name, input }] },
  });

  it("marque coupé le shell qu'un TaskStop arrête", () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    // La forme mesurée dans le transcript d'une session de l'Atelier :
    // `{"name":"TaskStop","input":{"task_id":"bil0wfua2"}}`. C'est la seule
    // trace d'un arrêt — le harnais n'écrit aucune `<task-notification>` pour
    // un shell coupé, contre deux par shell arrivé à son terme.
    expect(suiveur.consume(arrete('TaskStop', { task_id: SHELL }))).toBe(true);
    expect(suiveur.snapshot()[0]?.state).toBe('killed');
    // Coupé, donc plus rien à relire : le runner désarme son minuteur.
    expect(suiveur.running()).toEqual([]);
  });

  it("accepte l'ancienne forme de l'appel d'arrêt", () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    // `KillShell`/`shell_id` — le schéma de l'outil donne encore `shell_id`
    // pour déprécié, donc le repli se garde tant qu'il y est.
    expect(suiveur.consume(arrete('KillShell', { shell_id: SHELL }))).toBe(true);
    expect(suiveur.snapshot()[0]?.state).toBe('killed');
  });

  it("ignore l'arrêt d'une tâche qui n'est pas un shell", () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    // `TaskStop` arrête aussi les sous-agents, dont l'identifiant n'est pas un
    // shell connu. La liste ne bouge pas, et le shell en cours reste vivant.
    expect(suiveur.consume(arrete('TaskStop', { task_id: 'a64d37e991db110c5' }))).toBe(false);
    expect(suiveur.snapshot()[0]?.state).toBe('running');
  });

  it('reçoit la fin quand elle arrive en blocs', () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    expect(suiveur.consume(notifieEnBlocs(FIN))).toBe(true);
    expect(suiveur.snapshot()[0]?.state).toBe('done');
  });

  it('reçoit la fin par le transcript, faute de la recevoir par le flux', () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    // La ligne telle que le CLI l'écrit dans son `.jsonl` : la notification y
    // est un `content` de message `user`, échappée dans du JSON. C'est la seule
    // source qui l'apporte — le SDK, lui, ne relaie pas ce message.
    const ligne = JSON.stringify({ type: 'user', message: { role: 'user', content: FIN } });
    expect(suiveur.fromTranscript(`${ligne}\n`)).toBe(true);
    expect(suiveur.snapshot()[0]?.state).toBe('done');
    expect(suiveur.snapshot()[0]?.exitCode).toBe(0);
  });

  it('traverse une ligne de transcript tronquée sans broncher', () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    // Le fichier est lu pendant qu'il s'écrit : la dernière ligne peut être
    // coupée en plein JSON. Elle ne doit ni jeter ni faire perdre la suivante.
    const coupee = '{"type":"user","message":{"content":"<task-notification>\\n<task-i';
    expect(suiveur.fromTranscript(coupee)).toBe(false);
    expect(suiveur.snapshot()[0]?.state).toBe('running');
  });

  it("ignore la notification d'un sous-agent", () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    // Même enveloppe, autre population : les sous-agents s'annoncent ainsi
    // aussi, et leur identifiant n'est celui d'aucun shell.
    const autre = FIN.replace(SHELL, 'a4d3206f88842d979');
    expect(suiveur.consume(notifie(autre))).toBe(false);
    expect(suiveur.snapshot()[0]?.state).toBe('running');
  });

  it('laisse dehors un appel qui n’a jamais tourné', () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));

    // 447 des 1 123 échecs du parc sont de cette nature : la commande n'est
    // jamais partie. Sans identifiant, il n'y a ni ligne ni fichier.
    expect(
      suiveur.consume(repond("Permission to use Bash with command … hasn't been granted")),
    ).toBe(false);
    expect(suiveur.snapshot()).toEqual([]);
  });

  it('ne retient pas un Bash de premier plan', () => {
    const suiveur = new ShellTracker();
    expect(suiveur.consume(lance({ command: 'git status' }))).toBe(false);
    expect(suiveur.consume(repond(PROMESSE))).toBe(false);
    expect(suiveur.snapshot()).toEqual([]);
  });

  it('ne rediffuse que si la sortie a bougé', () => {
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));

    expect(suiveur.observe(SHELL, 351, 1_786_498_243_000)).toBe(true);
    expect(suiveur.observe(SHELL, 351, 1_786_498_243_000)).toBe(false);
    expect(suiveur.snapshot()[0]?.size).toBe(351);
  });
});

describe('isOutputPath', () => {
  it('accepte le chemin que le CLI annonce', () => {
    // La forme courte de Windows est le cas qui compte : comparer ce chemin au
    // préfixe rendu par `os.tmpdir()` échouerait sur le poste même où tout
    // fonctionne, puisque Node rend `jean.dupont` là où le CLI écrit
    // `JEANDU~1.DUP`.
    expect(isOutputPath(OUTPUT, SHELL)).toBe(true);
  });

  it('refuse un autre fichier, fût-il au bon endroit', () => {
    expect(isOutputPath(OUTPUT, 'bq55159a')).toBe(false);
    expect(isOutputPath(OUTPUT.replace('tasks', 'autre'), SHELL)).toBe(false);
    expect(isOutputPath('C:\\Users\\jean.dupont\\.claude\\settings.json', SHELL)).toBe(false);
  });

  it('refuse un identifiant qui n’en est pas un', () => {
    expect(isOutputPath(OUTPUT, '../../settings')).toBe(false);
    expect(isOutputPath(OUTPUT, '')).toBe(false);
  });
});

/**
 * La lecture qui rattrape le transcript.
 *
 * Distincte de `readTail`, et pour une raison qui a coûté une fin de shell : la
 * queue jette le milieu au-delà de sa borne, or c'est au milieu qu'une
 * notification se trouve dès que le tour précédent a beaucoup écrit. Le harnais
 * ne la réécrit pas — manquée une fois, manquée pour toujours.
 */
describe('readSince', () => {
  let dossier = '';

  beforeEach(async () => {
    dossier = await mkdtemp(join(tmpdir(), 'aura-shells-'));
  });

  afterEach(async () => {
    await rm(dossier, { recursive: true, force: true });
  });

  /** Un transcript : la notification en tête, puis beaucoup de bruit derrière. */
  const ecrire = async (bruit: number): Promise<string> => {
    const path = join(dossier, 'transcript.jsonl');
    const ligne = JSON.stringify({ type: 'user', message: { role: 'user', content: FIN } });
    const remplissage = Array.from({ length: bruit }, (_, i) =>
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: `${i}` }] } }),
    );
    await writeFile(path, [ligne, ...remplissage, ''].join('\n'), 'utf8');
    return path;
  };

  it('rend la ligne du début, que la queue aurait sautée', async () => {
    const path = await ecrire(2_000);
    const { size } = await stat(path);
    expect(size).toBeGreaterThan(64 * 1024);

    // La queue seule ne verrait que les derniers 64 Ko : la notification est en
    // tête, donc hors de sa fenêtre.
    expect((await readTail(path, 0)).text).not.toContain('task-notification');

    const page = await readSince(path, 0);
    expect(page.text).toContain('task-notification');

    // Et ce qu'elle rend suffit au suiveur à conclure.
    const suiveur = new ShellTracker();
    suiveur.consume(lance({ command: COMMAND, run_in_background: true }));
    suiveur.consume(repond(PROMESSE));
    expect(suiveur.fromTranscript(page.text)).toBe(true);
    expect(suiveur.snapshot()[0]?.state).toBe('done');
  });

  it('ne coupe jamais une ligne en deux, et reprend où il s’est arrêté', async () => {
    const path = await ecrire(20_000);
    const { size } = await stat(path);

    let curseur = 0;
    let tout = '';
    let pages = 0;
    while (curseur < size) {
      const page = await readSince(path, curseur);
      expect(page.next).toBeGreaterThan(curseur);
      // Une page rendue au milieu du fichier finit sur une ligne entière.
      if (page.next < size) expect(page.text.endsWith('\n')).toBe(true);
      tout += page.text;
      curseur = page.next;
      pages += 1;
    }

    // Le fichier est bien passé en plusieurs fois, et rien ne s'est perdu.
    expect(pages).toBeGreaterThan(1);
    expect(tout.length).toBe(size);
    expect(
      tout
        .split('\n')
        .filter(Boolean)
        .every((l) => l.startsWith('{')),
    ).toBe(true);
  });

  it('ne rend rien tant que le fichier n’a pas grossi', async () => {
    const path = await ecrire(1);
    const { size } = await stat(path);
    expect((await readSince(path, size)).text).toBe('');
  });
});
