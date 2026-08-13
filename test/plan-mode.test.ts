// Le mode plan, régime de session.
//
// Ce n'est pas un outil : `EnterPlanMode` n'est appelé que 15 fois au parc,
// alors que la session passe 142 fois en mode plan — **129 entrées sur 142 se
// font au clavier**. Le transcript ne le trace que par des `attachment` que le
// rejeu laissait tomber, si bien que 2 439 réponses d'assistant s'affichaient
// comme un travail ordinaire alors que l'écriture y était interdite.
//
// Ce qui compte ici : que les trois bornes soient lues, que la portée soit
// juste, et surtout que rien ne soit inventé là où le fichier ne dit rien — le
// mode plan traverse les frontières de session, et **45 sessions sur 133** ont
// un compte de bornes déséquilibré.

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseTranscript } from '../server/transcript.ts';
import type { TranscriptEvent } from '../shared/transcript.ts';

const load = async (name: string): Promise<TranscriptEvent[]> =>
  (await parseTranscript(join(import.meta.dirname, 'fixtures', `${name}.jsonl`), 'fixture')).events;

const bornes = (evs: TranscriptEvent[]) => evs.filter((e) => e.kind === 'planmode');
const marques = (evs: TranscriptEvent[]) => evs.filter((e) => e.inPlanMode).map((e) => e.uuid);

describe('bornes du mode plan', () => {
  it('lit l’entrée, la reprise et la sortie', async () => {
    const evs = await load('plan-mode');
    expect(bornes(evs).map((e) => e.planMode?.phase)).toEqual([
      'enter',
      'reentry',
      'exit',
      'enter',
    ]);
  });

  it('distingue le plan neuf du plan repris', async () => {
    const [entree] = bornes(await load('plan-mode'));
    expect(entree?.planMode?.planExists).toBe(false);
    expect(entree?.planMode?.planFilePath).toContain('zany-watching-toast.md');
  });

  it('ne laisse pas le régime d’un sous-agent devenir celui de la session', async () => {
    // `pm3` est une entrée en mode plan sur une sidechain : elle appartient à la
    // conversation de l'agent, jamais à celle qui l'a lancé.
    const evs = await load('plan-mode');
    expect(evs.map((e) => e.uuid)).not.toContain('pm3');
  });
});

describe('portée du régime', () => {
  it('marque tout ce qui tombe entre l’ouverture et la fermeture', async () => {
    // `a5` est après la sortie : il n'est pas contraint.
    expect(marques(await load('plan-mode'))).toEqual(['a1', 'a2', 'a3', 'a4', 'a6']);
  });

  it('annonce le nombre de tours à l’ouverture', async () => {
    const [entree] = bornes(await load('plan-mode'));
    // a1, a2, a3, a4 — quatre réponses avant la sortie.
    expect(entree?.planMode?.turns).toBe(4);
  });

  it('ne chiffre pas la portée d’un régime resté ouvert', async () => {
    // 12 sessions du parc finissent en mode plan. Rien ne dit combien de tours
    // il aurait couverts de plus, donc rien n'est annoncé — mais `a6` est bien
    // marqué : lui, on sait qu'il était contraint.
    const derniere = bornes(await load('plan-mode')).at(-1);
    expect(derniere?.planMode?.turns).toBeUndefined();
    expect(marques(await load('plan-mode'))).toContain('a6');
  });
});

describe('ce que le fichier ne dit pas', () => {
  it('ne réouvre pas un régime déjà ouvert quand le CLI redit le rappel', async () => {
    // `pm2` est un second `plan_mode`, même fichier de plan, à l'intérieur du
    // régime : 4 cas au parc, entre 66 et 249 lignes après l'ouverture. Le
    // prendre pour une entrée poserait un marqueur au milieu du séjour et
    // repartirait le compte de tours à zéro — `turns` vaudrait 2 au lieu de 4.
    // La ligne sort du fil : vidée de sa borne, elle s'afficherait en bloc
    // « Système » sans rien dire.
    const evs = await load('plan-mode');
    expect(evs.map((e) => e.uuid)).not.toContain('pm2');
  });

  it('accepte une sortie sans ouverture, sans en inventer une', async () => {
    // Une session reprise (`--continue`) démarre dans un régime ouvert par la
    // précédente : 33 sorties orphelines au parc. La sortie s'affiche, et rien
    // avant elle n'est teinté — on ne sait pas si `a1` était contraint.
    const evs = await load('plan-mode-reprise');
    expect(bornes(evs).map((e) => e.planMode?.phase)).toEqual(['exit']);
    expect(marques(evs)).toEqual([]);
  });
});
