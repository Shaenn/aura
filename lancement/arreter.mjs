// Arrête le projet : ce que `lancer.mjs` a démarré, puis tout ce qui tient encore un de ses ports.
//
// Gabarit commun du parc, distribué par VIGIE. Ne pas le modifier ici : une copie retouchée
// diverge des autres sans que personne le voie, et VIGIE la signalera. Ce qui est propre au
// projet vit dans `services.json`.
//
// Usage : node lancement/arreter.mjs [port…]
//
// Trois passes, dans cet ordre.
//
//  0. L'extinction propre des services qui en déclarent une (`"arret"` dans `services.json`) : une
//     commande du projet, lancée tant que le service tourne encore. Sous Windows, aucun signal ne
//     se transmet de l'extérieur — `taskkill` est un `TerminateProcess`, et le crochet d'arrêt du
//     service ne s'exécute jamais. Un service qui tient des processus hors de son arbre les
//     laisserait derrière lui. Comment lui demander de partir est son affaire : le moteur ne sait
//     que lancer la commande, et attendre qu'elle rende la main.
//  1. Les arbres de processus que `lancer.mjs` a notés dans `.local/lancement.json`. C'est la
//     seule façon d'atteindre ce qui n'écoute sur aucun port : `dotnet watch` tient l'application
//     qui écoute, mais pas le port lui-même. Libérer le seul port le laissait vivant, et il
//     relançait l'application au fichier suivant.
//  2. Les ports de `ports.json`, TOUTES les clés, et ceux passés en argument : le filet pour un
//     service lancé à la main, ou par un lanceur mort sans avoir rien noté.
//
// Le port se lit sans `-p tcp` sous Windows : `netstat -p tcp` ne liste que l'IPv4, et Vite
// n'écoute que sur `[::1]` quand on ne lui dit rien. Le processus trouvé est coupé avec son arbre
// (`taskkill /T`) : un serveur de dev a des enfants (esbuild, le compilateur), qui survivraient.
//
// Et l'on remonte d'abord à son SUPERVISEUR, s'il en a un. `node --watch` et `dotnet watch` ne
// tiennent pas le port : c'est leur fils qui l'écoute. Couper le fils seul ne fait que provoquer
// un remplaçant. La remontée s'arrête au premier ancêtre qui n'est pas un superviseur — le
// terminal, ou `pnpm`, qui ne nous appartiennent pas.

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { uptime } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RACINE = dirname(dirname(fileURLToPath(import.meta.url)))
export const FICHIER_PID = join(RACINE, '.local', 'lancement.json')

const WINDOWS = process.platform === 'win32'

/** Les ports déclarés par `ports.json`, toutes clés confondues. */
export function portsDeclares() {
  try {
    const doc = JSON.parse(readFileSync(join(RACINE, 'ports.json'), 'utf8'))
    return Object.values(doc).filter((p) => Number.isInteger(p) && p > 0 && p < 65536)
  } catch {
    // Pas de `ports.json`, ou illisible : l'usage par arguments reste possible.
    return []
  }
}

/**
 * Coupe un processus et toute sa descendance.
 *
 * Sous Windows, `taskkill /T` est le seul moyen : un signal n'atteint que le processus visé, et
 * `shell: true` en fait un `cmd.exe` dont les vrais serveurs sont les enfants. Ailleurs, le
 * lanceur a créé un groupe de processus : on signale le groupe entier.
 */
export function couperArbre(pid) {
  if (WINDOWS) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Déjà mort : c'est le résultat voulu.
    }
  }
}

/**
 * Ce qu'un lanceur précédent a noté, s'il est encore crédible.
 *
 * Un PID se recycle. Le fichier d'une session d'avant le dernier redémarrage du poste désigne
 * des numéros que d'autres processus portent peut-être déjà : il est écarté. Dans la même session,
 * on vérifie en plus que le processus est toujours un shell — c'est ce que `lancer.mjs` démarre.
 */
function processusNotes() {
  let note
  try {
    note = JSON.parse(readFileSync(FICHIER_PID, 'utf8'))
  } catch {
    return []
  }
  const demarrageDuPoste = Date.now() - uptime() * 1000
  if (!(note.demarreLe > demarrageDuPoste)) {
    return []
  }
  return Object.entries(note.services ?? {}).filter(([, pid]) => Number.isInteger(pid) && pid !== process.pid && estUnShell(pid))
}

function estUnShell(pid) {
  if (WINDOWS) {
    const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
    return /^"cmd\.exe"/i.test(r.stdout?.trim() ?? '')
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Les PID qui écoutent sur ce port. */
function pidsSur(port) {
  let sortie
  try {
    sortie = WINDOWS
      ? execFileSync('netstat', ['-ano'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      : execFileSync('lsof', ['-ti', `tcp:${port}`, '-s', 'tcp:LISTEN'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    // `lsof` sort en erreur quand il ne trouve rien : c'est le cas nominal, pas un incident.
    return []
  }

  const pids = new Set()
  for (const ligne of sortie.split('\n')) {
    const t = ligne.trim()
    if (!t) {
      continue
    }
    if (!WINDOWS) {
      pids.add(Number(t))
      continue
    }
    // `Proto  Adresse locale  Adresse distante  État  PID`. On vérifie que le port est bien le
    // port LOCAL : `:5001` se retrouverait aussi dans une adresse distante.
    const cols = t.split(/\s+/)
    if (cols[0] !== 'TCP' || cols[3] !== 'LISTENING') {
      continue
    }
    const pid = Number(cols[4])
    if (cols[1]?.endsWith(`:${port}`) && Number.isInteger(pid) && pid > 0) {
      pids.add(pid)
    }
  }
  return [...pids].filter((p) => p !== process.pid)
}

/** Les services de `services.json`, sections `dev` et `preview` confondues. */
function servicesDeclares() {
  try {
    const doc = JSON.parse(readFileSync(join(RACINE, 'lancement', 'services.json'), 'utf8'))
    return [...Object.entries(doc.dev ?? {}), ...Object.entries(doc.preview?.services ?? {})].map(([nom, s]) => ({ nom, ...s }))
  } catch {
    return []
  }
}

/**
 * Lance la commande d'extinction des services qui en déclarent une, tant qu'ils tournent encore.
 *
 * La commande part de la racine du dépôt, comme les scripts de `lancement/` où elle a sa place.
 * Un service sans port déclaré n'est pas sollicité : rien ne dit qu'il tourne, et sa commande
 * d'extinction échouerait contre un service absent. Rend le nombre de commandes lancées.
 */
export function demanderExtinction() {
  let ports = {}
  try {
    ports = JSON.parse(readFileSync(join(RACINE, 'ports.json'), 'utf8'))
  } catch {
    // Pas de `ports.json` : aucun service ne peut être reconnu en marche.
  }

  let lancees = 0
  const faits = new Set()
  for (const s of servicesDeclares()) {
    const port = ports[s.nom]
    if (typeof s.arret !== 'string' || faits.has(s.arret) || !Number.isInteger(port) || !pidsSur(port).length) {
      continue
    }
    faits.add(s.arret)
    console.log(`${s.nom} — extinction : ${s.arret}`)
    // Une borne, pour qu'un service qui ne répond plus ne bloque pas l'arrêt : la suite le coupera.
    spawnSync(s.arret, { cwd: RACINE, shell: true, stdio: 'inherit', timeout: 20000 })
    lancees += 1
  }
  return lancees
}

/**
 * Arrête tout. Rend le nombre de processus coupés.
 *
 * Appelé seul par `stop.bat`, et en tête de `lancer.mjs` : démarrer commence par faire place nette,
 * sans quoi le service suivant tombe sur un port tenu par la session d'avant.
 */
export function arreter(portsEnPlus = []) {
  // Le fichier part AVANT tout le reste, extinction comprise : c'est à son absence que le lanceur
  // dont un service s'en va reconnaît un arrêt demandé d'ailleurs, et non une panne.
  const notes = processusNotes()
  rmSync(FICHIER_PID, { force: true })

  let coupes = demanderExtinction()
  for (const [nom, pid] of notes) {
    couperArbre(pid)
    console.log(`${nom} — arbre du processus ${pid} arrêté`)
    coupes += 1
  }

  let table = null
  for (const port of new Set([...portsDeclares(), ...portsEnPlus])) {
    for (const pid of pidsSur(port)) {
      // La table des processus coûte une seconde sous Windows : elle n'est lue que si un port est
      // effectivement tenu, c'est-à-dire presque jamais au démarrage.
      table ??= tableDesProcessus()
      const cible = superviseurDe(pid, table)
      couperArbre(cible)
      console.log(`port ${port} — processus ${cible}${cible === pid ? '' : ` (superviseur de ${pid})`} arrêté`)
      coupes += 1
    }
  }

  return coupes
}

/** Ce qu'on reconnaît d'un superviseur qui relance son fils : `node --watch`, `dotnet watch`. */
const SUPERVISEUR = /(?:^|[\s"\\/])node(?:\.exe)?"?\s.*--watch\b|\bdotnet(?:\.exe)?"?\s+watch\b|dotnet-watch/i

/** Le plus haut ancêtre superviseur de ce processus, ou lui-même. */
function superviseurDe(pid, table) {
  let cible = pid
  for (let parent = table.get(cible)?.parent; parent && SUPERVISEUR.test(table.get(parent)?.cmd ?? ''); parent = table.get(parent)?.parent) {
    cible = parent
  }
  return cible
}

/** Tous les processus vivants : parent et ligne de commande. Vide hors Windows, où l'on ne remonte pas. */
function tableDesProcessus() {
  const table = new Map()
  if (!WINDOWS) {
    return table
  }
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress'],
    { encoding: 'utf8' },
  )
  try {
    const lus = JSON.parse(r.stdout)
    // `ConvertTo-Json` rend un objet seul quand la liste n'a qu'un élément.
    for (const p of Array.isArray(lus) ? lus : [lus]) {
      table.set(p.ProcessId, { parent: p.ParentProcessId, cmd: p.CommandLine ?? '' })
    }
  } catch {
    // Table illisible : on coupe le seul processus qui écoute, comme avant.
  }
  return table
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ports = process.argv
    .slice(2)
    .filter((p) => /^\d+$/.test(p))
    .map(Number)
  if (!arreter(ports)) {
    console.log('Rien à arrêter : aucun processus du projet ne tourne.')
  }
}
