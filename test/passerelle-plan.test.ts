import { describe, expect, it } from 'vitest'
import { planPropose } from '../server/passerelle/plan.ts'
import type { PermissionRequest } from '../shared/agent.ts'

function demande(over: Partial<PermissionRequest>): PermissionRequest {
  return {
    id: 'p1',
    toolName: 'ExitPlanMode',
    input: {},
    toolUseId: 't1',
    askedAt: 0,
    ...over,
  }
}

describe('planPropose', () => {
  it('rend le markdown du plan', () => {
    const plan = '# Plan\n\nUne étape.'
    expect(planPropose(demande({ input: { plan } }))).toBe(plan)
  })

  /**
   * La forme mesurée sur le parc : `plan` **et** `planFilePath`. Le fichier
   * n'est pas lisible de loin, c'est donc le texte qu'on lit — et sa présence
   * ne doit pas dépendre de l'autre champ.
   */
  it('ignore le fichier qui accompagne le plan', () => {
    const entree = { plan: 'Le plan.', planFilePath: 'C:\\plans\\x.md' }
    expect(planPropose(demande({ input: entree }))).toBe('Le plan.')
  })

  it('se tait pour tout autre outil', () => {
    expect(planPropose(demande({ toolName: 'Write', input: { plan: 'Le plan.' } }))).toBe('')
  })

  it('se tait sur un plan vide, pour retomber sur le bandeau ordinaire', () => {
    expect(planPropose(demande({ input: { plan: '   ' } }))).toBe('')
    expect(planPropose(demande({ input: {} }))).toBe('')
    expect(planPropose(demande({ input: { plan: 42 } }))).toBe('')
  })
})
