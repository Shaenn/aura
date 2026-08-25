// L'entrée d'un outil pendant qu'elle s'écrit.
//
// Le SDK streame l'entrée d'un `tool_use` en fragments de JSON, et l'Atelier les
// répare pour montrer la carte se composer. Deux bornes protègent ce travail : un
// pas minimal entre deux réparations, et une taille au-delà de laquelle on cesse.
//
// C'est la seconde qui a produit un défaut visible : une `AskUserQuestion`
// portant des maquettes ASCII pèse justement quelques milliers de caractères, si
// bien que la carte se figeait à mi-question pendant toute la frappe. Ces tests
// tiennent les deux propriétés qui comptent : une question de cette taille
// continue de se rendre pendant qu'elle arrive, et rien ne laisse jamais la carte
// sur un objet vide.

import { describe, expect, it } from 'vitest'
import { Translator } from '../server/agent/translate.ts'
import type { Block } from '../shared/transcript.ts'

/** La maquette d'une option : c'est elle qui fait le poids d'une question. */
const preview = (lines: number): string =>
  ['┌──────────────┐', ...Array.from({ length: lines }, (_, i) => `│ ligne ${i}`), '└─────────────┘'].join('\n')

/** Une question à deux maquettes — environ 3 500 caractères de JSON. */
const question = (n: number): unknown => ({
  question: `Quelle mise en page pour l'écran ${n} ?`,
  header: `Écran ${n}`,
  options: [
    { label: 'Encadrée', description: 'Un cadre.', preview: preview(150) },
    { label: 'Nue', description: 'Sans cadre.', preview: preview(150) },
  ],
})

/** Un traducteur avec une réponse en cours et un `tool_use` ouvert au bloc 0. */
function openToolBlock(): Translator {
  const t = new Translator()
  t.onStreamEvent({ event: { type: 'message_start', message: { id: 'msg_1', model: 'opus' } } })
  t.onStreamEvent({
    event: {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'AskUserQuestion' },
    },
  })
  return t
}

function feed(t: Translator, fragment: string): void {
  t.onStreamEvent({
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: fragment },
    },
  })
}

/** Le bloc d'outil tel que la timeline le verrait à cet instant. */
function toolBlock(t: Translator): Block | undefined {
  return t.events.find((e) => e.uuid === 'msg_1')?.blocks[0]
}

/** Le pas de diffusion est réel : deux fragments trop rapprochés ne sont pas relus. */
const step = (): Promise<void> => new Promise((r) => setTimeout(r, 140))

describe('entrée d’outil en cours de frappe', () => {
  it('continue de rendre une question à maquettes au-delà de quelques milliers de caractères', async () => {
    const t = openToolBlock()
    // Six questions à maquettes : ~21 000 caractères, coupés là où le SDK
    // couperait — en cours de route, pas sur une frontière commode. Ce qui
    // compte est qu'il reste plusieurs fragments *après* le franchissement de la
    // borne : c'est là que la carte cessait de suivre.
    const json = JSON.stringify({
      questions: Array.from({ length: 6 }, (_, i) => question(i + 1)),
    })
    const chunk = Math.ceil(json.length / 6)

    for (let i = 0; i < json.length; i += chunk) {
      feed(t, json.slice(i, i + chunk))
      await step()
    }

    const input = toolBlock(t)?.input as { questions?: unknown[] } | undefined
    expect(input?.questions).toHaveLength(6)
  })

  it('ne laisse jamais la carte sur un objet vide, si gros soit le fragment', () => {
    const t = openToolBlock()
    // Un seul fragment plus gros que la borne de réparation : c'est le cas qui
    // laissait `input` à `{}` jusqu'à la fin du message.
    const huge = JSON.stringify({
      questions: Array.from({ length: 30 }, (_, i) => question(i)),
    })
    feed(t, huge)

    const input = toolBlock(t)?.input as { questions?: unknown[] } | undefined
    expect(input?.questions?.length).toBeGreaterThan(0)
  })
})
