// Découper le flux d'une session en pistes : le fil principal d'un côté, chaque
// sous-agent de l'autre.
//
// Le parseur insère les tours d'un sous-agent là où l'appel `Agent` a été fait,
// ce qui répond à la question « quand cela s'est-il produit ? » mais noie le
// travail de l'agent principal : un run de deux cents tours occupe deux cents
// lignes du fil. Les pistes répondent à l'autre question — « qu'a fait cet
// agent ? » — sans rien déplacer dans le modèle : on ne fait que choisir, à
// l'affichage, quelle part du flux on regarde.

import type { TranscriptEvent } from 'shared/transcript';

/** La piste affichée : `''` pour le fil principal, sinon l'`agentId` d'un run. */
export type TrackId = string;

export const MAIN_TRACK: TrackId = '';

/**
 * Les événements d'une piste.
 *
 * La partition se fait sur `agentId`, et jamais sur `isSidechain` : l'écart
 * compte. Le parseur estampille d'un `agentId` toute ligne venue d'un sidecar,
 * y compris celles des sidecars qui ne sont pas des sous-agents (une question
 * posée de côté) et qui, elles, ne portent pas toujours le drapeau. Trier sur le
 * drapeau laisserait ces lignes-là dans le fil principal *et* dans leur piste ;
 * trier sur l'identité donne une partition exacte — chaque événement dans une
 * piste et une seule, rien qui disparaisse.
 */
export function eventsOfTrack(
  events: readonly TranscriptEvent[],
  track: TrackId,
): TranscriptEvent[] {
  return track ? events.filter((e) => e.agentId === track) : events.filter((e) => !e.agentId);
}

/**
 * Pour chaque événement, la piste où il se trouve.
 *
 * Sert au saut : les liens du panneau de contexte et du plan de travail visent
 * tous le fil principal, et depuis la piste d'un agent leur cible n'est pas à
 * l'écran. Savoir où elle est permet d'y aller plutôt que d'échouer en silence.
 */
export function trackOfEvent(events: readonly TranscriptEvent[]): Map<string, TrackId> {
  const out = new Map<string, TrackId>();
  for (const e of events) out.set(e.uuid, e.agentId ?? MAIN_TRACK);
  return out;
}

/**
 * L'`id` DOM de l'onglet d'une piste.
 *
 * Le flux affiché est le panneau de l'onglet sélectionné, et un lecteur d'écran
 * doit pouvoir faire le lien — d'où un `aria-labelledby` qui nomme l'onglet. Les
 * deux côtés calculent cet identifiant avec la même fonction, faute de quoi la
 * relation se romprait sans que rien ne le montre à l'écran.
 */
export function trackTabId(track: TrackId): string {
  return `agent-track-${track || 'main'}`;
}
