// Les fichiers d'un projet, pour l'autocomplétion du `@` dans l'Atelier.
//
// **Le client ne fournit jamais de chemin.** Il donne un `runId` ; la racine est
// le `cwd` de cette session, décidé à son ouverture. C'est la seule garantie qui
// compte ici : cette API ne peut pas être détournée pour lister ailleurs, parce
// qu'il n'y a aucun paramètre par lequel demander ailleurs. Un fichier hors du
// projet se saisit à la main, sans aide — c'est le prix, et il est assumé.
//
// C'est aussi le seul endroit du BFF qui lit des noms hors de `~/.claude`. Des
// noms, et rien d'autre : aucun contenu ne traverse ce module, et les chemins
// que la garde de `server/projects.ts` refuserait de lire ne sont pas proposés
// non plus.

import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { HEAVY_DIRS, SECRET } from '../projects.ts'

const run = promisify(execFile)

/**
 * Les bornes du parcours. Un dépôt pathologique doit dégrader la liste, jamais
 * retenir la requête.
 */
const MAX_FILES = 20_000
const MAX_DIRS = 4_000
const MAX_DEPTH = 8

/**
 * Combien de temps une liste sert avant d'être refaite.
 *
 * Elle est demandée une fois par session, puis filtrée dans le navigateur : ce
 * cache ne sert donc qu'aux sessions multiples sur un même dossier, et à la
 * relecture après un `/clear`. Trente secondes suffisent à ne pas relancer
 * `git ls-files` pour rien, sans faire mentir la liste longtemps après qu'un
 * fichier a été créé.
 */
const CACHE_MS = 30_000

export interface ProjectFiles {
  /** Chemins relatifs à la racine, séparés par `/`, triés. */
  files: string[]
  /** La liste a-t-elle été coupée par une des bornes ? */
  truncated: boolean
}

const cache = new Map<string, { at: number; value: ProjectFiles }>()

/**
 * Les fichiers sous `root`, par le chemin le plus fiable disponible.
 *
 * Un dépôt git répond de lui-même, et bien mieux qu'un parcours : il connaît son
 * `.gitignore`, donc il exclut `node_modules` et les artefacts de compilation
 * sans qu'on ait à deviner lesquels. Le parcours ne sert qu'aux dossiers qui ne
 * sont pas des dépôts, avec la liste d'exclusions que `projects.ts` employait
 * déjà pour chercher les CLAUDE.md.
 */
export async function listProjectFiles(root: string): Promise<ProjectFiles> {
  const hit = cache.get(root)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value

  const value = (await fromGit(root)) ?? (await fromWalk(root))
  // Les entrées périmées ne servent plus à rien : les garder ferait grandir la
  // carte au rythme des dossiers visités, pour la durée du serveur.
  if (cache.size > 16) {
    for (const [key, entry] of cache) if (Date.now() - entry.at >= CACHE_MS) cache.delete(key)
  }
  cache.set(root, { at: Date.now(), value })
  return value
}

/** `null` quand ce n'est pas un dépôt — l'appelant retombe sur le parcours. */
async function fromGit(root: string): Promise<ProjectFiles | null> {
  try {
    const { stdout } = await run(
      'git',
      [
        // `core.quotepath=off` : sans lui, git échappe les accents en octal et
        // rend `"src/donn\303\251es.ts"`, guillemets compris.
        '-c',
        'core.quotepath=off',
        '-C',
        root,
        'ls-files',
        // Suivis *et* non suivis, en respectant `.gitignore` : un fichier créé
        // il y a deux minutes doit pouvoir être mentionné.
        '--cached',
        '--others',
        '--exclude-standard',
      ],
      { maxBuffer: 32 * 1024 * 1024, windowsHide: true },
    )
    const all = stdout.split('\n').filter(Boolean)
    return bound(all.filter(keepable))
  } catch {
    // Pas un dépôt, git absent, ou dossier illisible : le parcours tranchera.
    return null
  }
}

async function fromWalk(root: string): Promise<ProjectFiles> {
  const files: string[] = []
  let dirs = 0
  let truncated = false
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }]

  while (stack.length) {
    const { dir, depth } = stack.pop() as { dir: string; depth: number }
    if (++dirs > MAX_DIRS) {
      truncated = true
      break
    }
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth >= MAX_DEPTH || HEAVY_DIRS.has(entry.name.toLowerCase())) continue
        stack.push({ dir: abs, depth: depth + 1 })
        continue
      }
      if (!entry.isFile()) continue
      const rel = relative(root, abs).split(sep).join('/')
      if (!keepable(rel)) continue
      if (files.length >= MAX_FILES) {
        truncated = true
        break
      }
      files.push(rel)
    }
  }
  return { files: files.sort(), truncated }
}

/** Un chemin que le BFF refuserait de lire ne se propose pas non plus. */
function keepable(rel: string): boolean {
  return !SECRET.test(rel.split('/').pop() ?? '')
}

function bound(files: string[]): ProjectFiles {
  const truncated = files.length > MAX_FILES
  return { files: (truncated ? files.slice(0, MAX_FILES) : files).sort(), truncated }
}
