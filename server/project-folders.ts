// Les dossiers d'un projet que vous avez demandé à voir.
//
// Un dépôt met souvent sa matière la plus utile hors de `.claude` : un `docs/`,
// un `specs/`, un dossier de comptes rendus que l'IA a remplis. L'inventaire ne
// les montrait pas, faute de règle pour deviner lesquels comptent.
//
// La règle est la vôtre, et elle ne peut pas être devinée : un dossier plein de
// Markdown peut être de la documentation à lire comme un gabarit que le
// programme consomme, et rien sur le disque ne les distingue. `folderCandidates`
// mesure donc, il ne tranche pas — il alimente un sélecteur, et vous tranchez.
//
// **La liste vit dans les préférences d'AURA** (`.local/preferences.json`, la
// seule écriture du front), et le serveur la relit sur le disque à chaque
// requête : une lecture est toujours confrontée au fichier, jamais au corps de
// la requête qui la demande.
//
// Ce que cela protège, et ce que cela ne protège pas. Le fichier est écrit par
// le front lui-même (`PUT /api/preferences`), qui en détient la forme : un
// appelant qui parle au BFF peut donc déclarer un dossier puis le lire. Ce n'est
// pas un bac à sable au sens où l'on se défendrait de lui — c'est une garde
// contre l'accident et contre la dérive : les trois verrous qui suivent
// (`normalizeFolderRel`, `DOC_FILE`, la vérification de préfixe sur le chemin
// canonique) tiennent quoi qu'il arrive, et ils bornent la lecture aux documents
// situés sous la racine du projet. Un chemin arbitraire du disque, lui, reste
// hors d'atteinte.

import { readdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { FolderCandidate, IncludedFolder, ResourceNode } from '../shared/projects.ts'
import { canonicalPath } from './claude/paths.ts'

/**
 * Ce qu'un dossier inclus donne à lire. Des documents, et rien d'autre.
 *
 * La fonctionnalité existe pour de la documentation ; élargir aux sources ferait
 * de l'arbre un explorateur de fichiers, où les documents se perdraient.
 */
export const DOC_FILE = /\.(md|markdown|txt|rst)$/i

// Mêmes bornes que le parcours des CLAUDE.md : un dossier inclus peut se révéler
// être une arborescence entière, et une requête ne doit jamais y disparaître.
const MAX_DEPTH = 6
const MAX_DIRS = 2000
// Le sélecteur ne propose pas l'arbre entier : au-delà de trois niveaux, on ne
// range plus de la documentation, on explore du code.
const CANDIDATE_MAX_DEPTH = 3
const CANDIDATE_MAX = 200

/**
 * Un chemin de dossier tel qu'on l'accepte, ou `null`.
 *
 * Relatif, POSIX, sans segment vide, sans `.` ni `..`, sans racine et sans
 * lettre de lecteur. C'est le premier des deux verrous ; le second est la
 * vérification de préfixe, faite sur le chemin résolu.
 */
export function normalizeFolderRel(rel: string): string | null {
  const posix = String(rel ?? '')
    .replace(/\\/g, '/')
    .trim()
  if (!posix || posix.startsWith('/') || /^[a-z]:/i.test(posix)) return null
  const parts = posix.split('/').filter((p) => p !== '')
  if (!parts.length) return null
  if (parts.some((p) => p === '.' || p === '..')) return null
  // `.claude` est déjà inventorié par ailleurs, et l'y inclure ferait deux
  // arbres pour les mêmes fichiers.
  if (parts[0] === '.claude') return null
  return parts.join('/')
}

/**
 * Le chemin absolu d'un `rel` déjà normalisé, s'il reste sous la racine.
 *
 * `~/.claude.json` range les chemins en barres obliques, et `join` rend des
 * barres inverses : sans normaliser la racine d'abord, la comparaison oppose
 * `C:\…\projet\docs` à `C:/…/projet\`, et tout dossier légitime est refusé.
 *
 * La comparaison porte sur la forme canonique des deux côtés : un lien déposé
 * dans un dossier inclus rendrait sinon lisible n'importe quel point du disque,
 * et la casse de Windows suffirait à rendre le préfixe faux.
 */
function resolveInside(root: string, rel: string): string | null {
  const base = canonicalPath(root).replace(new RegExp(`\\${sep}+$`), '')
  const abs = canonicalPath(join(base, rel.split('/').join(sep)))
  return abs.toLowerCase().startsWith((base + sep).toLowerCase()) ? abs : null
}

/**
 * Les dossiers inclus tels que les préférences les déclarent, assainis.
 *
 * Le fichier de préférences est écrit par le front et peut être édité à la main :
 * chaque entrée repasse par la normalisation, et ce qui ne la franchit pas est
 * ignoré en silence.
 */
export function sanitizeFolders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const rel = normalizeFolderRel(entry)
    if (rel) out.add(rel)
  }
  return [...out].sort((a, b) => a.localeCompare(b))
}

/**
 * Le chemin absolu d'un document lisible, ou `null`.
 *
 * Trois conditions, toutes nécessaires : c'est un document, il est sous l'un des
 * dossiers que la liste déclare, et il reste sous la racine. La deuxième est
 * celle qui compte — c'est elle qui fait qu'un chemin venu du client ne peut
 * atteindre que ce que vous avez ouvert.
 */
export function resolveIncludedFile(root: string, rel: string, folders: string[]): string | null {
  const clean = normalizeFolderRel(rel)
  if (!clean || !DOC_FILE.test(clean)) return null
  if (!folders.some((f) => clean.startsWith(`${f}/`))) return null
  return resolveInside(root, clean)
}

/** Les documents d'un dossier inclus, en profondeur et sous bornes. */
async function walkFolder(root: string, folder: string): Promise<ResourceNode[]> {
  const start = resolveInside(root, folder)
  if (!start) return []
  const out: ResourceNode[] = []
  const stack: { dir: string; rel: string; depth: number }[] = [{ dir: start, rel: folder, depth: 0 }]
  let visited = 0
  while (stack.length && visited < MAX_DIRS) {
    const { dir, rel, depth } = stack.pop() as { dir: string; rel: string; depth: number }
    visited++
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const childRel = `${rel}/${e.name}`
      if (e.isDirectory()) {
        if (depth + 1 > MAX_DEPTH) continue
        stack.push({ dir: join(dir, e.name), rel: childRel, depth: depth + 1 })
        continue
      }
      if (!DOC_FILE.test(e.name)) continue
      let size = 0
      let mtime = 0
      try {
        const s = await stat(join(dir, e.name))
        size = s.size
        mtime = s.mtimeMs
      } catch {
        /* skip stat */
      }
      out.push({
        category: 'included',
        rel: childRel,
        name: e.name,
        title: e.name,
        description: '',
        size,
        mtime,
      })
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

/**
 * L'inventaire des dossiers inclus, un groupe par dossier.
 *
 * Un dossier disparu du disque rend un groupe vide plutôt que rien : sans cela
 * il s'effacerait de l'écran sans qu'on puisse le retirer de la liste.
 */
export async function listIncludedFolders(root: string, folders: string[]): Promise<IncludedFolder[]> {
  if (!root || !folders.length) return []
  return Promise.all(folders.map(async (rel) => ({ rel, files: await walkFolder(root, rel) })))
}

/**
 * Les dossiers qu'on peut proposer d'inclure : ceux qui portent des documents.
 *
 * Le compte est celui du sous-arbre, pas du seul niveau — `docs` annonce ce
 * qu'il contient en tout, sinon un dossier qui ne fait que ranger des
 * sous-dossiers paraîtrait vide. `heavy` reçoit la liste des dossiers qu'on ne
 * traverse jamais (`node_modules`, `.git`…), que `projects.ts` tient déjà.
 */
export async function folderCandidates(root: string, heavy: Set<string>, included: string[]): Promise<FolderCandidate[]> {
  if (!root) return []
  const docs = new Map<string, number>()
  const stack: { dir: string; rel: string; depth: number }[] = [{ dir: root, rel: '', depth: 0 }]
  let visited = 0
  while (stack.length && visited < MAX_DIRS) {
    const { dir, rel, depth } = stack.pop() as { dir: string; rel: string; depth: number }
    visited++
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (depth + 1 > MAX_DEPTH) continue
        if (heavy.has(e.name.toLowerCase())) continue
        stack.push({
          dir: join(dir, e.name),
          rel: rel ? `${rel}/${e.name}` : e.name,
          depth: depth + 1,
        })
        continue
      }
      // Un document de la racine n'appartient à aucun dossier proposable.
      if (!rel || !DOC_FILE.test(e.name)) continue
      // Le document compte pour son dossier et pour chacun de ses parents.
      const parts = rel.split('/')
      for (let i = 1; i <= parts.length; i++) {
        const key = parts.slice(0, i).join('/')
        docs.set(key, (docs.get(key) ?? 0) + 1)
      }
    }
  }

  return [...docs.entries()]
    .filter(([rel]) => rel.split('/').length <= CANDIDATE_MAX_DEPTH)
    .map(([rel, count]) => ({ rel, docs: count, included: included.includes(rel) }))
    .sort((a, b) => b.docs - a.docs || a.rel.localeCompare(b.rel))
    .slice(0, CANDIDATE_MAX)
}
