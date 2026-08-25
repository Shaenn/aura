// `/clear` : la conversation repart à vide, dans un autre fichier.
//
// C'est ce qui la distingue d'un compactage, et ce que ces tests tiennent. Un
// compactage reste dans le même `.jsonl` sous le même identifiant — vérifié sur
// un transcript réel de 2421 lignes, dont 1871 s'écrivent après la frontière.
// `/clear`, lui, en ouvre un autre : le CLI n'écrira plus une ligne dans le
// précédent. Garder les tours d'avant à l'écran laisserait donc lire, juste
// au-dessus du curseur, une conversation dont l'agent n'a plus aucun souvenir.

import { describe, expect, it } from 'vitest'
import { Translator } from '../server/agent/translate.ts'

const assistant = (id: string, text: string): Record<string, unknown> => ({
  type: 'assistant',
  parent_tool_use_id: null,
  message: { id, model: 'claude-opus-5', content: [{ type: 'text', text }] },
})

describe('remise à zéro du fil', () => {
  it('oublie tout ce qui précède', () => {
    const t = new Translator()
    t.appendUserPrompt('Réponds : alpha.')
    t.onAssistant(assistant('msg_1', 'alpha.'))
    expect(t.events).toHaveLength(2)

    t.reset()
    expect(t.events).toEqual([])
  })

  it('ne laisse pas un identifiant d’avant capturer un message d’après', () => {
    const t = new Translator()
    t.onAssistant(assistant('msg_1', 'alpha.'))
    t.reset()
    // Même `id` de message après la coupure : sans vider `byUuid`, le translator
    // le reconnaîtrait comme déjà connu et rendrait l'ancien événement.
    t.onAssistant(assistant('msg_1', 'beta.'))

    expect(t.events).toHaveLength(1)
    expect(t.events[0]?.blocks[0]?.text).toBe('beta.')
  })

  it('le fil repart de la ligne qui annonce la coupure', () => {
    const t = new Translator()
    t.appendUserPrompt('Réponds : alpha.')
    t.reset()
    t.appendSystem('J’ouvre une nouvelle session.', 'warn')

    expect(t.events).toHaveLength(1)
    expect(t.events[0]?.kind).toBe('system')
    // Rien avant elle : c'est le premier événement, pas un enfant de l'ancien fil.
    expect(t.events[0]?.parentUuid).toBeNull()
  })
})

describe('tour muet', () => {
  it('n’ouvre pas de bulle vide — c’est la réponse de /clear', () => {
    const t = new Translator()
    const upserts = t.onAssistant(assistant('msg_vide', '(no content)'))

    expect(upserts).toEqual([])
    expect(t.events).toEqual([])
  })

  it('laisse passer un texte qui contient la formule sans s’y réduire', () => {
    const t = new Translator()
    t.onAssistant(assistant('msg_1', 'Le CLI écrit (no content) quand il n’a rien à dire.'))

    expect(t.events).toHaveLength(1)
  })
})
