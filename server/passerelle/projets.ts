// Désigner un projet, et ce qu'il porte, depuis une conversation.
//
// Deux problèmes que le fil de la messagerie pose et que l'écran n'a pas : on ne
// clique pas, et on ne recopie pas un chemin Windows au pouce. D'où des listes
// **numérotées** — le message qui suit désigne par son rang.
//
// Comme `routage.ts`, ce module ne touche ni au disque ni au réseau : il ne fait
// que choisir dans ce qu'on lui donne. C'est ce qui rend la garde de `/atelier`
// vérifiable par un test.

import type { ProjectResources, ProjectSummary, ResourceNode } from '../../shared/projects.ts';

/**
 * Un fichier consultable, tel que la conversation le désigne.
 *
 * `source` n'est pas cosmétique : elle décide **quel lecteur** du serveur ouvre
 * le fichier, et il y en a trois — trois bacs à sable distincts, pour des `rel`
 * qui se ressemblent à s'y méprendre :
 *
 *   `claude` → `readProjectResource`     borné au `.claude` du projet ;
 *   `arbre`  → `readProjectMemory`       borné aux familles que `sourceFileKind`
 *                                        nomme — un `CLAUDE.md`, un `README` ;
 *   `inclus` → `readProjectIncludedFile` borné à la liste d'inclusion, relue sur
 *                                        le disque à chaque appel.
 *
 * Les confondre ne fait pas « lire ailleurs » — chaque lecteur refuse ce qui
 * n'est pas à lui —, cela fait refuser un fichier parfaitement légitime. C'est
 * exactement ce qui est arrivé à un document de dossier inclus passé au lecteur
 * de l'arbre : `sourceFileKind` ne le nomme pas, donc accès refusé.
 */
export interface Entree {
  /** Le chemin que le lecteur attend, tel quel. */
  rel: string;
  /** Ce que la conversation affiche. */
  label: string;
  source: 'claude' | 'arbre' | 'inclus';
}

/**
 * Un nœud de l'arborescence : un dossier, ou un fichier.
 *
 * Quatre-vingt-sept fichiers d'affilée ne se lisent pas. Les ranger par
 * catégorie aurait été une réponse — mais une réponse inventée, alors que les
 * chemins en portent déjà une : `agents/`, `rules/back/application/`,
 * `skills/pipeline-duplication/references/`. Les « catégories » de la page
 * Projet **sont** les dossiers de `.claude`. Suivre l'arbre, c'est donc montrer
 * le projet tel qu'il est rangé, plutôt qu'un classement parallèle à retenir.
 */
export interface Noeud {
  /** Le segment affiché — un nom de dossier, ou un nom de fichier. */
  nom: string;
  /** Le fichier, pour une feuille. Absent sur un dossier. */
  fichier?: { entree: Entree; rang: number };
  /** Le contenu, pour un dossier. Vide sur une feuille. */
  enfants: Noeud[];
}

/**
 * La forme comparable d'un chemin.
 *
 * Windows mélange les deux séparateurs et ignore la casse ; un chemin recopié
 * d'un écran ne correspondrait sinon jamais à celui que le disque déclare.
 */
function comparable(chemin: string): string {
  return chemin
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Le projet qu'une référence désigne, ou `undefined`.
 *
 * Trois écritures acceptées, du plus commode au plus explicite : le **rang** dans
 * la dernière liste, le **chemin** complet, le **nom** ou le slug.
 *
 * C'est aussi la garde de `/atelier` : une référence qui ne tombe sur aucun
 * projet connu ne rend rien, donc aucune session ne s'ouvre. Un chemin
 * quelconque de la machine n'est pas « refusé » par une règle — il n'est
 * simplement jamais trouvé, ce qui ne laisse aucune règle à contourner.
 */
export function resoudreProjet(projets: ProjectSummary[], ref: string): ProjectSummary | undefined {
  const brut = ref.trim();
  if (!brut) return undefined;

  if (/^\d+$/.test(brut)) {
    // Les listes sont numérotées à partir de 1 : c'est ce qu'on lit à l'écran.
    return projets[Number(brut) - 1];
  }

  const cible = comparable(brut);
  return (
    projets.find((p) => comparable(p.path) === cible) ??
    projets.find((p) => p.name.toLowerCase() === cible) ??
    projets.find((p) => p.slug.toLowerCase() === cible)
  );
}

function noeuds(liste: ResourceNode[], source: Entree['source'], prefixe = ''): Entree[] {
  return liste.map((n) => ({ rel: n.rel, label: `${prefixe}${n.rel}`, source }));
}

/**
 * L'arborescence des entrées, telle qu'on la parcourt.
 *
 * Le rang est celui de la liste plate, et il est conservé : c'est lui que
 * `/voir <n>` attend, et il ne doit pas changer selon qu'on est arrivé par la
 * navigation ou par la commande.
 *
 * Les dossiers d'abord, les fichiers ensuite, chacun par ordre alphabétique —
 * c'est l'ordre d'un explorateur, et celui de l'arborescence de l'Atelier.
 */
export function arborescence(entrees: Entree[]): Noeud {
  const racine: Noeud = { nom: '', enfants: [] };

  entrees.forEach((entree, i) => {
    const segments = entree.label.split('/').filter(Boolean);
    const nomFichier = segments.pop() ?? entree.label;

    let courant = racine;
    for (const segment of segments) {
      // Un dossier ne se crée qu'une fois : deux fichiers du même dossier
      // doivent atterrir dans le même nœud, pas dans deux homonymes.
      let enfant = courant.enfants.find((n) => !n.fichier && n.nom === segment);
      if (!enfant) {
        enfant = { nom: segment, enfants: [] };
        courant.enfants.push(enfant);
      }
      courant = enfant;
    }
    courant.enfants.push({ nom: nomFichier, fichier: { entree, rang: i + 1 }, enfants: [] });
  });

  compacte(racine);
  trie(racine);
  return racine;
}

/**
 * Fond les dossiers qui n'ont qu'un dossier pour enfant.
 *
 * `rules/back/application/` compterait sinon trois clics pour n'offrir aucun
 * choix — trois écrans dont deux ne posent aucune question. Un explorateur de
 * code fait de même, et pour la même raison.
 */
function compacte(noeud: Noeud): void {
  for (const enfant of noeud.enfants) compacte(enfant);

  const seul = noeud.enfants[0];
  // Jamais la racine : elle n'a pas de nom à porter, et son unique enfant doit
  // rester une ligne qu'on choisit.
  if (noeud.nom && noeud.enfants.length === 1 && seul && !seul.fichier) {
    noeud.nom = `${noeud.nom}/${seul.nom}`;
    noeud.enfants = seul.enfants;
  }
}

/** Dossiers avant fichiers, puis alphabétique — l'ordre d'un explorateur. */
function trie(noeud: Noeud): void {
  noeud.enfants.sort(
    (a, b) =>
      Number(Boolean(a.fichier)) - Number(Boolean(b.fichier)) ||
      a.nom.localeCompare(b.nom, 'fr', { numeric: true }),
  );
  for (const enfant of noeud.enfants) trie(enfant);
}

/** Combien de fichiers sous ce nœud, à toute profondeur. */
export function compte(noeud: Noeud): number {
  if (noeud.fichier) return 1;
  return noeud.enfants.reduce((total, enfant) => total + compte(enfant), 0);
}

/**
 * Le nœud au bout d'un chemin de segments, ou `undefined`.
 *
 * Les segments sont ceux que la navigation a empilés, donc des noms déjà
 * compactés (`rules/back/application`) : on compare au nom du nœud, jamais à un
 * chemin qu'on recomposerait.
 */
export function descendre(racine: Noeud, chemin: string[]): Noeud | undefined {
  let courant: Noeud | undefined = racine;
  for (const segment of chemin) {
    courant = courant.enfants.find((n) => !n.fichier && n.nom === segment);
    if (!courant) return undefined;
  }
  return courant;
}

/**
 * Tout ce qu'un projet donne à lire, en une seule liste ordonnée.
 *
 * L'ordre est celui de la page Détail — ce que le projet configure d'abord, ce
 * qu'il documente ensuite — parce que c'est le même inventaire : la conversation
 * ne montre ni plus ni moins que l'écran, elle le montre à plat.
 */
export function aplatir(res: ProjectResources): Entree[] {
  return [
    // Le préfixe rétablit le chemin réel : le `rel` d'une ressource part du
    // `.claude`, pas de la racine du projet. Sans lui, `agents/` et un dossier
    // `agents/` des sources se confondraient dans l'arbre.
    ...noeuds(res.resources, 'claude', '.claude/'),
    ...noeuds(res.memories, 'arbre'),
    ...noeuds(res.repoDocs, 'arbre'),
    // Un dossier inclus a son propre lecteur : ses documents ne portent aucun
    // des noms que `sourceFileKind` reconnaît, et c'est bien pourquoi il a fallu
    // demander leur inclusion pour les voir. Leur `rel` part déjà de la racine.
    ...res.folders.flatMap((f) => noeuds(f.files, 'inclus')),
  ];
}
