// Lance le projet entier : tous les services que déclare `services.json`, dans une seule fenêtre.
//
// Gabarit commun du parc, distribué par VIGIE. Ne pas le modifier ici : une copie retouchée
// diverge des autres sans que personne le voie, et VIGIE la signalera. Ce qui est propre au
// projet vit dans `services.json`.
//
// Usage :
//   node lancement/lancer.mjs dev       le développement, avec rechargement
//   node lancement/lancer.mjs preview   l'application telle qu'en production : build, puis serveurs
//   node lancement/lancer.mjs <mode>    une variante que le projet déclare dans `services.json`
//
// Ce que ce fichier fait, et que `concurrently` faisait à moitié :
//
//  - il commence par `arreter.mjs`, pour ne pas tomber sur un port tenu par la session d'avant ;
//  - il lance chaque service dans SON dossier : un back n'a plus à être lancé par le manifeste du
//    front, à coups de `--project ../back/…` ;
//  - il préfixe chaque ligne du nom du service ;
//  - si un service s'arrête, il arrête les autres : une application à moitié debout ressemble à
//    une application qui marche, jusqu'au premier appel qui échoue ;
//  - à l'arrêt — Ctrl+C, fermeture de la fenêtre, fin d'un service — il laisse d'abord aux
//    services le temps de partir proprement, puis coupe chaque ARBRE de processus, et pas
//    seulement le shell qui le porte. C'est ce qui laissait `dotnet watch` vivant derrière une
//    fenêtre fermée ;
//  - il note ses processus dans `.local/lancement.json`, pour que `stop.bat`, lancé depuis une
//    autre fenêtre, sache quoi couper.
//
// Aucune dépendance : il tourne avant même le premier `pnpm install`, et peut le réclamer.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { arreter, couperArbre, demanderExtinction, FICHIER_PID, planDe, RACINE } from './arreter.mjs'

const COULEURS = [34, 35, 32, 33, 36, 31]
const COLORE = process.stdout.isTTY && !process.env.NO_COLOR
/** STATUS_CONTROL_C_EXIT : le code d'un processus Windows interrompu par Ctrl+C. */
const CTRL_C_WINDOWS = 0xc000013a
/** Le temps laissé aux services pour partir d'eux-mêmes, avant de les couper. */
const GRACE_MS = 5000

const mode = process.argv[2] ?? 'dev'
const declaration = lireDeclaration()
const ports = lirePorts()
const plan = planDe(declaration, mode)

if (!plan) {
  console.error(`Mode inconnu : « ${mode} ». Ceux que déclare lancement/services.json : ${Object.keys(declaration).join(', ')}.`)
  process.exit(1)
}
if (!Object.keys(plan.services).length) {
  console.error(`lancement/services.json ne déclare aucun service pour « ${mode} ».`)
  process.exit(1)
}

const etapes = plan.avant
const services = Object.entries(plan.services).map(([nom, s]) => ({ nom, ...s }))
if (plan.libelle) {
  console.log(`\n${plan.libelle}`)
}

verifierInstallations([...etapes, ...services])
arreter()

for (const etape of etapes) {
  console.log(`\n> ${etape.commande}${etape.dossier ? `   (${etape.dossier})` : ''}\n`)
  const r = spawnSync(etape.commande, { cwd: dossierDe(etape), shell: true, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`\n« ${etape.commande} » a échoué : rien n'est lancé.`)
    process.exit(r.status ?? 1)
  }
}

demarrer(services)

// ── Lecture ──────────────────────────────────────────────────────────────────

function lireDeclaration() {
  const chemin = join(RACINE, 'lancement', 'services.json')
  try {
    return JSON.parse(readFileSync(chemin, 'utf8'))
  } catch (e) {
    console.error(`lancement/services.json illisible : ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

function lirePorts() {
  try {
    return JSON.parse(readFileSync(join(RACINE, 'ports.json'), 'utf8'))
  } catch {
    return {}
  }
}

function dossierDe(x) {
  return join(RACINE, ...(x.dossier ?? '').split('/').filter(Boolean))
}

/**
 * Un dossier npm sans `node_modules` ne démarrera pas, et l'erreur de pnpm ne le dit pas en
 * premier. Le dire ici, avant de lancer quoi que ce soit, c'est tout l'accueil qu'il faut à
 * quelqu'un qui vient de cloner le dépôt.
 */
function verifierInstallations(liste) {
  const dossiers = new Set(liste.filter((x) => /\bpnpm\b/.test(x.commande)).map((x) => dossierDe(x)))
  const manquants = [...dossiers].filter((d) => existsSync(join(d, 'package.json')) && !existsSync(join(d, 'node_modules')))
  if (!manquants.length) {
    return
  }
  for (const d of manquants) {
    console.error(`Dépendances absentes dans ${d} : lancez « pnpm install » dans ce dossier.`)
  }
  process.exit(1)
}

// ── Les services ─────────────────────────────────────────────────────────────

function demarrer(liste) {
  const largeur = Math.max(...liste.map((s) => s.nom.length))
  const enCours = new Map()
  let arret = null

  console.log('')
  liste.forEach((s, i) => {
    const port = Number.isInteger(ports[s.nom]) ? `:${ports[s.nom]}` : ''
    console.log(`${prefixe(s.nom, i, largeur)} ${port.padEnd(6)} ${s.commande}${s.dossier ? `   (${s.dossier})` : ''}`)
  })
  console.log('')

  liste.forEach((s, i) => {
    const enfant = spawn(s.commande, {
      cwd: dossierDe(s),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Un groupe à lui hors Windows : c'est ce qui permet de le couper en entier. Sous Windows,
      // `detached` ouvrirait une console de plus.
      detached: process.platform !== 'win32',
      // La sortie passe par un tuyau : sans cela, Vite et dotnet la croiraient lue par une machine
      // et retireraient leurs couleurs.
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? (COLORE ? '1' : '0') },
    })
    enCours.set(s.nom, enfant)

    const tete = prefixe(s.nom, i, largeur)
    for (const flux of [enfant.stdout, enfant.stderr]) {
      createInterface({ input: flux }).on('line', (ligne) => console.log(`${tete} ${ligne}`))
    }

    enfant.on('exit', (code, signal) => {
      enCours.delete(s.nom)
      if (!arret) {
        if (!estANous()) {
          // `stop.bat` retire le fichier de notes avant de couper : l'arrêt vient d'ailleurs, et
          // c'est lui qui s'en occupe.
          arret = 'demande'
        } else if (code === CTRL_C_WINDOWS) {
          // Ctrl+C atteint tous les processus de la console, parfois avant le lanceur lui-même :
          // c'est un arrêt demandé, qui se traite comme tel.
          arret = 'demande'
          arreterProprement(GRACE_MS)
        } else {
          console.log(`\n${tete} s'est arrêté (${signal ?? `code ${code}`}) : arrêt des autres services.\n`)
          arret = code ? code : 1
          arreterProprement(GRACE_MS)
        }
      }
      if (!enCours.size) {
        terminer(arret === 'demande' ? 0 : arret)
      }
    })
  })

  noter(enCours)

  function toutCouper() {
    for (const enfant of enCours.values()) {
      if (enfant.pid) {
        couperArbre(enfant.pid)
      }
    }
  }

  /**
   * L'arrêt en deux temps : demander, puis forcer.
   *
   * Un service qui a du ménage à faire en partant — fermer ses sessions, ses fichiers — ne le fait
   * que si on lui en laisse le temps. Ctrl+C l'a déjà prévenu, puisqu'il atteint toute la console ;
   * un service qui déclare une extinction (`"arret"` dans `services.json`) est prévenu par elle.
   * Ce qui tourne encore au bout du délai est coupé de force, arbre compris.
   */
  function arreterProprement(delaiMs) {
    demanderExtinction()
    if (!enCours.size) {
      return
    }
    if (delaiMs) {
      setTimeout(toutCouper, delaiMs)
    } else {
      toutCouper()
    }
  }

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      if (arret) {
        return
      }
      arret = 'demande'
      console.log('\nArrêt des services…')
      // La fenêtre qu'on ferme (SIGHUP sous Windows) ne laisse à Node que quelques secondes avant de
      // le tuer : pas de délai de grâce, on coupe sitôt l'extinction demandée.
      arreterProprement(signal === 'SIGHUP' ? 0 : GRACE_MS)
      if (!enCours.size) {
        terminer(0)
      }
    })
  }
}

function noter(enCours) {
  mkdirSync(dirname(FICHIER_PID), { recursive: true })
  const services = Object.fromEntries([...enCours].map(([nom, enfant]) => [nom, enfant.pid]))
  writeFileSync(FICHIER_PID, `${JSON.stringify({ demarreLe: Date.now(), lanceur: process.pid, mode, services }, null, 2)}\n`)
}

/** Le fichier de notes est-il encore celui de ce lanceur. */
function estANous() {
  try {
    return JSON.parse(readFileSync(FICHIER_PID, 'utf8')).lanceur === process.pid
  } catch {
    return false
  }
}

function terminer(code) {
  // Le fichier n'est retiré que s'il est encore le nôtre : un lanceur relancé entre-temps a pu
  // écrire le sien, et l'effacer laisserait `stop.bat` sans rien à couper.
  if (estANous()) {
    rmSync(FICHIER_PID, { force: true })
  }
  process.exit(code)
}

function prefixe(nom, i, largeur) {
  const texte = `[${nom}]`.padEnd(largeur + 2)
  return COLORE ? `\x1b[${COULEURS[i % COULEURS.length]}m${texte}\x1b[0m` : texte
}
