// Les sessions vivantes du processus.
//
// Une carte en mémoire, volontairement : ce qu'elle garde — le processus du SDK,
// les abonnés SSE, la promesse d'une permission en attente — ne se sérialise pas.
// Ce qui doit survivre à un redémarrage survit déjà ailleurs : le SDK écrit le
// transcript sur le disque, et une session s'y reprend par `resume`.
//
// Le registre porte aussi les deux garde-fous du parc. Ils répondent à la même
// question par deux bouts : combien de processus `claude` AURA a-t-elle le droit
// de faire vivre en même temps, et combien de temps a-t-elle le droit d'en
// garder un que plus personne ne regarde.

import { SessionRunner, type RunnerOptions } from './runner.ts';
import type { AgentSession } from '../../shared/agent.ts';

/**
 * Combien de sessions peuvent tourner de front.
 *
 * Chaque session est un processus `claude` entier : sa mémoire, son quota, sa
 * part de la machine. Aucune borne jusqu'ici — la route créait à la demande, et
 * une boucle côté client, ou simplement des ouvertures d'onglets répétées,
 * pouvaient en empiler autant que le poste en supportait.
 *
 * Six : au-delà, ce n'est plus un atelier qu'on pilote, c'est un parc qu'on
 * subit. Le refus est franc et réversible — fermer une session en libère une.
 */
export const MAX_SESSIONS = 6;

/**
 * Au bout de combien de temps sans personne une session est ramassée.
 *
 * Le registre promet qu'une session survit à la fermeture d'un onglet : c'est ce
 * qui permet de revenir sur un travail en cours, et de le suivre depuis deux
 * écrans. Cette promesse n'avait pas de terme, donc une session ouverte puis
 * abandonnée — l'onglet fermé sans un mot — tenait son processus jusqu'à
 * l'extinction du serveur.
 *
 * Une demi-heure : plus long que toute absence qui se rattrape, plus court que
 * l'oubli. Ce qui est ramassé n'est jamais perdu pour autant — le transcript est
 * sur le disque, et l'Atelier sait rouvrir dessus par `resume`.
 */
export const IDLE_TTL_MS = 30 * 60_000;

/**
 * Le pas du balayeur.
 *
 * Il ne cherche rien : il parcourt une carte qui compte moins d'une dizaine
 * d'entrées et demande à chacune si son délai est passé. La minute est un
 * arrondi de confort — l'échéance qu'elle sert se compte en dizaines de minutes.
 */
const SWEEP_MS = 60_000;

const runners = new Map<string, SessionRunner>();

let sweeper: ReturnType<typeof setInterval> | null = null;

/**
 * Le balayeur ne tourne que s'il y a quelque chose à balayer.
 *
 * Même motif que `watch.ts` : on arme au premier arrivant, on désarme au
 * dernier parti. Un minuteur qui bat toute la nuit sur une carte vide n'est pas
 * une fuite, mais c'est un battement de plus dans les traces, pour rien.
 *
 * `unref` : ce minuteur ne doit jamais être la raison pour laquelle Node reste
 * en vie.
 */
function armSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(sweep, SWEEP_MS);
  sweeper.unref();
}

function disarmSweeper(): void {
  if (!sweeper || runners.size > 0) return;
  clearInterval(sweeper);
  sweeper = null;
}

/**
 * Ramasse les sessions que plus personne ne regarde.
 *
 * Exporté pour que les tests puissent l'appeler sans attendre la minute ; rien
 * d'autre ne devrait avoir à le faire. Rend les `runId` ramassés — c'est ce que
 * le test lit, et de quoi tracer si le besoin s'en présentait.
 */
export function sweep(ttlMs = IDLE_TTL_MS): string[] {
  const collected: string[] = [];
  for (const [runId, runner] of runners) {
    if (!runner.expired(ttlMs)) continue;
    collected.push(runId);
    removeRunner(runId);
  }
  return collected;
}

/** Combien de sessions vivent en ce moment. */
export function countSessions(): number {
  return runners.size;
}

/** Le parc est-il plein ? La route s'en sert pour refuser avant de créer. */
export function atCapacity(): boolean {
  return runners.size >= MAX_SESSIONS;
}

export function createRunner(options: RunnerOptions): SessionRunner {
  const runner = new SessionRunner(options);
  runners.set(runner.session.runId, runner);
  armSweeper();
  return runner;
}

export function getRunner(runId: string): SessionRunner | undefined {
  return runners.get(runId);
}

export function listSessions(): AgentSession[] {
  return [...runners.values()].map((r) => r.session).sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Arrête la session et l'oublie. Idempotent : appeler deux fois ne coûte rien.
 *
 * L'oubli est immédiat, l'arrêt ne l'est pas toujours : voir `SessionRunner.stop`.
 * C'est précisément pourquoi le runner doit savoir se couper tout seul — une
 * fois retiré d'ici, plus personne ne peut le lui demander.
 */
export function removeRunner(runId: string, grace?: number): boolean {
  const runner = runners.get(runId);
  if (!runner) return false;
  runner.stop(grace);
  runners.delete(runId);
  disarmSweeper();
  return true;
}

/**
 * Arrête tout, à l'extinction du serveur.
 *
 * Sans cela, un processus `claude` par session resterait derrière — invisible,
 * et toujours en train de consommer le quota.
 */
export function stopAll(): void {
  // Sans délai de grâce : le serveur n'a plus les quelques secondes qu'il
  // faudrait pour laisser chaque CLI sortir de lui-même, et un processus qu'on
  // n'a pas coupé avant de disparaître ne sera plus coupé par personne.
  for (const runId of [...runners.keys()]) removeRunner(runId, 0);
}
