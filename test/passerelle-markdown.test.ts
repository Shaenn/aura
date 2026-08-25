// Couper un document en pages sans casser ce qui est à cheval.
//
// Le risque n'est pas esthétique : une page qui s'arrête au milieu d'un bloc de
// code renvoie sa clôture à la page suivante, où elle *ouvre* un bloc au lieu de
// le fermer — et tout le reste du document part en code. C'est ce que ces tests
// tiennent.

import { describe, expect, it } from 'vitest'
import { paginer } from '../server/passerelle/markdown.ts'

/** Une page d'essai : assez petite pour que les cas tiennent en peu de lignes. */
const PAGE = 2_600

describe('paginer', () => {
  it('rend une seule page pour un document court', () => {
    expect(paginer('court', PAGE)).toEqual(['court'])
  })

  it('rend une page même pour un document vide', () => {
    expect(paginer('', PAGE)).toEqual([''])
  })

  it('coupe sur des frontières de lignes', () => {
    const doc = Array.from({ length: 400 }, (_, i) => `ligne ${i}`).join('\n')
    const pages = paginer(doc, PAGE)
    expect(pages.length).toBeGreaterThan(1)
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(PAGE)
    // Rien ne se perd et rien ne se duplique.
    expect(pages.join('\n').split('\n')).toEqual(doc.split('\n'))
  })

  it('referme et rouvre un bloc de code à cheval sur deux pages', () => {
    const gros = Array.from({ length: 400 }, (_, i) => `code ${i}`).join('\n')
    const pages = paginer('```ts\n' + gros + '\n```', PAGE)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0]?.endsWith('```')).toBe(true)
    expect(pages[1]?.startsWith('```ts')).toBe(true)
    // Chaque page porte autant d'ouvertures que de fermetures : aucune ne laisse
    // un bloc en l'air pour la suivante.
    for (const p of pages) {
      expect(p.split('\n').filter((l) => /^\s*```/.test(l)).length % 2).toBe(0)
    }
  })

  it('n’ouvre pas un bloc vide quand seule la clôture déborde', () => {
    // La fermeture est rattachée à la page qui a ouvert le bloc, même si elle
    // dépasse. La renvoyer à la suivante y ouvrait un bloc aussitôt refermé —
    // visible, et sans contenu.
    const doc = '```ts\n' + 'a'.repeat(40) + '\n' + 'b'.repeat(12) + '\n```\nsuite'
    const pages = paginer(doc, 60)
    expect(pages.some((p) => p.startsWith('```ts\n```'))).toBe(false)
    expect(pages.join('\n').split('\n')).toEqual(doc.split('\n'))
  })

  it('coupe une ligne plus longue qu’une page entière', () => {
    const pages = paginer('x'.repeat(PAGE * 2 + 10), PAGE)
    expect(pages.length).toBeGreaterThanOrEqual(3)
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(PAGE)
  })
})
