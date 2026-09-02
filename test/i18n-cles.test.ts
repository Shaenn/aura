// Les clés citées par le code existent-elles dans le catalogue ?
//
// Ce que le typecheck couvre déjà, et qu'on ne refait donc pas ici : la parité
// français / anglais. `MessageSchema` est dérivé du français, chaque tranche
// anglaise s'annote de sa part, et les deux `index.ts` de l'assemblage — une
// clé ou une tranche présente d'un seul côté casse `vue-tsc`.
//
// Ce qu'il ne couvre pas, et qui est la raison d'être de ce fichier : une clé
// citée dans un `t()` mais absente du catalogue. `vue-i18n` type sa clé en
// `Key | (string & {})` — l'union garde l'autocomplétion mais accepte n'importe
// quelle chaîne, si bien qu'une faute de frappe ne se voit qu'à l'écran, sous
// la forme de la clé rendue telle quelle.
//
// Les clés construites (`t(`pages.atelier.status.${status}`)`) ne peuvent pas
// être vérifiées entièrement — leur fin dépend de l'exécution. On vérifie leur
// racine : `pages.atelier.status` doit exister et porter des sous-clés. Un
// renommage de branche est ainsi vu, même là.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import fr from '../src/i18n/fr'

const RACINE = fileURLToPath(new URL('..', import.meta.url))
const SRC = path.join(RACINE, 'src')
const CATALOGUE = path.join(SRC, 'i18n')

/** Les chemins qui mènent à un texte, et ceux qui mènent à une branche. */
function chemins(noeud: unknown, prefixe = '', feuilles = new Set<string>(), branches = new Set<string>()) {
  for (const [cle, valeur] of Object.entries(noeud as Record<string, unknown>)) {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle
    if (valeur !== null && typeof valeur === 'object') {
      branches.add(chemin)
      chemins(valeur, chemin, feuilles, branches)
    } else {
      feuilles.add(chemin)
    }
  }
  return { feuilles, branches }
}

const { feuilles, branches } = chemins(fr)

/** Les fichiers du code applicatif — le catalogue lui-même est hors sujet. */
function sources(dossier = SRC, acc: string[] = []) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name)
    if (complet.startsWith(CATALOGUE)) continue
    if (entree.isDirectory()) sources(complet, acc)
    else if (/\.(vue|ts)$/.test(entree.name)) acc.push(complet)
  }
  return acc
}

/**
 * Un appel de traduction dont la clé est écrite en toutes lettres.
 *
 * `\bt\(` suffit à écarter les fonctions dont le nom finit par un `t` —
 * `emit(`, `expect(`, `assert(` : la lettre y est précédée d'un caractère de
 * mot, donc sans frontière. Le `$` de `$t(` en est une, lui.
 */
const LITTERALE = /(?<![\w$])\$?te?\(\s*(['"])([^'"]+)\1/g

/** Un appel dont la clé est construite : on n'en retient que la racine fixe. */
const CONSTRUITE = /(?<![\w$])\$?te?\(\s*`([^`$]+)\$\{/g

type Citation = { fichier: string; ligne: number; cle: string }

function citations(motif: RegExp): Citation[] {
  const trouvees: Citation[] = []
  for (const fichier of sources()) {
    const lignes = fs.readFileSync(fichier, 'utf8').split('\n')
    lignes.forEach((ligne, i) => {
      for (const m of ligne.matchAll(motif)) {
        const cle = (m[2] ?? m[1] ?? '').replace(/\.$/, '')
        if (cle) trouvees.push({ fichier: path.relative(RACINE, fichier), ligne: i + 1, cle })
      }
    })
  }
  return trouvees
}

function decrit(c: Citation) {
  return `${c.fichier}:${c.ligne} → ${c.cle}`
}

describe('clés de traduction', () => {
  it('le catalogue français est bien peuplé', () => {
    // Un garde-fou sur le garde-fou : si l'extraction du catalogue cassait, les
    // deux tests suivants passeraient en ne comparant rien à rien.
    expect(feuilles.size).toBeGreaterThan(500)
  })

  it('chaque clé écrite en toutes lettres existe dans le catalogue', () => {
    const inconnues = citations(LITTERALE).filter((c) => !feuilles.has(c.cle) && !branches.has(c.cle))
    expect(inconnues.map(decrit)).toEqual([])
  })

  it('chaque clé construite a une racine qui existe', () => {
    const orphelines = citations(CONSTRUITE).filter((c) => !branches.has(c.cle))
    expect(orphelines.map(decrit)).toEqual([])
  })
})
