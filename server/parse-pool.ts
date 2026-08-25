// Le pool de threads qui parsent les transcripts.
//
// Le BFF n'a qu'une boucle d'événements, et un parse est du JS synchrone : rien
// d'autre ne s'exécute pendant ce temps. Mesuré sur le parc réel, c'est 3 à
// 61 ms pour une session vivante, 280 ms pour la plus grosse — et pendant ces
// millisecondes les trames SSE, l'Atelier et la liste des sessions attendent.
// Trois sessions actives ne triplaient pas la charge, elles la faisaient dériver :
// la notification « le transcript a bougé » ne pouvait partir qu'après le parse
// précédent, donc plus tard, donc sur un fichier plus gros.
//
// Un pool rend au BFF la propriété qu'un serveur thread-per-request a
// nativement : un parse lent ralentit sa requête, pas celles des autres.
//
// Pas de dépendance ajoutée — `piscina` ferait plus, et le dépôt n'a pas d'autre
// besoin de pool. Ce qui suit est le strict nécessaire : répartir, rendre la
// réponse à son appelant, survivre à un thread qui meurt.

import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { ParseRequest, ParseResponse } from './transcript-worker.ts'

/**
 * Combien de threads.
 *
 * `cpus - 1` laisse la boucle d'événements travailler pendant que les workers
 * parsent — c'est tout l'objet du dispositif. Plafonné à 4 : au-delà on paierait
 * de la mémoire pour des sessions qui n'existent pas, le parc réel étant de
 * quelques sessions consultées et jamais du dossier entier. Un transcript de
 * 20 Mo en cours de parse pèse plusieurs fois sa taille.
 */
const SIZE = Math.max(1, Math.min(4, cpus().length - 1))

/** Le module que chaque thread exécute. */
const ENTRY = fileURLToPath(new URL('./transcript-worker.ts', import.meta.url))

/**
 * La mort du thread, distincte de l'échec du transcript.
 *
 * Un transcript illisible revient par message et doit remonter à l'appelant : le
 * fichier a disparu, il n'y a rien à servir. Un thread qui meurt ne dit rien du
 * transcript — la demande est réessayable, et elle le sera sur place.
 */
class WorkerDied extends Error {}

interface Pending {
  resolve: (body: Uint8Array) => void
  reject: (e: Error) => void
  /** Le thread qui l'a prise en charge, pour solder ses demandes s'il meurt. */
  worker: Slot
}

interface Slot {
  worker: Worker
  /** Combien de demandes ce thread a en vol. Sert à répartir. */
  load: number
  /** A-t-il déjà répondu une fois ? Voir `die` : un thread mort-né condamne le pool. */
  answered: boolean
}

const slots: Slot[] = []
const pending = new Map<number, Pending>()
let seq = 0
let stopped = false
/**
 * Le pool a-t-il renoncé ?
 *
 * Un worker qui ne démarre pas n'est pas une panne d'AURA : on reparse sur le
 * thread principal, comme avant. On perd la propriété, jamais la fonction — et
 * on ne réessaie pas à chaque requête, ce qui transformerait une panne en
 * tempête de spawns.
 */
let unavailable = false

function settleAll(slot: Slot, error: Error): void {
  for (const [id, p] of pending) {
    if (p.worker !== slot) continue
    pending.delete(id)
    p.reject(error)
  }
}

function spawn(): Slot | null {
  try {
    const worker = new Worker(ENTRY)
    const slot: Slot = { worker, load: 0, answered: false }

    worker.on('message', (res: ParseResponse) => {
      const p = pending.get(res.seq)
      if (!p) return
      pending.delete(res.seq)
      slot.load--
      slot.answered = true
      // Au repos, un thread ne doit plus retenir Node en vie ; en vol, il le
      // doit — sans quoi un process dont c'est le seul travail en cours (un
      // test, un script) sortirait en laissant la promesse pendante.
      if (slot.load === 0) worker.unref()
      if ('error' in res) p.reject(new Error(res.error))
      else p.resolve(res.body)
    })

    // Un thread mort ne doit pas laisser ses appelants suspendus pour toujours :
    // une fois retiré du pool, plus personne ne pourra les solder.
    const die = (reason: string): void => {
      const at = slots.indexOf(slot)
      if (at >= 0) slots.splice(at, 1)
      // Mort sans avoir jamais répondu : ce n'est pas un accident, c'est que le
      // module ne se charge pas dans ce contexte — un chargeur absent, un import
      // qu'il ne sait pas résoudre. Réessayer n'en ferait qu'une tempête de
      // threads mort-nés ; on renonce au pool et on lit sur place.
      if (!slot.answered) unavailable = true
      settleAll(slot, new WorkerDied(reason))
    }
    worker.on('error', (e: Error) => die(e.message))
    worker.on('exit', (code) => {
      if (code !== 0) die(`Le thread de lecture s'est arrêté (code ${code}).`)
    })
    // Au repos dès la naissance : il ne sera référencé que le temps d'un parse.
    worker.unref()

    slots.push(slot)
    return slot
  } catch {
    return null
  }
}

/** Un thread libre, sinon un neuf, sinon le moins chargé. */
function pick(): Slot | null {
  // Un thread au repos avant d'en démarrer un : sur un usage à une session, le
  // pool doit rester à un seul thread plutôt que d'en ouvrir quatre au fil des
  // requêtes.
  const idle = slots.find((s) => s.load === 0)
  if (idle) return idle

  if (slots.length < SIZE) {
    const fresh = spawn()
    if (fresh) return fresh
  }
  // Aucun thread nulle part : le pool n'existe pas sur cette machine.
  if (!slots.length) {
    unavailable = true
    return null
  }
  // Au moins-chargé et non en tourniquet : un thread occupé par un transcript de
  // 20 Mo ne doit pas recevoir la demande suivante.
  return slots.reduce((best, s) => (s.load < best.load ? s : best))
}

/**
 * Le transcript, lu et sérialisé hors du thread principal.
 *
 * Rend les octets JSON prêts à écrire sur la socket. Retombe sur un parse en
 * process si le pool est indisponible — voir `unavailable`.
 */
export async function serialiseInPool(abs: string, id: string): Promise<Uint8Array> {
  if (stopped || unavailable) return fallback(abs, id)

  const slot = pick()
  if (!slot) return fallback(abs, id)

  try {
    return await dispatch(slot, abs, id)
  } catch (e) {
    // Le thread est mort, le transcript n'y est pour rien : on relit sur place
    // plutôt que de rendre une erreur à un utilisateur qui n'a rien fait de mal.
    if (e instanceof WorkerDied) return fallback(abs, id)
    throw e
  }
}

function dispatch(slot: Slot, abs: string, id: string): Promise<Uint8Array> {
  const request: ParseRequest = { seq: seq++, abs, id }
  slot.load++
  // Référencé le temps du parse : au repos un thread ne doit pas retenir Node en
  // vie, en vol il le doit — sans quoi un process dont c'est le seul travail
  // sortirait en laissant la promesse pendante.
  slot.worker.ref()
  return new Promise<Uint8Array>((resolve, reject) => {
    pending.set(request.seq, { resolve, reject, worker: slot })
    slot.worker.postMessage(request)
  })
}

/** Le même travail, sur le thread principal. Le filet, jamais la voie normale. */
async function fallback(abs: string, id: string): Promise<Uint8Array> {
  const { serialiseTranscript } = await import('./transcript-worker.ts')
  return serialiseTranscript(abs, id)
}

/** Rendre les threads. Sans cela, ils survivraient à l'extinction du serveur. */
export function stopPool(): void {
  stopped = true
  for (const slot of slots.splice(0)) {
    settleAll(slot, new WorkerDied('Le serveur s’arrête.'))
    void slot.worker.terminate()
  }
}

/** Ce que le pool a sous la main. Pour les tests et le diagnostic, rien d'autre. */
export function poolState(): {
  size: number
  workers: number
  inFlight: number
  unavailable: boolean
} {
  return { size: SIZE, workers: slots.length, inFlight: pending.size, unavailable }
}
