/* eslint-disable no-console -- Outil de ligne de commande : la console est sa sortie. */
// Libère les ports d'AURA avant un lancement, et sert de moteur aux scripts d'arrêt.
//
//   node scripts/free-ports.mjs            # les ports de ports.json
//   node scripts/free-ports.mjs 8800 9100  # ceux qu'on lui donne
//
// Sans argument est la forme normale, et celle qu'emploient `stop` et
// `dev:all`. L'ancienne obligeait à recopier les deux ports dans chacun d'eux :
// autant de listes à tenir d'accord avec `ports.json`, et un `stop` qui
// libérait un port que personne n'occupait le jour où l'une d'elles décrochait.
//
// Deux gestes, dans cet ordre — et l'ordre est tout le sujet :
//
//  1. Demander au BFF de partir de lui-même (`POST /api/system/shutdown`). Lui
//     seul peut couper les sessions de l'Atelier : un processus `claude` par
//     session, qu'aucun signal venu de l'extérieur ne joindrait sous Windows, et
//     qui survivrait à un arrêt brutal en consommant toujours le quota.
//  2. Terminer ce qui reste. C'est un filet, pas la méthode : il ne sert qu'aux
//     restes d'une session précédente, dont les sessions sont déjà orphelines.
//
// Le second geste vise l'arbre, pas la feuille. Le BFF est lancé par
// `node --watch`, qui est un superviseur : le port est tenu par son *fils*.
// Tuer le fils seul ne fait que provoquer un remplaçant.
//
// Windows uniquement — `netstat` et `taskkill`. AURA n'est développée et testée
// que là ; écrire ici une branche pour un système qu'on ne peut pas essayer
// reviendrait à promettre ce qu'on n'a pas vérifié.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Les ports du dépôt. La seule déclaration — voir l'en-tête de `quasar.config.ts`. */
const PORTS = JSON.parse(readFileSync(new URL('../ports.json', import.meta.url), 'utf8'))

if (process.platform !== 'win32') {
  console.error(`Je ne sais libérer les ports que sous Windows, pas sous ${process.platform}.`)
  console.error('Arrêtez le serveur par Ctrl+C dans la fenêtre qui le porte.')
  process.exit(2)
}

/** Ce à quoi on reconnaît un processus d'AURA, pour ne remonter que chez nous. */
const MARKERS = [/server[/\\]index\.ts/, /quasar/, /concurrently/, /dev:all/]

// Les arguments restent acceptés — ils servent à viser un port qui n'est pas
// celui du dépôt, ce que fait un essai sur une seconde instance.
const demandes = process.argv.slice(2).map(Number).filter(Boolean)
const ports = demandes.length ? demandes : [PORTS.api, PORTS.web]

/** Le port du BFF, seul à savoir s'éteindre proprement. */
const API_PORT = Number(process.env.PORT) || PORTS.api

await main()

async function main() {
  if (ports.includes(API_PORT) && (await askShutdown(API_PORT))) {
    // Le serveur ferme Fastify, coupe ses sessions, puis sort. Rien de tout cela
    // n'est instantané : on lui laisse le temps avant de juger.
    await waitUntilFree(API_PORT, 8000)
  }

  const survivors = ports.filter((p) => listeners(p).length)
  if (!survivors.length) {
    console.log('Ports libres.')
    return
  }

  const table = processTable()
  const doomed = new Set()
  for (const port of survivors) {
    for (const pid of listeners(port)) climb(pid, table, doomed)
  }

  for (const pid of doomed) kill(pid)

  const stuck = ports.filter((p) => listeners(p).length)
  if (stuck.length) {
    console.error(`Je n'ai pas pu libérer : ${stuck.join(', ')}.`)
    process.exit(1)
  }
  console.log(`Restes d'une session précédente écartés : ${[...doomed].join(', ')}.`)
}

// ── L'extinction ordonnée ───────────────────────────────────────────────────

/** Demande au BFF de s'éteindre. Rend `false` s'il n'y a personne à qui parler. */
async function askShutdown(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/system/shutdown`, {
      method: 'POST',
      // Corps vide mais typé : sans en-tête exploitable, Fastify refuse la
      // requête avant même d'entrer dans la route.
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    const { sessions = 0 } = await res.json().catch(() => ({}))
    console.log(
      sessions ? `J'ai demandé au serveur de s'arrêter — ${sessions} session(s) de l'Atelier à couper.` : "J'ai demandé au serveur de s'arrêter.",
    )
    return true
  } catch {
    // Personne n'écoute, ou ce n'est pas un BFF d'AURA. Le filet s'en chargera.
    return false
  }
}

async function waitUntilFree(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!listeners(port).length) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

// ── Le filet ────────────────────────────────────────────────────────────────

/** Les PID qui écoutent sur ce port. */
function listeners(port) {
  const pids = run('netstat', ['-ano', '-p', 'tcp'])
    .split('\n')
    .filter((l) => /LISTENING/.test(l) && new RegExp(`[:.]${port}\\s`).test(l))
    .map((l) => Number(l.trim().split(/\s+/).pop()))
  return [...new Set(pids.filter((pid) => pid > 0))]
}

/** Tous les processus vivants : identifiant, parent, ligne de commande. */
function processTable() {
  const json = run('powershell', [
    '-NoProfile',
    '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress',
  ])
  const table = new Map()
  for (const p of parse(json)) {
    table.set(p.ProcessId, { parent: p.ParentProcessId, cmd: p.CommandLine ?? '' })
  }
  return table
}

/**
 * Marque le processus et ses ancêtres, tant qu'ils sont à nous.
 *
 * On s'arrête au premier ancêtre sans marqueur : c'est le terminal depuis lequel
 * le lancement a été fait, et il ne nous appartient pas.
 */
function climb(pid, table, doomed) {
  for (let cur = pid; cur > 0 && !doomed.has(cur);) {
    doomed.add(cur)
    const parent = table.get(cur)?.parent ?? 0
    const cmd = table.get(parent)?.cmd ?? ''
    if (!MARKERS.some((m) => m.test(cmd))) return
    cur = parent
  }
}

function kill(pid) {
  // `/T` : l'arbre entier. Un superviseur écarté sans ses fils les laisserait
  // derrière lui, et c'est un fils qui tient le port.
  run('taskkill', ['/PID', String(pid), '/T', '/F'])
}

// ── Outils ──────────────────────────────────────────────────────────────────

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    // `netstat` sort en erreur quand il ne trouve rien ; `taskkill`, quand le
    // processus est déjà parti — emporté par l'arbre d'un autre, le plus souvent.
    return ''
  }
}

/** `ConvertTo-Json` rend un objet seul quand la liste n'a qu'un élément. */
function parse(json) {
  try {
    const value = JSON.parse(json)
    return Array.isArray(value) ? value : [value]
  } catch {
    return []
  }
}
