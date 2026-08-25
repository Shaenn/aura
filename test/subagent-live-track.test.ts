// Ce qu'un sous-agent fait, pendant qu'il le fait.
//
// Le SDK ne donne pas un flux par agent : il transmet le travail d'un sous-agent
// dans le même flux que le reste, en marquant ses messages du
// `parent_tool_use_id` de l'appel qui l'a lancé. Sans lire cette marque, ses
// appels d'outil se rendaient dans le fil principal — puis une seconde fois dans
// la piste de l'agent une fois le disque relu, qui les range, lui, où ils sont.
//
// Ce que ces tests tiennent : le direct partitionne comme le disque, c'est-à-dire
// que chaque événement est dans une piste et une seule.

import { describe, expect, it } from 'vitest'
import { Translator } from '../server/agent/translate.ts'
import { eventsOfTrack, MAIN_TRACK } from '../src/composables/useAgentTracks.ts'

const APPEL = 'toolu_appel_agent'

/** Le message `assistant` complet, tel que le SDK l'envoie. */
function assistant(id: string, parent: string | null): Record<string, unknown> {
  return {
    type: 'assistant',
    parent_tool_use_id: parent,
    message: {
      id,
      model: 'claude-opus-5',
      content: [{ type: 'tool_use', id: `${id}_t`, name: 'Read', input: { file_path: 'a.ts' } }],
    },
  }
}

describe('travail d’un sous-agent en direct', () => {
  it('sort du fil principal', () => {
    const t = new Translator()
    t.onAssistant(assistant('msg_principal', null))
    t.onAssistant(assistant('msg_sous_agent', APPEL))

    const principal = eventsOfTrack(t.events, MAIN_TRACK).map((e) => e.uuid)
    expect(principal).toEqual(['msg_principal'])
  })

  it('se retrouve dans la piste de l’appel qui l’a lancé', () => {
    const t = new Translator()
    t.onAssistant(assistant('msg_sous_agent', APPEL))

    const piste = eventsOfTrack(t.events, APPEL).map((e) => e.uuid)
    expect(piste).toEqual(['msg_sous_agent'])
  })

  it('vaut aussi pour le flux partiel, qui arrive avant le message complet', () => {
    const t = new Translator()
    t.onStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: APPEL,
      event: { type: 'message_start', message: { id: 'msg_partiel', model: 'claude-opus-5' } },
    })

    expect(eventsOfTrack(t.events, MAIN_TRACK)).toHaveLength(0)
    expect(eventsOfTrack(t.events, APPEL)).toHaveLength(1)
  })

  it('vaut pour un résultat d’outil que rien n’apparie', () => {
    const t = new Translator()
    t.onUser({
      type: 'user',
      parent_tool_use_id: APPEL,
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'toolu_inconnu', content: 'ok' }],
      },
    })

    expect(eventsOfTrack(t.events, MAIN_TRACK)).toHaveLength(0)
    expect(eventsOfTrack(t.events, APPEL)).toHaveLength(1)
  })

  it('laisse le fil principal intact quand aucun agent n’est en jeu', () => {
    const t = new Translator()
    t.appendUserPrompt('bonjour')
    t.onAssistant(assistant('msg_principal', null))

    expect(eventsOfTrack(t.events, MAIN_TRACK)).toHaveLength(2)
  })
})
