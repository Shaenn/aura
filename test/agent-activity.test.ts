// Ce qui rend visible un agent qui travaille.
//
// Deux mécaniques distinctes, qui répondent au même reproche — l'écran restait
// mort pendant que le CLI, lui, montrait tout :
//
//   `repairJson`       lire une entrée d'outil qui n'a pas fini d'arriver ;
//   `ActivityTracker`  retenir des messages du SDK ce qu'ils disent du présent.
//
// Ces messages ne produisent aucun événement de transcript : rien, en aval, ne
// remarquerait leur disparition. D'où ces cas gelés ici.

import { describe, expect, it } from 'vitest'
import { ActivityTracker } from '../server/agent/activity.ts'
import { repairJson } from '../server/agent/partial.ts'

describe('repairJson', () => {
  it('rend tel quel un fragment déjà complet', () => {
    expect(repairJson('{"command":"ls -la"}')).toEqual({ command: 'ls -la' })
  })

  it('garde une valeur textuelle en cours de frappe', () => {
    // Le cas qui justifie tout : c'est cette chaîne-là qu'on veut voir grandir.
    expect(repairJson('{"command": "git sta')).toEqual({ command: 'git sta' })
  })

  it('jette une clé à demi tapée plutôt que d’inventer un argument', () => {
    expect(repairJson('{"command": "ls", "descrip')).toEqual({ command: 'ls' })
  })

  it('coupe une virgule laissée en suspens', () => {
    expect(repairJson('{"a": "b", ')).toEqual({ a: 'b' })
  })

  it('referme les conteneurs imbriqués dans le bon ordre', () => {
    expect(repairJson('{"edits":[{"old":"x')).toEqual({ edits: [{ old: 'x' }] })
  })

  it('ne clôt pas sur un antislash d’échappement', () => {
    // Fermer ici produirait `\"`, qui rouvrirait la chaîne au lieu de la finir.
    expect(repairJson('{"a":"b\\')).toEqual({ a: 'b' })
  })

  it('recule jusqu’au dernier point sûr quand une valeur non textuelle traîne', () => {
    // `12` peut être le début de `123` : mieux vaut ne rien dire qu’un chiffre faux.
    expect(repairJson('{"count": 12')).toEqual({})
  })

  it('rend null sur ce dont on ne peut rien tirer', () => {
    expect(repairJson('')).toBeNull()
    expect(repairJson('   ')).toBeNull()
    // Une entrée d’outil est un objet ; une racine de tableau n’en est pas une.
    expect(repairJson('[1, 2')).toBeNull()
  })
})

describe('ActivityTracker', () => {
  const blockStart = (type: string) => ({
    type: 'stream_event',
    event: { type: 'content_block_start', index: 0, content_block: { type } },
  })

  it('suit le raisonnement et son estimation de tokens', () => {
    const tracker = new ActivityTracker()
    expect(tracker.consume(blockStart('thinking'))).toBe('major')
    expect(tracker.snapshot().phase).toBe('thinking')

    // Le compteur seul ne vaut pas une trame immédiate : voir `Change`.
    expect(tracker.consume({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 1240 })).toBe('minor')
    expect(tracker.snapshot().thinkingTokens).toBe(1240)

    expect(tracker.consume(blockStart('text'))).toBe('major')
    expect(tracker.snapshot().phase).toBe('writing')
  })

  it('inscrit un outil dès que sa carte paraît, et n’en change la phase qu’à l’exécution', () => {
    const tracker = new ActivityTracker()
    tracker.consume(blockStart('text'))

    // L'appel s'écrit : sa carte est déjà à l'écran, donc l'outil compte comme
    // parti — sinon elle s'annoncerait « sans résultat » le temps qu'il se
    // compose. Mais rien ne s'exécute encore : la phase reste la rédaction.
    expect(
      tracker.consume({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'Bash' },
        },
      }),
    ).toBe('major')
    expect(tracker.snapshot()).toMatchObject({ phase: 'writing' })
    expect(tracker.snapshot().tools.map((t) => t.name)).toEqual(['Bash'])

    // La réponse est close : l'appel part.
    tracker.consume({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash' }] },
    })
    const running = tracker.snapshot()
    expect(running.phase).toBe('tool')
    // Inscrit une fois, pas deux.
    expect(running.tools.map((t) => t.name)).toEqual(['Bash'])
  })

  it('rend la main à l’API quand le dernier résultat est revenu', () => {
    const tracker = new ActivityTracker()
    tracker.consume({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'Bash' },
          { type: 'tool_use', id: 'toolu_2', name: 'Read' },
        ],
      },
    })

    tracker.consume({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1' }] },
    })
    // Il en reste un : la phase ne bouge pas.
    expect(tracker.snapshot().phase).toBe('tool')
    expect(tracker.snapshot().tools.map((t) => t.id)).toEqual(['toolu_2'])

    tracker.consume({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_2' }] },
    })
    expect(tracker.snapshot().phase).toBe('requesting')
    expect(tracker.snapshot().tools).toEqual([])
  })

  it('laisse l’outil en vol primer sur une requête annoncée', () => {
    const tracker = new ActivityTracker()
    tracker.consume({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash' }] },
    })
    expect(tracker.consume({ type: 'system', subtype: 'status', status: 'requesting' })).toBeNull()
    expect(tracker.snapshot().phase).toBe('tool')
  })

  it('adopte un outil que seul son chrono a signalé', () => {
    const tracker = new ActivityTracker()
    expect(
      tracker.consume({
        type: 'tool_progress',
        tool_use_id: 'toolu_9',
        tool_name: 'WebFetch',
        parent_tool_use_id: null,
        elapsed_time_seconds: 8,
      }),
    ).toBe('major')
    expect(tracker.snapshot().tools[0]).toMatchObject({ name: 'WebFetch', elapsedSeconds: 8 })
  })

  it('tait les outils d’un sous-agent', () => {
    // L’appel `Agent` qui les a lancés figure déjà dans la liste ; empiler sa
    // descendance ferait défiler des lignes qui ne parlent plus de ce tour-ci.
    const tracker = new ActivityTracker()
    expect(
      tracker.consume({
        type: 'tool_progress',
        tool_use_id: 'toolu_9',
        tool_name: 'Grep',
        parent_tool_use_id: 'toolu_1',
        elapsed_time_seconds: 2,
      }),
    ).toBeNull()
    expect(tracker.snapshot().tools).toEqual([])
  })

  it('porte la tentative en cours quand l’API a refusé', () => {
    const tracker = new ActivityTracker()
    tracker.consume({
      type: 'system',
      subtype: 'api_retry',
      attempt: 2,
      max_retries: 5,
      retry_delay_ms: 4000,
    })
    expect(tracker.snapshot()).toMatchObject({
      phase: 'retrying',
      retry: { attempt: 2, maxRetries: 5, delayMs: 4000 },
    })
  })

  it('ne laisse aucun trou entre deux actions', () => {
    // Le reproche d'origine : entre deux `Edit`, le modèle réfléchit une, deux,
    // dix secondes, et l'écran ne montrait rien. Chaque instant du parcours doit
    // porter une phase — de l'envoi jusqu'au résultat.
    const tracker = new ActivityTracker()

    expect(tracker.beginTurn()).toBe('major')
    expect(tracker.snapshot().phase).toBe('requesting')

    tracker.consume({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Edit' }] },
    })
    expect(tracker.snapshot().phase).toBe('tool')

    // L'outil rend la main : c'est ici que commençait le silence.
    tracker.consume({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1' }] },
    })
    expect(tracker.snapshot().phase).toBe('requesting')

    tracker.consume(blockStart('thinking'))
    expect(tracker.snapshot().phase).toBe('thinking')

    tracker.consume({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_2', name: 'Edit' }] },
    })
    expect(tracker.snapshot().phase).toBe('tool')
  })

  it('date le tour une fois, et cumule ce qu’il fait écrire', () => {
    // Ce que le CLI met entre parenthèses : une durée qui ne repart pas à chaque
    // phase, et un total de tokens qui ne repart pas à chaque réponse.
    const tracker = new ActivityTracker()
    tracker.consume(blockStart('thinking'))
    const opened = tracker.snapshot().turnStartedAt
    expect(opened).toBeGreaterThan(0)

    tracker.consume({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'ok' }], usage: { output_tokens: 900 } },
    })
    tracker.consume(blockStart('text'))
    tracker.consume({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'ok' }], usage: { output_tokens: 340 } },
    })

    expect(tracker.snapshot().turnStartedAt).toBe(opened)
    expect(tracker.snapshot().outputTokens).toBe(1240)

    tracker.consume({ type: 'result' })
    expect(tracker.snapshot().turnStartedAt).toBe(0)
    expect(tracker.snapshot().outputTokens).toBeUndefined()
  })

  it('efface tout à la fin du tour', () => {
    const tracker = new ActivityTracker()
    tracker.consume(blockStart('thinking'))
    tracker.consume({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 500 })
    expect(tracker.consume({ type: 'result' })).toBe('major')
    expect(tracker.snapshot()).toMatchObject({ phase: null, tools: [] })
    expect(tracker.snapshot().thinkingTokens).toBeUndefined()
    // Rien à effacer deux fois : le second passage ne diffuse pas de trame.
    expect(tracker.consume({ type: 'result' })).toBeNull()
  })
})
