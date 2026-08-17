// Le rangement des ressources d'un projet, en code pur.
//
// Deux écrans montrent le même inventaire : la page Projet et l'onglet
// « Ressources » du flux de session. Ce qui décide de ce qu'on voit — l'ordre des
// catégories, la reconstruction de l'arbre à partir d'une liste plate, le
// regroupement des skills par dossier, le vocabulaire de frontmatter — vit ici,
// hors de tout composant : c'est ce qui doit rester identique entre les deux, et
// c'est aussi la seule partie qu'on peut éprouver sans monter de Vue.

import type { FolderCandidate, ResourceCategory, ResourceNode } from '@/services/projects';
import { AGENT_KEYS, RULE_KEYS, SKILL_KEYS, type KeySpec } from '@/utils/resourceFrontmatter';

/**
 * D'où vient le fichier qu'on lit, et donc par quelle route il se lit.
 *
 * Quatre bacs à sable distincts côté serveur : le `.claude` du projet, les
 * CLAUDE.md de l'arborescence des sources, les dossiers que l'utilisateur a
 * inclus, et `~/.claude/plans` — qui n'est même pas dans le projet. Un `rel` ne
 * dit pas d'où il sort ; cette étiquette le dit.
 */
export type ResourceSource = 'resource' | 'memory' | 'included' | 'plan';

// ── Nœuds d'arbre ────────────────────────────────────────────────────────────
// Déclarés ici plutôt que dans `RuleTree.vue` : `buildTree` les produit, et un
// module de logique n'a pas à importer un composant pour nommer son résultat.
// `RuleTree.vue` les ré-exporte, si bien qu'aucun appelant existant ne change.
export interface RuleFileNode {
  type: 'file';
  key: string;
  label: string;
  node: ResourceNode;
}
export interface RuleDirNode {
  type: 'dir';
  key: string;
  name: string;
  path: string;
  fileCount: number;
  children: RuleNode[];
}
export type RuleNode = RuleFileNode | RuleDirNode;

/**
 * L'ordre des catégories et leur icône ; seuls les groupes non vides s'affichent.
 *
 * Le mot, lui, vient du catalogue : `resources.categories.<key>`. Ce qui reste
 * ici ne dépend d'aucune langue.
 */
export const CATEGORY_META: { key: ResourceCategory; icon: string }[] = [
  { key: 'agents', icon: 'smart_toy' },
  { key: 'skills', icon: 'bolt' },
  { key: 'commands', icon: 'terminal' },
  { key: 'rules', icon: 'rule' },
  { key: 'memory', icon: 'psychology' },
  { key: 'settings', icon: 'settings' },
  { key: 'docs', icon: 'menu_book' },
  { key: 'tools', icon: 'build' },
  { key: 'other', icon: 'insert_drive_file' },
];

// ── Skills ───────────────────────────────────────────────────────────────────
// A skill lives in its own folder (skills/<name>/) with a SKILL.md entry point
// and optional reference files. We group the flat resource list by that folder
// so the navigator reflects the real "one skill = one folder + its refs" shape,
// and we surface each sub-folder (e.g. references/) as its own tree node.
export interface SkillRefFolder {
  name: string; // the sub-folder name (e.g. 'references')
  items: ResourceNode[]; // files inside it
}
export interface SkillFolder {
  key: string; // the skill folder name (or filename for a loose single-file skill)
  title: string; // frontmatter name of SKILL.md, else the folder name
  main: ResourceNode | null; // the SKILL.md entry point (null if none found)
  directRefs: ResourceNode[]; // reference files sitting directly in the skill folder
  refFolders: SkillRefFolder[]; // sub-folders, each a tree node with its own files
  refCount: number; // total reference files (for the header badge)
}

export function groupSkills(resources: ResourceNode[]): SkillFolder[] {
  const byFolder = new Map<string, ResourceNode[]>();
  for (const r of resources) {
    if (r.category !== 'skills') continue;
    const parts = r.rel.split('/'); // ['skills', <folder>, …] or ['skills', <file>]
    const key = parts[1] ?? r.name;
    const arr = byFolder.get(key) ?? [];
    arr.push(r);
    byFolder.set(key, arr);
  }
  const out: SkillFolder[] = [];
  for (const [key, items] of byFolder) {
    const main =
      items.find((r) => /^SKILL\.md$/i.test(r.name)) ??
      (items.length === 1 ? items[0] : undefined) ??
      null;
    const refs = items.filter((r) => r !== main).sort((a, b) => a.rel.localeCompare(b.rel));
    // Split refs into files directly under the skill vs. those in a sub-folder;
    // group the latter by their immediate sub-folder (the segment after the skill).
    const directRefs: ResourceNode[] = [];
    const folders = new Map<string, ResourceNode[]>();
    for (const r of refs) {
      const rest = r.rel.split('/').slice(2); // path within the skill folder
      if (rest.length <= 1) {
        directRefs.push(r);
      } else {
        const sub = rest[0] ?? '';
        const arr = folders.get(sub) ?? [];
        arr.push(r);
        folders.set(sub, arr);
      }
    }
    const refFolders = [...folders.entries()]
      .map(([name, fitems]) => ({ name, items: fitems }))
      .sort((a, b) => a.name.localeCompare(b.name));
    out.push({
      key,
      title: main?.title || key,
      main,
      directRefs,
      refFolders,
      refCount: refs.length,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** A reference's label within its sub-folder — the file name (keeps deeper nesting). */
export function refLeaf(r: ResourceNode): string {
  return r.rel.split('/').slice(3).join('/') || r.name;
}

// ── Arbre de dossiers ────────────────────────────────────────────────────────
// Les règles (rules/) et les docs (docs/) vivent dans une arborescence de
// dossiers (ex. rules/back/application/service.md, docs/diagrammes/x.md). On
// reconstruit cet arbre à partir de la liste plate pour l'afficher de façon
// repliable, comme les skills.
//
// `stripPrefix` retire le premier segment du chemin : les ressources .claude le
// portent comme préfixe de catégorie (`rules/…`), les CLAUDE.md des sources non —
// leur `rel` part déjà de la racine du projet.
//
// `filesFirst` inverse le tri habituel « dossiers d'abord ». La mémoire s'en sert
// pour montrer le CLAUDE.md d'un niveau avant les sous-dossiers qui le surchargent,
// soit l'ordre dans lequel Claude Code les empile.
// `stripSegments` généralise `stripPrefix` : un dossier inclus peut être imbriqué
// (`docs/specs`), et son en-tête porte déjà le chemin complet. Retirer un seul
// segment laisserait `specs/` en tête de chaque branche. Le nœud rendu garde son
// `rel` d'origine — c'est lui que la route de lecture attend, l'élagage ne vaut
// que pour l'affichage.
export interface TreeOpts {
  stripPrefix: boolean;
  stripSegments?: number;
  filesFirst?: boolean;
}

export function buildTree(items: ResourceNode[], opts: TreeOpts): RuleNode[] {
  const { stripPrefix, filesFirst = false } = opts;
  const drop = opts.stripSegments ?? (stripPrefix ? 1 : 0);
  const root: RuleDirNode = {
    type: 'dir',
    key: '',
    name: '',
    path: '',
    fileCount: 0,
    children: [],
  };
  for (const r of items) {
    const segs = r.rel.split('/');
    const parts = segs.slice(drop);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i] ?? '';
      if (i === parts.length - 1) {
        // Les règles n'ont en général qu'un frontmatter `paths:` (pas de `name`),
        // donc le libellé retombe sur le nom de fichier.
        const label = r.title && r.title !== r.name ? r.title : seg;
        cur.children.push({ type: 'file', key: r.rel, label, node: r });
      } else {
        const path = parts.slice(0, i + 1).join('/');
        let dir = cur.children.find((c): c is RuleDirNode => c.type === 'dir' && c.path === path);
        if (!dir) {
          dir = { type: 'dir', key: path, name: seg, path, fileCount: 0, children: [] };
          cur.children.push(dir);
        }
        cur = dir;
      }
    }
  }
  // Compte récursif des fichiers et tri (par type, puis alphabétique).
  const dirsBeforeFiles = filesFirst ? 1 : -1;
  const finish = (d: RuleDirNode): number => {
    let n = 0;
    for (const c of d.children) n += c.type === 'dir' ? finish(c) : 1;
    d.fileCount = n;
    d.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? dirsBeforeFiles : -dirsBeforeFiles;
      const an = a.type === 'dir' ? a.name : a.label;
      const bn = b.type === 'dir' ? b.name : b.label;
      return an.localeCompare(bn);
    });
    return n;
  };
  finish(root);
  return root.children;
}

// ── Le compte de l'arbre ─────────────────────────────────────────────────────

/**
 * Ce que l'arbre montre, en un nombre.
 *
 * Les deux écrans affichaient chacun leur somme, faite à la main : la page Projet
 * oubliait les plans, le volet de session oubliait les documents du dépôt, et
 * l'arrivée des dossiers inclus les aurait fait diverger une fois de plus. Le
 * compte se calcule donc là où se décide l'affichage, et chaque hôte passe ce
 * qu'il donne réellement au navigateur — un écran qui ne montre pas les plans
 * n'en passe pas, et son compteur reste juste.
 */
export function treeCount(parts: {
  resources?: ResourceNode[];
  memories?: ResourceNode[];
  repoDocs?: ResourceNode[];
  folders?: { files: ResourceNode[] }[];
  plans?: unknown[];
}): number {
  return (
    (parts.resources?.length ?? 0) +
    (parts.memories?.length ?? 0) +
    (parts.repoDocs?.length ?? 0) +
    (parts.folders ?? []).reduce((sum, f) => sum + f.files.length, 0) +
    (parts.plans?.length ?? 0)
  );
}

// ── Dossiers à inclure ───────────────────────────────────────────────────────
// Le serveur rend une liste plate de chemins mesurés (`docs`, `docs/api`,
// `src/help/sections`). À plat, elle ne se lit pas : on ne voit plus qu'un
// dossier en contient un autre, et l'on choisit sans savoir ce qu'on emporte.
// L'arbre rend cette imbrication visible — d'autant qu'inclure un dossier
// emporte tout son sous-arbre.

export interface CandidateNode {
  rel: string;
  name: string;
  docs: number;
  children: CandidateNode[];
}

export function buildCandidateTree(candidates: FolderCandidate[]): CandidateNode[] {
  const byRel = new Map<string, CandidateNode>();
  const roots: CandidateNode[] = [];

  // Le nœud d'un chemin, en créant au passage les parents qui manqueraient — la
  // borne de profondeur du serveur peut n'avoir rendu qu'une partie d'une branche.
  const ensure = (rel: string): CandidateNode => {
    const found = byRel.get(rel);
    if (found) return found;
    const cut = rel.lastIndexOf('/');
    const node: CandidateNode = {
      rel,
      name: cut === -1 ? rel : rel.slice(cut + 1),
      docs: 0,
      children: [],
    };
    byRel.set(rel, node);
    if (cut === -1) roots.push(node);
    else ensure(rel.slice(0, cut)).children.push(node);
    return node;
  };

  for (const c of candidates) ensure(c.rel).docs = c.docs;

  const sort = (nodes: CandidateNode[]): CandidateNode[] => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sort(n.children);
    return nodes;
  };
  return sort(roots);
}

// ── Lecture d'un fichier ─────────────────────────────────────────────────────

/** Langage de coloration d'un fichier non-markdown, d'après son extension. */
export const EXT_LANG: Record<string, string> = {
  json: 'json',
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  bash: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  py: 'python',
};

// Claude Code ne documente de frontmatter que pour les agents et les skills ; les
// règles n'ont que `paths`. Ailleurs, liste vide : la carte affiche les clés sans
// les juger, plutôt que de les déclarer « ignorées » sur une référence inventée.
export const FM_KEYS: Partial<Record<ResourceCategory, KeySpec[]>> = {
  agents: AGENT_KEYS,
  skills: SKILL_KEYS,
  rules: RULE_KEYS,
};

/**
 * Le corps à rendre en Markdown. Un fichier qui n'en est pas est enrobé dans un
 * bloc de code : c'est encore du markdown, et la coloration vient avec.
 */
export function renderBody(ext: string, content: string, mdBody: string): string {
  if (ext === 'md') return mdBody;
  return `\`\`\`${EXT_LANG[ext] ?? ''}\n${content}\n\`\`\``;
}
