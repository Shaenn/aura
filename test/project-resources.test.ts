// Le rangement des ressources d'un projet.
//
// Deux écrans affichent le même inventaire — la page Projet et l'onglet
// « Ressources » du flux de session — et ils ne partagent que ce module. Ce qu'on
// fige ici est donc ce qui doit rester vrai des deux côtés : où atterrit un
// fichier dans l'arbre, et ce qui fait qu'un dossier est reconnu comme un skill.
//
// Ce code n'était couvert par rien tant qu'il vivait dans le `<script setup>`
// d'une page de 1 400 lignes.

import { describe, expect, it } from 'vitest';
import {
  buildCandidateTree,
  buildTree,
  groupSkills,
  treeCount,
  type RuleDirNode,
} from '../src/components/resources/projectResources.ts';
import type { FolderCandidate, ResourceCategory, ResourceNode } from '../shared/projects.ts';

/** Un nœud minimal : seuls `rel`, `name`, `title` et `category` sont lus. */
function res(rel: string, category: ResourceCategory, title = ''): ResourceNode {
  const name = rel.split('/').pop() ?? rel;
  return { category, rel, name, title: title || name, description: '', size: 100, mtime: 0 };
}

/** Le nœud d'un chemin, pour affirmer sur un endroit précis de l'arbre. */
function at(nodes: ReturnType<typeof buildTree>, path: string) {
  let level: ReturnType<typeof buildTree> | undefined = nodes;
  let node: (typeof nodes)[number] | undefined;
  for (const part of path.split('/')) {
    node = level?.find((n) => (n.type === 'dir' ? n.name : n.label) === part);
    level = node?.type === 'dir' ? node.children : undefined;
  }
  return node;
}

describe('buildTree', () => {
  const rules = [
    res('rules/back/domain.md', 'rules'),
    res('rules/back/application/contracts.md', 'rules'),
    res('rules/front.md', 'rules'),
  ];

  it('retire le segment de catégorie quand on le lui demande', () => {
    const tree = buildTree(rules, { stripPrefix: true });
    // `rules/` a disparu : la racine porte directement `back` et `front.md`.
    expect(tree.map((n) => (n.type === 'dir' ? n.name : n.label)).sort()).toEqual([
      'back',
      'front.md',
    ]);
  });

  it('compte les fichiers d’un dossier, sous-dossiers compris', () => {
    const tree = buildTree(rules, { stripPrefix: true });
    const back = at(tree, 'back') as RuleDirNode;
    expect(back.type).toBe('dir');
    expect(back.fileCount).toBe(2);
  });

  it('garde le chemin entier quand il n’y a pas de préfixe à retirer', () => {
    // C'est le cas de la mémoire : le `rel` d'un CLAUDE.md part de la racine.
    const tree = buildTree([res('CLAUDE.md', 'memory'), res('server/CLAUDE.md', 'memory')], {
      stripPrefix: false,
      filesFirst: true,
    });
    // `filesFirst` : le CLAUDE.md du niveau avant les sous-dossiers qui le
    // surchargent — l'ordre dans lequel Claude Code les empile.
    expect(tree[0]?.type).toBe('file');
    expect(tree[1]?.type).toBe('dir');
  });

  it('préfère le nom du frontmatter au nom de fichier', () => {
    const tree = buildTree([res('rules/x.md', 'rules', 'Règle métier')], { stripPrefix: true });
    expect(tree[0]?.type === 'file' && tree[0].label).toBe('Règle métier');
  });
});

describe('groupSkills', () => {
  const resources = [
    res('skills/deploy/SKILL.md', 'skills', 'Déployer'),
    res('skills/deploy/notes.md', 'skills'),
    res('skills/deploy/references/api.md', 'skills'),
    res('skills/deploy/references/cli.md', 'skills'),
    res('skills/solo.md', 'skills'),
    res('rules/ignored.md', 'rules'),
  ];

  it('ne retient que la catégorie skills', () => {
    expect(groupSkills(resources).map((s) => s.key)).toEqual(['deploy', 'solo.md']);
  });

  it('élit SKILL.md comme point d’entrée et lui emprunte son titre', () => {
    const deploy = groupSkills(resources)[0]!;
    expect(deploy.main?.name).toBe('SKILL.md');
    expect(deploy.title).toBe('Déployer');
  });

  it('sépare les références directes de celles d’un sous-dossier', () => {
    const deploy = groupSkills(resources)[0]!;
    expect(deploy.directRefs.map((r) => r.name)).toEqual(['notes.md']);
    expect(deploy.refFolders).toHaveLength(1);
    expect(deploy.refFolders[0]?.name).toBe('references');
    expect(deploy.refFolders[0]?.items).toHaveLength(2);
    // Le badge compte toutes les références, où qu'elles soient.
    expect(deploy.refCount).toBe(3);
  });

  it('accepte un skill d’un seul fichier, sans SKILL.md', () => {
    const solo = groupSkills(resources)[1]!;
    expect(solo.main?.name).toBe('solo.md');
    expect(solo.refCount).toBe(0);
  });
});

describe('buildCandidateTree', () => {
  const cand = (rel: string, docs: number, included = false): FolderCandidate => ({
    rel,
    docs,
    included,
  });

  it('recompose l’imbrication que la liste plate avait perdue', () => {
    const tree = buildCandidateTree([
      cand('docs/api', 3),
      cand('docs', 8),
      cand('src/help/sections', 36),
      cand('src', 36),
      cand('src/help', 36),
    ]);
    expect(tree.map((n) => n.name)).toEqual(['docs', 'src']);
    const docs = tree[0]!;
    expect(docs.docs).toBe(8);
    expect(docs.children.map((n) => n.name)).toEqual(['api']);
    // Le `rel` reste complet à chaque niveau : c'est lui qu'on inclut.
    expect(docs.children[0]?.rel).toBe('docs/api');
    expect(tree[1]?.children[0]?.children[0]?.rel).toBe('src/help/sections');
  });

  // La borne de profondeur du serveur peut rendre une branche sans sa racine ;
  // l'arbre doit tenir quand même, avec un parent à zéro document.
  it('crée les parents manquants plutôt que de perdre la branche', () => {
    const tree = buildCandidateTree([cand('a/b/c', 4)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe('a');
    expect(tree[0]?.docs).toBe(0);
    expect(tree[0]?.children[0]?.children[0]?.rel).toBe('a/b/c');
  });

  it('range chaque niveau par ordre alphabétique', () => {
    const tree = buildCandidateTree([cand('z', 1), cand('a', 1), cand('a/z', 1), cand('a/b', 1)]);
    expect(tree.map((n) => n.name)).toEqual(['a', 'z']);
    expect(tree[0]?.children.map((n) => n.name)).toEqual(['b', 'z']);
  });
});

describe('treeCount', () => {
  const node = (rel: string): ResourceNode => res(rel, 'other');

  // Les deux écrans additionnaient chacun de leur côté, et avaient déjà divergé :
  // l'un oubliait les plans, l'autre les documents du dépôt.
  it('compte tout ce que l’hôte déclare afficher', () => {
    expect(
      treeCount({
        resources: [node('a.md'), node('b.md')],
        memories: [node('CLAUDE.md')],
        repoDocs: [node('README.md')],
        folders: [{ files: [node('docs/x.md'), node('docs/y.md')] }, { files: [] }],
        plans: [{}, {}],
      }),
    ).toBe(8);
  });

  // Un écran qui ne montre pas les plans n'en passe pas, et son compteur reste
  // juste sans avoir à connaître la règle.
  it('ignore ce qui n’est pas passé', () => {
    expect(treeCount({ resources: [node('a.md')] })).toBe(1);
    expect(treeCount({})).toBe(0);
  });
});
