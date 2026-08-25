// Ce que le formulaire de l'Atelier reçoit d'une question.
//
// L'outil de question est exécuté par AURA, pas par le CLI (voir `ask.ts`), et son
// schéma est donc une copie d'un schéma qu'on ne possède pas. Zod retire ce qu'il
// ne déclare pas : c'est ainsi que `preview` — les maquettes qu'une question fait
// comparer — disparaissait entre le modèle et l'écran, silencieusement.
//
// Ces trois cas gardent la propriété qui compte : le schéma décrit ce qu'on sait
// rendre, il ne décide pas de ce qui passe.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { QUESTION_SHAPE } from '../server/agent/ask.ts'

const schema = z.object(QUESTION_SHAPE)

/** Une question minimale, à laquelle chaque cas ajoute ce qu'il éprouve. */
const question = (options: unknown[]): unknown => ({
  questions: [{ question: 'Quelle mise en page ?', header: 'Layout', options }],
})

describe('schéma des questions de l’Atelier', () => {
  it('laisse passer la maquette ASCII d’une option', () => {
    const preview = '┌────────┐\n│  Titre │\n└────────┘'
    const parsed = schema.parse(
      question([
        { label: 'Encadrée', description: 'Un cadre autour du titre.', preview },
        { label: 'Nue', description: 'Sans cadre.' },
      ]),
    )
    expect(parsed.questions[0]?.options[0]?.preview).toBe(preview)
    // Les retours à la ligne sont la maquette : la coller sur une ligne la perd.
    expect(parsed.questions[0]?.options[0]?.preview?.split('\n')).toHaveLength(3)
  })

  it('laisse passer un champ que nous ne connaissons pas encore', () => {
    const parsed = schema.parse(
      question([
        { label: 'A', description: 'a', futurChamp: { forme: 'inconnue' } },
        { label: 'B', description: 'b' },
      ]),
    ) as { questions: { options: Record<string, unknown>[] }[] }
    expect(parsed.questions[0]?.options[0]?.futurChamp).toEqual({ forme: 'inconnue' })
  })

  it('refuse toujours une option sans libellé', () => {
    expect(() => schema.parse(question([{ description: 'sans label' }]))).toThrow()
  })
})
