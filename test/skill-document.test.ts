// Le manuel d'un skill, reconnu dans le fil.
//
// L'enjeu tient en un chiffre : le plus gros document du parc fait 659 354
// caractères, et déplié il occupait 95 % de la hauteur de sa page. Le rendre en
// prose comme n'importe quel texte n'était pas une question de goût.
//
// Deux marqueurs, et il faut les deux : `sourceToolUseID` (18 lignes du parc,
// les 18 sur un appel `Skill`) et l'en-tête `Base directory for this skill:`
// (58 lignes, dont 44 sans l'autre marqueur). Leur union fait 62 injections.

import { describe, expect, it } from 'vitest'
import { skillDocument } from '../src/components/replay/skillDocument.ts'

const head = (dir: string, body: string): string => `Base directory for this skill: ${dir}\n\n${body}`

describe('manuel de skill', () => {
  it('lit le nom et le corps sous l’en-tête', () => {
    const doc = skillDocument(head('C:\\Users\\jean.dupont\\Documents\\p\\.claude\\skills\\pipeline-feature', '# Pipeline\n\nDeux.'))
    expect(doc?.name).toBe('pipeline-feature')
    expect(doc?.body).toBe('# Pipeline\n\nDeux.')
    expect(doc?.lines).toBe(3)
  })

  it('retire la ligne vide qui suit l’en-tête, sur les 58 injections qui en ont une', () => {
    const doc = skillDocument(head('/home/jean.dupont/.claude/skills/run', '# Run'))
    expect(doc?.body.startsWith('\n')).toBe(false)
  })

  it('nomme d’après l’appel quand le texte n’a pas d’en-tête', () => {
    // Les 4 injections sans en-tête du parc — `artifact-design` ouvre sur sa
    // consigne, et rien dans son texte ne dit de quel skill il s'agit.
    const doc = skillDocument('Approach this as the design lead…', 'artifact-design')
    expect(doc?.name).toBe('artifact-design')
    expect(doc?.body).toBe('Approach this as the design lead…')
    expect(doc?.dir).toBe('')
    expect(doc?.origin).toBe('')
  })

  it('préfère le nom de l’appel à celui du dossier', () => {
    // Le dossier d'une extension ne porte pas son préfixe : `…/superpowers/
    // 5.0.7/skills/brainstorming` pour un appel `superpowers:brainstorming`.
    const doc = skillDocument(
      head('/home/jean.dupont/.claude/plugins/cache/o/superpowers/5.0.7/skills/brainstorming', '# B'),
      'superpowers:brainstorming',
    )
    expect(doc?.name).toBe('superpowers:brainstorming')
  })

  // La provenance est une clé de catalogue, pas un mot : le libellé se choisit à
  // l'affichage, dans la langue du moment.
  it('dit d’où vient le skill, sur les quatre provenances du parc', () => {
    const origin = (dir: string): string | undefined => skillDocument(head(dir, 'x'))?.origin
    expect(origin('C:\\T\\claude\\bundled-skills\\2.1.221\\ab\\claude-api')).toBe('bundled')
    expect(origin('C:\\U\\x\\.claude\\plugins\\cache\\o\\superpowers\\5.0.7\\skills\\b')).toBe('plugin')
    expect(origin('C:\\U\\x\\Documents\\devl\\p\\.claude\\skills\\role-qa')).toBe('project')
    expect(origin('C:\\U\\x\\.claude\\skills\\create-skill')).toBe('personal')
  })

  it('ne reconnaît rien sans marqueur', () => {
    expect(skillDocument('Continue from where you left off.')).toBeNull()
    // L'en-tête doit ouvrir le texte : un rapport qui la cite n'en est pas un.
    expect(skillDocument('Le rapport dit : Base directory for this skill: /x/y')).toBeNull()
  })

  it('ne rend pas un document sans nom', () => {
    expect(skillDocument(head('', '# rien'))).toBeNull()
  })
})
