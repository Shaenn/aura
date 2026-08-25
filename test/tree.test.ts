// L'arbre de dossiers de la catégorie mémoire.
//
// `buildTree` est du code pur — il range des lignes par leur label découpé sur
// les `/`. On l'éprouve directement, sans monter de composant : les quinze règles
// d'une vraie session en sont la motivation, une poignée suffit à fixer les
// règles.

import { describe, expect, it } from 'vitest'
import { buildTree, hasFolders, type TreeNode } from '../src/components/replay/contextTree.ts'

/** Une ligne minimale : `buildTree` ne lit que `label` et `tokens`. */
function row(label: string, tokens: number) {
  return { label, tokens, category: 'memory' as const, turnIndex: 0, detail: [] }
}

/** Le nœud d'un chemin, pour affirmer sur un endroit précis de l'arbre. */
function at(nodes: TreeNode[], path: string): TreeNode | undefined {
  let level: TreeNode[] | undefined = nodes
  let node: TreeNode | undefined
  for (const part of path.split('/')) {
    node = level?.find((n) => n.name === part)
    level = node?.children
  }
  return node
}

describe('buildTree', () => {
  const rows = [
    row('rules/back/domain.md', 836),
    row('rules/back/application/contracts.md', 535),
    row('rules/back/application/mongo.md', 514),
    row('rules/front/admin.md', 627),
    row('front/CLAUDE.md', 659),
  ]

  it('reconstruit les dossiers depuis les labels', () => {
    const tree = buildTree(rows)
    expect(hasFolders(tree)).toBe(true)
    expect(at(tree, 'rules/back/application/contracts.md')?.row?.tokens).toBe(535)
    // Le nom d'une feuille est son dernier segment, pas le label entier.
    expect(at(tree, 'rules/back/domain.md')?.name).toBe('domain.md')
  })

  it("additionne les tokens d'un dossier depuis ses descendants", () => {
    const tree = buildTree(rows)
    // back = domain (836) + application/contracts (535) + application/mongo (514).
    expect(at(tree, 'rules/back')?.tokens).toBe(1885)
    expect(at(tree, 'rules/back/application')?.tokens).toBe(1049)
  })

  it('classe chaque niveau du plus lourd au plus léger', () => {
    const tree = buildTree(rows)
    // rules (1988) passe avant front/CLAUDE.md (659).
    expect(tree[0]?.name).toBe('rules')
    const back = at(tree, 'rules/back')?.children ?? []
    // domain.md (836) avant le dossier application (1049) ? Non : application pèse
    // plus lourd, il remonte. Le tri est sur les tokens, dossier ou fichier.
    expect(back[0]?.name).toBe('application')
  })

  it("n'annonce aucun dossier quand tout est à plat", () => {
    const flat = buildTree([row('CLAUDE.md', 100), row('permissions.md', 50)])
    expect(hasFolders(flat)).toBe(false)
  })
})
