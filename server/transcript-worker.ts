// Le thread qui lit, parse et sérialise un transcript.
//
// Rien ici n'est propre au parse : `parseTranscript` est importé tel quel et
// n'a pas été touché. Ce fichier n'existe que pour lui donner un thread à lui.
//
// Il rend des **octets**, pas un objet, et c'est le point de tout le dispositif.
// Un `postMessage` d'un `ParsedTranscript` passerait par un clone structuré :
// sérialiser côté worker, désérialiser côté principal — soit exactement le coût
// qu'on cherche à sortir de la boucle d'événements, payé deux fois. Un
// `Uint8Array` se transfère, lui : on passe la propriété de la mémoire, sans
// copie. Le thread principal ne voit donc jamais le graphe d'objets.
//
// C'est possible parce que personne dans le BFF ne consomme ce graphe :
// `parseTranscript` n'est appelé que par le cache, dont le seul lecteur est la
// route qui renvoie le résultat au navigateur. Le modèle n'existe que pour être
// sérialisé — autant le sérialiser là où il est né.

import { parentPort } from 'node:worker_threads';
import { parseTranscript } from './transcript.ts';

/** Ce que le pool demande. `seq` ne sert qu'à rendre la réponse à son appelant. */
export interface ParseRequest {
  seq: number;
  abs: string;
  id: string;
}

/** Ce que le worker rend : des octets, ou la raison de leur absence. */
export type ParseResponse = { seq: number; body: Uint8Array } | { seq: number; error: string };

/** Lire, parser, sérialiser. La seule fonction utile du fichier. */
export async function serialiseTranscript(abs: string, id: string): Promise<Uint8Array> {
  const transcript = await parseTranscript(abs, id);
  // `TextEncoder` et non `Buffer.from` : le `Buffer` d'une petite chaîne est une
  // vue sur le pool interne de Node, qu'on ne peut pas transférer sans emporter
  // la mémoire des voisins. `encode` rend un tableau sur son propre tampon.
  return new TextEncoder().encode(JSON.stringify(transcript));
}

// Importé par les tests pour ce qu'il exporte, exécuté par le pool pour ce qu'il
// écoute : hors d'un worker, `parentPort` est nul et le module ne fait rien.
parentPort?.on('message', (req: ParseRequest) => {
  void serialiseTranscript(req.abs, req.id).then(
    // Le tampon est transféré, pas cloné : sans cette liste, `postMessage`
    // recopierait les mégaoctets qu'on vient d'écrire — et le pool n'aurait
    // servi à rien. `TextEncoder` rend toujours un `ArrayBuffer` ordinaire, que
    // le type large de `.buffer` ne dit pas.
    (body) => parentPort?.postMessage({ seq: req.seq, body }, [body.buffer as ArrayBuffer]),
    (e: unknown) => {
      // Un transcript illisible est un cas courant — fichier effacé, ligne
      // tronquée pendant la lecture. Il se rend, il ne tue pas le thread.
      const error = e instanceof Error ? e.message : String(e);
      parentPort?.postMessage({ seq: req.seq, error });
    },
  );
});
