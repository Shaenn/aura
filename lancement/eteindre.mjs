// Demande au BFF d'AURA de s'éteindre lui-même : la commande `arret` du service `api`.
//
//   node lancement/eteindre.mjs
//
// Propre à AURA, et c'est pourquoi elle vit ici et non dans le lanceur commun : le lanceur
// sait seulement qu'un service peut déclarer une extinction, et la lance avant de couper.
//
// Lui seul peut couper les sessions de l'Atelier : un processus `claude` par session, qu'aucun
// signal venu de l'extérieur ne joindrait sous Windows — `taskkill` y est un `TerminateProcess`,
// et le crochet `onClose` du serveur ne s'exécuterait jamais. Elles survivraient au serveur en
// consommant toujours le quota. HTTP est le seul canal qui l'atteigne encore :
// `POST /api/system/shutdown` lui demande de partir, et il ferme Fastify, coupe ses sessions,
// puis sort. Rien de tout cela n'est instantané : on lui laisse le temps avant de rendre la main.

import { readFileSync } from 'node:fs'

/** Le port du BFF : celui de `ports.json`, sauf si l'environnement en impose un autre. */
const PORT = Number(process.env.PORT) || JSON.parse(readFileSync(new URL('../ports.json', import.meta.url), 'utf8')).api

const ATTENTE_MS = 8000

if (await demander()) {
  await attendreDepart()
}

/** Rend `false` s'il n'y a personne à qui parler. */
async function demander() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/system/shutdown`, {
      method: 'POST',
      // Corps vide mais typé : sans en-tête exploitable, Fastify refuse la requête avant même
      // d'entrer dans la route.
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      return false
    }
    const { sessions = 0 } = await res.json().catch(() => ({}))
    console.log(sessions ? `Extinction demandée au serveur — ${sessions} session(s) de l'Atelier à couper.` : 'Extinction demandée au serveur.')
    return true
  } catch {
    // Personne n'écoute, ou ce n'est pas un BFF d'AURA : le lanceur commun s'en chargera.
    return false
  }
}

/** Attend que le port ne réponde plus, dans la limite du délai. */
async function attendreDepart() {
  const limite = Date.now() + ATTENTE_MS
  while (Date.now() < limite) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(500) })
    } catch (e) {
      // Seul le refus de connexion dit que le serveur est parti ; un délai dépassé dit seulement
      // qu'il est occupé à se fermer.
      if (e?.cause?.code === 'ECONNREFUSED') {
        return
      }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
}
