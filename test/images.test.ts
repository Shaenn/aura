// Ce qu'une image coûte au contexte, éprouvé contre les chiffres publiés.
//
// La formule n'est pas la nôtre : elle vient de la doc Vision d'Anthropic, qui
// en donne un tableau de valeurs de référence. Ce fichier fige ce tableau. Si
// Anthropic change de tokenizer visuel — c'est déjà arrivé, le palier haute
// résolution est apparu avec Claude 4.7 — c'est ici que ça se verra, plutôt que
// dans un chiffre discrètement faux au coin d'un appel d'outil.

import { describe, expect, it } from 'vitest'
import { visualTokens } from '../server/transcript.ts'

/** `[largeur, hauteur, tokens en palier standard, tokens en haute résolution]`. */
const PUBLISHED: [number, number, number, number][] = [
  [200, 200, 64, 64],
  [1000, 1000, 1296, 1296],
  [1092, 1092, 1521, 1521],
  [1920, 1080, 1560, 2691],
  [2000, 1500, 1564, 3888],
  [3840, 2160, 1560, 4784],
]

describe('coût en tokens visuels', () => {
  it('reproduit les valeurs publiées à 1 % près', () => {
    for (const [w, h, std, hi] of PUBLISHED) {
      // Une image qui tient dans son palier n'est pas redimensionnée : le calcul
      // est alors exact, et on l'exige tel quel.
      expect(visualTokens(w, h, true), `${w}×${h} haute résolution`).toBe(hi)

      // Une image réduite atterrit quelques tokens sous le plafond, que nous
      // approchons par le plafond lui-même. L'écart est borné, pas ignoré.
      const got = visualTokens(w, h, false)
      expect(Math.abs(got - std) / std, `${w}×${h} standard`).toBeLessThan(0.01)
    }
  })

  it('ne dépasse jamais le plafond de son palier', () => {
    for (const [w, h] of [
      [8000, 8000],
      [8000, 100],
      [100, 8000],
    ]) {
      expect(visualTokens(w!, h!, false)).toBeLessThanOrEqual(1568)
      expect(visualTokens(w!, h!, true)).toBeLessThanOrEqual(4784)
    }
  })

  it('compte au moins un pavé, même pour une image d’un pixel', () => {
    expect(visualTokens(1, 1, false)).toBe(1)
  })
})
