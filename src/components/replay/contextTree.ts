// D'une liste de fichiers à un arbre de dossiers.
//
// La catégorie mémoire porte des chemins — `rules/back/domain.md`,
// `rules/back/application/contracts.md`, `front/CLAUDE.md`. À plat, quinze règles
// réparties dans des sous-dossiers se lisent mal. Le label encode déjà la
// hiérarchie ; il suffit de le refendre sur les `/` pour la reconstruire.
//
// Générique sur le type de ligne, et sans dépendance : il ne lit que `label` et
// `tokens`, et reporte la ligne entière sur ses feuilles. C'est ce qui le rend
// testable sans monter le moindre composant.

/** Le strict nécessaire pour ranger une ligne dans l'arbre. */
export interface TreeLeaf {
  label: string;
  tokens: number;
}

export interface TreeNode<T extends TreeLeaf = TreeLeaf> {
  /** Le segment de chemin : un nom de dossier, ou de fichier sur une feuille. */
  name: string;
  /** Le chemin cumulé depuis la racine — clé stable pour le rendu. */
  key: string;
  /** Somme des tokens de la feuille ou de tout le sous-arbre. */
  tokens: number;
  /** La ligne, sur une feuille seulement ; absente sur un dossier. */
  row?: T;
  children: TreeNode<T>[];
}

interface Building<T extends TreeLeaf> {
  name: string;
  key: string;
  tokens: number;
  row?: T;
  children: Map<string, Building<T>>;
}

function child<T extends TreeLeaf>(parent: Building<T>, name: string): Building<T> {
  const found = parent.children.get(name);
  if (found) return found;
  const node: Building<T> = {
    name,
    key: parent.key ? `${parent.key}/${name}` : name,
    tokens: 0,
    children: new Map(),
  };
  parent.children.set(name, node);
  return node;
}

function freeze<T extends TreeLeaf>(node: Building<T>): TreeNode<T> {
  const children = [...node.children.values()]
    .map(freeze)
    // Le plus lourd d'abord, comme partout ailleurs dans le panneau : la règle ou
    // le dossier qui pèse le plus remonte.
    .sort((a, b) => b.tokens - a.tokens);
  return {
    name: node.name,
    key: node.key,
    tokens: node.tokens,
    ...(node.row ? { row: node.row } : {}),
    children,
  };
}

/**
 * Ranger des lignes en arbre, d'après leur label découpé sur les `/`.
 *
 * Chaque segment intermédiaire est un dossier, dont les tokens sont la somme de
 * ses descendants ; le dernier segment porte la ligne elle-même. Une ligne sans
 * `/` reste une feuille à la racine.
 */
export function buildTree<T extends TreeLeaf>(rows: T[]): TreeNode<T>[] {
  const root: Building<T> = { name: '', key: '', tokens: 0, children: new Map() };
  for (const row of rows) {
    const parts = row.label.split('/').filter(Boolean);
    let node = root;
    for (const part of parts) {
      node = child(node, part);
      node.tokens += row.tokens;
    }
    node.row = row;
  }
  return freeze(root).children;
}

/** Un arbre vaut la peine d'être dessiné dès qu'il a au moins un dossier. */
export function hasFolders<T extends TreeLeaf>(nodes: TreeNode<T>[]): boolean {
  return nodes.some((n) => n.children.length > 0);
}
