// Ne pas reparser un transcript qui n'a pas bougé.
//
// Un transcript est un fichier en append seul. Le relire coûte : une lecture, un
// `JSON.parse` ligne à ligne, un assemblage. Mesuré sur le parc réel, c'est 3 à
// 61 ms pour une session vivante et 280 ms pour la plus grosse — et c'est payé à
// chaque demande, y compris quand rien n'a changé.
//
// Ce travail ne bloque plus la boucle d'événements : il a lieu dans un thread à
// part (`parse-pool.ts`), qui rend le transcript déjà sérialisé. Ce cache retient
// donc des octets, pas un graphe d'objets.
//
// Et rien n'a changé, le plus souvent. La page Replay et la page Sessions peuvent
// regarder la même session ; un onglet rouvert redemande ; le poll de repli
// redemande toutes les 30 s. Seul l'ajout d'une ligne invalide vraiment.
//
// Ce que ce cache ne fait pas : accélérer l'ajout d'une ligne. Le fichier a
// changé, l'empreinte aussi, on reparse tout. Rendre *cela* incrémental est un
// autre chantier, plus délicat — une ligne ajoutée peut modifier un événement
// déjà émis, car le `tool_result` d'un `tool_use` vit dans la ligne suivante.

import { stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { Stats } from 'node:fs';
import { summariseTranscript, type TranscriptSummary } from './transcript.ts';
import { serialiseInPool } from './parse-pool.ts';

export interface CachedTranscript {
  /**
   * Le transcript déjà sérialisé, prêt à écrire sur la socket.
   *
   * Des octets et non un objet : le parse a lieu dans un thread à part
   * (`parse-pool.ts`), et rapatrier le graphe coûterait le clone structuré qu'on
   * cherche justement à éviter. Personne dans le BFF n'a besoin du modèle — il
   * n'existe que pour être rendu au navigateur.
   *
   * Un `Buffer` et non le `Uint8Array` que rend le thread : Fastify ne reconnaît
   * que le premier comme un corps déjà écrit. Un `Uint8Array` nu lui semblerait
   * un objet ordinaire, qu'il sérialiserait en JSON — un tableau de nombres.
   */
  body: Buffer;
  /** Condensé de l'empreinte des sources, tel qu'envoyé en `ETag`. */
  etag: string;
}

/**
 * Budget du cache, compté en octets servis.
 *
 * Exact, depuis qu'on retient la sérialisation et non le graphe d'objets : c'est
 * la mémoire réellement tenue. Elle tient une très longue session et plusieurs
 * autres à côté, ce qui couvre le cas réel — quelques sessions consultées, pas
 * le dossier entier.
 */
const MAX_BYTES = 24 * 1024 * 1024;

interface Entry {
  print: string;
  bytes: number;
  cached: CachedTranscript;
}

/** L'ordre d'insertion d'une `Map` fait l'ordre d'éviction : le plus ancien sort. */
const entries = new Map<string, Entry>();
let heldBytes = 0;

/**
 * Ce qui identifie l'état d'un fichier en append seul.
 *
 * `mtime` seul ne suffit pas — sa granularité varie selon le système de fichiers.
 * La taille seule non plus — une réécriture peut la conserver. Ensemble, sur un
 * fichier auquel on ne fait qu'ajouter des lignes, ils ne peuvent pas mentir.
 */
function fingerprint(s: Stats): string {
  return `${Math.round(s.mtimeMs)}-${s.size}`;
}

/**
 * La version de la lecture, mêlée à l'empreinte.
 *
 * L'empreinte ne décrivait que les fichiers source. Or le transcript servi n'est
 * pas le fichier : c'est ce que `transcript.ts` en tire. Changer le parseur sans
 * changer le fichier laissait donc l'`ETag` identique — le navigateur revalidait,
 * recevait `304`, et continuait d'afficher indéfiniment un transcript lu par la
 * version d'avant. Découvert en ajoutant la lecture des messages d'équipier : le
 * BFF servait bien la nouvelle forme en `curl`, l'écran montrait l'ancienne.
 *
 * À incrémenter à chaque changement de ce que `parseTranscript` produit.
 */
const PARSER_VERSION = 9;

/**
 * L'état de tous les fichiers d'où le transcript parsé est tiré.
 *
 * Un agent d'exploration écrit ses tours dans `<id>/subagents/agent-*.jsonl`
 * pendant qu'il travaille ; le fichier de session, lui, ne bouge pas avant que
 * l'agent ait rendu son rapport. Une empreinte prise sur le seul fichier de
 * session faisait donc resservir le parse précédent — et l'`ETag` qui en découle
 * répondre `304` — pendant toute l'exploration : le stream restait figé, puis
 * rattrapait d'un coup au retour de l'agent. Le transcript parsé *contient* ces
 * lignes, alors son empreinte doit en dépendre.
 *
 * Le dossier absent (aucun sous-agent) est le cas courant : il ne coûte qu'un
 * `readdir` en échec et ne contribue rien.
 *
 * Ne rend que l'empreinte : le volume des sources accompagnait cette valeur du
 * temps où le cache retenait un graphe d'objets et devait estimer son poids. Il
 * retient maintenant des octets, qu'il compte exactement.
 */
export async function sourceState(abs: string, id: string): Promise<string> {
  const main = await stat(abs);
  const parts = [`v${PARSER_VERSION}`, fingerprint(main)];

  const dir = join(dirname(abs), id, 'subagents');
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return parts.join('|');
  }
  // Trié : l'ordre de `readdir` n'est pas garanti, et deux ordres différents pour
  // le même état feraient reparser sans raison.
  files.sort();

  for (const f of files) {
    try {
      parts.push(`${f}:${fingerprint(await stat(join(dir, f)))}`);
    } catch {
      /* un sidecar disparu entre le listing et le stat ne compte pas */
    }
  }
  return parts.join('|');
}

/**
 * L'empreinte, réduite à une taille d'en-tête.
 *
 * Elle nomme chaque sidecar, donc elle grandit avec le nombre de sous-agents —
 * une session à dix agents produirait un `ETag` de plusieurs centaines d'octets,
 * renvoyé à chaque requête et à chaque `If-None-Match`. Un condensé garde la
 * seule propriété qu'on lui demande : changer quand la source change.
 */
function etagOf(print: string): string {
  return `W/"${createHash('sha1').update(print).digest('base64url').slice(0, 22)}"`;
}

function evictUntilUnder(limit: number): void {
  for (const [key, entry] of entries) {
    if (heldBytes <= limit) return;
    entries.delete(key);
    heldBytes -= entry.bytes;
  }
}

function remember(abs: string, entry: Entry): void {
  const previous = entries.get(abs);
  if (previous) heldBytes -= previous.bytes;
  entries.delete(abs);
  entries.set(abs, entry);
  heldBytes += entry.bytes;
  evictUntilUnder(MAX_BYTES);
}

// ── Les résumés de la liste ──────────────────────────────────────────────────
//
// Même raisonnement, autre échelle. La page projet résume *tous* les transcripts
// du projet à chaque affichage, et un projet actif en compte des centaines pour
// plusieurs dizaines de mégaoctets. Le résumé est cent fois plus léger que le
// parse complet, mais il lit le même fichier en entier — et le paie à chaque
// fois, pour un dossier dont une seule session bouge.
//
// Deux différences avec le cache ci-dessus. L'empreinte ne porte que sur le
// fichier principal : un résumé ne regarde pas les sidecars des sous-agents,
// donc leur écriture ne l'invalide pas. Et le budget se compte en entrées, pas
// en octets : un `TranscriptSummary` pèse quelques centaines d'octets, tout le
// dossier tient largement sous le plafond.

/** De quoi tenir un dossier bien fourni avec de la marge. */
const MAX_SUMMARIES = 2000;

interface SummaryEntry {
  print: string;
  summary: TranscriptSummary;
}

const summaries = new Map<string, SummaryEntry>();

/** Résumer un transcript, en réutilisant le résumé précédent s'il vaut encore. */
export async function summariseTranscriptCached(
  abs: string,
  id: string,
): Promise<TranscriptSummary> {
  const print = fingerprint(await stat(abs));

  const hit = summaries.get(abs);
  if (hit && hit.print === print) {
    // Le resservir le rend récent : il repasse en fin de file d'éviction.
    summaries.delete(abs);
    summaries.set(abs, hit);
    return hit.summary;
  }

  const summary = await summariseTranscript(abs, id);
  summaries.delete(abs);
  summaries.set(abs, { print, summary });
  // L'ordre d'insertion fait l'ordre d'éviction : le plus ancien sort.
  while (summaries.size > MAX_SUMMARIES) {
    const oldest = summaries.keys().next().value;
    if (oldest === undefined) break;
    summaries.delete(oldest);
  }
  return summary;
}

/**
 * Combien de fichiers on résume en parallèle.
 *
 * Séquentiellement, N sessions froides sont N lectures qui s'attendent l'une
 * l'autre. Grand ouvert, ce sont N fichiers de plusieurs centaines de Ko en
 * mémoire en même temps. Un lot borné prend l'accélération sans le pic.
 */
const SUMMARY_CONCURRENCY = 8;

/** List every `<id>.jsonl` transcript in a project's transcript directory. */
export async function listTranscripts(projectDir: string): Promise<TranscriptSummary[]> {
  if (!existsSync(projectDir)) return [];
  const files = (await readdir(projectDir)).filter((f) => f.endsWith('.jsonl'));

  const out: TranscriptSummary[] = [];
  for (let i = 0; i < files.length; i += SUMMARY_CONCURRENCY) {
    const lot = files.slice(i, i + SUMMARY_CONCURRENCY);
    const done = await Promise.all(
      lot.map((f) =>
        summariseTranscriptCached(join(projectDir, f), f.replace(/\.jsonl$/, '')).catch(
          // Un fichier disparu ou illisible ne doit pas vider la liste entière.
          () => null,
        ),
      ),
    );
    for (const s of done) if (s) out.push(s);
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Lire et parser un transcript, en réutilisant le parse précédent s'il est encore
 * valable.
 *
 * On relève l'empreinte des sources avant et après le parse. Si elle a changé
 * entre les deux, une ligne a été écrite pendant qu'on lisait — dans le fichier
 * de session ou dans le sidecar d'un sous-agent : le résultat correspond alors à
 * un état qu'aucune des deux empreintes ne décrit. Il reste bon à renvoyer, mais
 * on refuse de le mémoriser sous une empreinte qui le ferait resservir plus tard
 * pour des sources devenues différentes.
 */
export async function readTranscriptCached(abs: string, id: string): Promise<CachedTranscript> {
  const before = await sourceState(abs, id);

  const hit = entries.get(abs);
  if (hit && hit.print === before) {
    // Le relire le rend récent : il repasse en fin de file d'éviction.
    entries.delete(abs);
    entries.set(abs, hit);
    return hit.cached;
  }

  // Le seul endroit du BFF où un transcript est lu : le travail part dans un
  // thread, la boucle d'événements reste libre de servir les autres pendant ce
  // temps. Ce `await` n'immobilise que la requête qui l'a demandé.
  const bytes = await serialiseInPool(abs, id);
  // Une vue sur les mêmes octets, sans copie : le transfert depuis le thread
  // nous en a donné la propriété, il n'y a rien à recopier pour les habiller.
  const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cached: CachedTranscript = { body, etag: etagOf(before) };

  const after = await sourceState(abs, id);
  if (after === before) {
    remember(abs, { print: before, bytes: body.byteLength, cached });
  }
  return cached;
}
