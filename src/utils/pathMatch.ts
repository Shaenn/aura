// Classer les chemins d'un projet contre ce qui est tapé après `@`, et les
// rendre sous forme d'arbre dépliable.
//
// Le filtrage se fait ici, dans le navigateur, sur la liste entière reçue une
// fois : une frappe ne coûte donc aucune requête. Quelques milliers de chemins
// se parcourent en une poignée de millisecondes, soit moins que l'aller-retour
// qu'on éviterait mal.
//
// Trois choses décident de ce qu'on voit, et elles ne se confondent pas :
//   — **le rang** choisit quels chemins retenir, et lesquels montrer en premier ;
//   — **l'arbre** les donne à lire, un segment de dossier par ligne ;
//   — **le repli** décide de ce qui reste à l'écran.
//
// Rien n'est tronqué : ce qui borne la liste, c'est ce que le dépôt ignore déjà
// (`.gitignore`, côté serveur) et ce que l'utilisateur replie. Une liste coupée
// en silence se lit comme une liste complète, et fait chercher un fichier qu'on
// a soi-même caché.

/** Une ligne du menu : un dossier, ou un fichier. Les deux se choisissent. */
export interface TreeRow {
  kind: 'dir' | 'file'
  /** Le segment seul — `components`, `SessionComposer.vue` — jamais le chemin. */
  label: string
  /** Profondeur d'emboîtement, d'où vient le décrochage visuel. */
  depth: number
  /** Le chemin complet : celui qui s'insère, et l'identité d'un dossier replié. */
  path: string
  /** Dossier seulement : est-il fermé, et combien de fichiers cache-t-il ? */
  collapsed?: boolean
  count?: number
}

export interface TreeResults {
  rows: TreeRow[]
  /** Combien de fichiers correspondent, repliés ou non. */
  total: number
  /**
   * Le chemin le mieux classé, sur lequel la sélection se pose d'entrée.
   *
   * L'arbre s'affiche par ordre alphabétique — c'est ce qu'on attend d'une
   * arborescence, et c'est ce qui la rend prévisible — mais l'alphabet ne dit
   * rien de la pertinence. Sans ce repère, taper `composer` surlignerait le
   * premier fichier de la première branche, et Entrée insérerait autre chose que
   * ce qu'on cherchait.
   */
  best: string
}

interface Node {
  /** Sous-dossiers, dans l'ordre où le meilleur chemin les a fait naître. */
  dirs: Map<string, Node>
  files: string[]
}

const node = (): Node => ({ dirs: new Map(), files: [] })

/**
 * Les chemins qui correspondent, montés en arbre.
 *
 * Les rangs, du plus au moins probable :
 *   0. l'extension est exactement la saisie — `ts`, `cs`, `xaml`
 *   0. le nom du fichier commence par la saisie — `comp` → `SessionComposer.vue`
 *   1. le nom la contient — `composer` → `useSessionComposer.ts`
 *   2. le chemin entier la contient — `agent/` → `src/services/agent/index.ts`
 *   3. les lettres s'y trouvent dans l'ordre — `sgcontrol` → `SegmentedControl.vue`
 *
 * L'extension partage le premier rang avec le nom, et c'est voulu : taper `ts`
 * veut presque toujours dire « les fichiers TypeScript », pas « les fichiers qui
 * ont ces deux lettres quelque part ».
 *
 * L'arbre s'affiche dans l'ordre d'un explorateur : dossiers puis fichiers,
 * chacun par ordre alphabétique. La pertinence, elle, ne se perd pas — elle
 * ressort par `best`, où la sélection se pose.
 *
 * `collapsed` porte les chemins des dossiers fermés ; leurs descendants ne sont
 * pas émis, et la ligne du dossier annonce combien de fichiers elle retient.
 */
export function treeRows(files: string[], query: string, collapsed: ReadonlySet<string> = new Set()): TreeResults {
  const q = query.toLowerCase().replace(/^\./, '')
  const scored: { path: string; rank: number }[] = []

  for (const path of files) {
    const rank = q ? rankOf(path.toLowerCase(), q) : 0
    if (rank >= 0) scored.push({ path, rank })
  }

  scored.sort((a, b) => a.rank - b.rank || a.path.length - b.path.length)

  // Une fois qu'on sait ce que la saisie trouve de mieux, ce qui est deux crans
  // en dessous n'est plus une réponse, c'est du remplissage : `composer`
  // ramenait 54 chemins, dont 53 pour la seule raison que ces lettres se
  // suivent quelque part dans leur dossier. On garde le meilleur rang et le
  // suivant — de quoi couvrir « le fichier » et « son voisinage », pas le dépôt.
  const best = scored[0]?.rank ?? 0
  const kept = scored.filter((s) => s.rank <= best + 1)

  const root = node()
  for (const { path } of kept) {
    const segments = path.split('/')
    const name = segments.pop() as string
    let at = root
    for (const segment of segments) {
      let next = at.dirs.get(segment)
      if (!next) {
        next = node()
        at.dirs.set(segment, next)
      }
      at = next
    }
    at.files.push(name)
  }

  return {
    rows: flatten(root, '', 0, collapsed),
    total: kept.length,
    best: kept[0]?.path ?? '',
  }
}

/** L'ordre d'un explorateur : insensible à la casse, chiffres en ordre naturel. */
const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

/**
 * L'arbre en lignes : les dossiers d'abord, les fichiers ensuite, chacun par
 * ordre alphabétique.
 *
 * Un dossier qui n'en contient qu'un autre se fond avec lui — `src/components`
 * sur une ligne plutôt que deux décrochages pour rien. C'est ce que font les
 * explorateurs de code, et pour la même raison : l'emboîtement doit montrer une
 * ramification, pas un couloir.
 */
function flatten(at: Node, prefix: string, depth: number, collapsed: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []

  for (const [name, child] of [...at.dirs].sort((a, b) => byName(a[0], b[0]))) {
    // Fusion des dossiers à enfant unique, tant qu'il n'y a rien d'autre à voir.
    let label = name
    let folded = child
    while (folded.files.length === 0 && folded.dirs.size === 1) {
      const [only, deeper] = [...folded.dirs][0] as [string, Node]
      label += `/${only}`
      folded = deeper
    }
    const path = `${prefix}${label}`
    const shut = collapsed.has(path)
    rows.push({
      kind: 'dir',
      label,
      depth,
      path,
      ...(shut ? { collapsed: true, count: countFiles(folded) } : {}),
    })
    if (!shut) rows.push(...flatten(folded, `${path}/`, depth + 1, collapsed))
  }

  for (const name of [...at.files].sort(byName)) {
    rows.push({ kind: 'file', label: name, depth, path: `${prefix}${name}` })
  }
  return rows
}

/** Tous les fichiers d'un sous-arbre : ce qu'un dossier fermé retient. */
function countFiles(at: Node): number {
  let total = at.files.length
  for (const child of at.dirs.values()) total += countFiles(child)
  return total
}

/**
 * En deçà de cette longueur, une saisie ne cherche que dans le **nom** du
 * fichier — ni dans son chemin, ni en sous-séquence.
 *
 * Deux mesures ont dicté cette borne. `cs` en sous-séquence ramenait sept
 * chemins sur onze : un `c` suivi d'un `s` se trouve à peu près partout. Et `ts`
 * proposait des `.vue`, parce que leur dossier s'appelle `componen`**ts**. Dans
 * les deux cas on cherchait une extension et on récoltait du bruit.
 *
 * Un chemin explicite échappe à la règle quelle que soit sa longueur : taper
 * `ui/` désigne sans ambiguïté un dossier, pas un nom de fichier.
 */
const NARROW_MAX = 3

function rankOf(path: string, q: string): number {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  if (dot > 0 && name.slice(dot + 1) === q) return 0
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1

  if (q.length <= NARROW_MAX && !q.includes('/')) return -1
  if (path.includes(q)) return 2
  return subsequence(path, q) ? 3 : -1
}

/** Les lettres de `q` apparaissent-elles dans l'ordre, pas forcément côte à côte ? */
function subsequence(path: string, q: string): boolean {
  let at = 0
  for (const char of q) {
    at = path.indexOf(char, at) + 1
    if (at === 0) return false
  }
  return true
}
