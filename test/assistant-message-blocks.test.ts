// Une réponse arrive en plusieurs messages, et doit rester entière.
//
// Le CLI émet un message `assistant` par bloc — le raisonnement, la prose, puis
// chaque appel d'outil — tous portant le même `message.id`. Le traducteur prend
// cet identifiant pour `uuid` afin qu'ils se posent sur un seul événement ; il
// remplaçait alors les blocs à chaque message, si bien que seul le dernier
// survivait. Une réponse qui expliquait sa décision avant d'agir s'affichait dans
// l'Atelier comme un appel d'outil nu : la phrase arrivait, puis disparaissait.
//
// Le disque, lui, n'a jamais rien perdu — le parseur fait un événement par ligne.
// Ces tests tiennent la propriété que le direct doit désormais partager : ce qui
// est arrivé reste, et seul le bloc que le message décrit est recouvert.

import { describe, expect, it } from 'vitest'
import { Translator } from '../server/agent/translate.ts'

const ID = 'msg_1'

/** Un message complet tel que le SDK le passe au traducteur. */
const assistant = (content: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  message: { id: ID, model: 'opus', content, ...extra },
})

const thinking = { type: 'thinking', thinking: 'Le fichier est un vestige.' }
const prose = { type: 'text', text: 'Non — et voici pourquoi.' }
const edit = {
  type: 'tool_use',
  id: 'toolu_1',
  name: 'Edit',
  input: { file_path: 'docs/nuget.md', old_string: 'a', new_string: 'b' },
}

describe('onAssistant, réponse fragmentée en plusieurs messages', () => {
  it('garde la prose qu’un appel d’outil suit', () => {
    const t = new Translator()
    t.onAssistant(assistant([thinking]))
    t.onAssistant(assistant([prose]))
    t.onAssistant(assistant([edit]))

    expect(t.events).toHaveLength(1)
    const blocks = t.events[0]!.blocks
    expect(blocks.map((b) => b.kind)).toEqual(['thinking', 'text', 'tool_use'])
    expect(blocks[1]!.text).toBe(prose.text)
    expect(blocks[2]!.input).toEqual(edit.input)
  })

  it('recouvre le bloc frappé en direct sans effacer les précédents', () => {
    const t = new Translator()
    t.onStreamEvent({ event: { type: 'message_start', message: { id: ID, model: 'opus' } } })
    for (const [index, block] of [{ type: 'thinking' }, { type: 'text' }, { type: 'tool_use', id: edit.id, name: edit.name }].entries()) {
      t.onStreamEvent({ event: { type: 'content_block_start', index, content_block: block } })
    }
    t.onStreamEvent({
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'Non —' },
      },
    })
    // L'entrée tronquée que le streaming montrait : le message complet la remplace.
    t.onStreamEvent({
      event: {
        type: 'content_block_delta',
        index: 2,
        delta: { type: 'input_json_delta', partial_json: '{"file_path":"docs' },
      },
    })

    t.onAssistant(assistant([thinking]))
    t.onAssistant(assistant([prose]))
    t.onAssistant(assistant([edit]))

    expect(t.events).toHaveLength(1)
    const blocks = t.events[0]!.blocks
    expect(blocks.map((b) => b.kind)).toEqual(['thinking', 'text', 'tool_use'])
    expect(blocks[1]!.text).toBe(prose.text)
    expect(blocks[2]!.input).toEqual(edit.input)
  })

  it('colle le résultat sur l’appel, où que le fragment l’ait posé', () => {
    const t = new Translator()
    t.onAssistant(assistant([prose]))
    t.onAssistant(assistant([edit]))
    t.onUser({
      message: { content: [{ type: 'tool_result', tool_use_id: edit.id, content: 'ok' }] },
    })

    const blocks = t.events[0]!.blocks
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'tool_use'])
    expect(blocks[1]!.result?.content).toContain('ok')
  })

  it('repart de zéro pour la réponse suivante', () => {
    const t = new Translator()
    t.onAssistant(assistant([prose]))
    t.onAssistant({ message: { id: 'msg_2', content: [{ type: 'text', text: 'Suite.' }] } })

    expect(t.events).toHaveLength(2)
    expect(t.events[1]!.blocks.map((b) => b.kind)).toEqual(['text'])
    expect(t.events[1]!.blocks[0]!.text).toBe('Suite.')
  })
})
