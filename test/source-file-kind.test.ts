// La liste blanche des fichiers lisibles hors de `.claude`.
//
// C'est la seule sortie du dossier `.claude` d'un projet, et elle sert aux deux
// bouts : le parcours ne récolte que ce qu'elle nomme, la lecture n'ouvre que ce
// qu'elle nomme. Un faux positif ici, et le BFF ouvre un fichier arbitraire de
// l'arborescence des sources — d'où les cas d'évasion en fin de fichier.

import { describe, expect, it } from 'vitest'
import { sourceFileKind } from '../server/projects.ts'

describe('instructions d’agents — tout l’arbre', () => {
  it('reconnaît CLAUDE.md et ses équivalents, à n’importe quelle profondeur', () => {
    expect(sourceFileKind('CLAUDE.md')).toBe('memory')
    expect(sourceFileKind('server/CLAUDE.md')).toBe('memory')
    expect(sourceFileKind('packages/ui/src/AGENTS.md')).toBe('memory')
    expect(sourceFileKind('GEMINI.md')).toBe('memory')
    expect(sourceFileKind('.cursorrules')).toBe('memory')
    expect(sourceFileKind('front/.windsurfrules')).toBe('memory')
    expect(sourceFileKind('.github/copilot-instructions.md')).toBe('memory')
  })

  it('ignore la casse — Windows et macOS ne la distinguent pas', () => {
    expect(sourceFileKind('claude.md')).toBe('memory')
    expect(sourceFileKind('src/Agents.MD')).toBe('memory')
  })

  it('ne prend pas un fichier dont le nom commence pareil', () => {
    expect(sourceFileKind('CLAUDE.md.bak')).toBeNull()
    expect(sourceFileKind('AGENTS.ts')).toBeNull()
    expect(sourceFileKind('docs/copilot-instructions.md')).toBeNull()
  })
})

describe('documents du dépôt — la racine seule', () => {
  it('reconnaît les documents classiques, avec ou sans extension', () => {
    expect(sourceFileKind('README.md')).toBe('repo')
    expect(sourceFileKind('CONTRIBUTING.md')).toBe('repo')
    expect(sourceFileKind('LICENSE')).toBe('repo')
    expect(sourceFileKind('COPYING')).toBe('repo')
    expect(sourceFileKind('README.rst')).toBe('repo')
    expect(sourceFileKind('CHANGELOG.txt')).toBe('repo')
    expect(sourceFileKind('CODE_OF_CONDUCT.md')).toBe('repo')
  })

  // Sinon un monorepo remonterait un README par paquet, et la liste n'aurait plus
  // de fin. Seul un CLAUDE.md a le statut qui justifie la profondeur.
  it('ne descend pas dans les sous-dossiers', () => {
    expect(sourceFileKind('packages/ui/README.md')).toBeNull()
    expect(sourceFileKind('docs/CHANGELOG.md')).toBeNull()
  })

  it('accepte les gabarits de .github, dont le chemin est fixe', () => {
    expect(sourceFileKind('.github/PULL_REQUEST_TEMPLATE.md')).toBe('repo')
    expect(sourceFileKind('.github/ISSUE_TEMPLATE/bug.md')).toBe('repo')
    expect(sourceFileKind('.github/ISSUE_TEMPLATE/config.yml')).toBe('repo')
    expect(sourceFileKind('.github/workflows/ci.yml')).toBeNull()
    expect(sourceFileKind('.github/ISSUE_TEMPLATE/nested/x.md')).toBeNull()
  })
})

describe('ce qui reste dehors', () => {
  it('refuse un fichier quelconque', () => {
    expect(sourceFileKind('server/index.ts')).toBeNull()
    expect(sourceFileKind('.env')).toBeNull()
    expect(sourceFileKind('package.json')).toBeNull()
  })

  // La lecture vérifie aussi le préfixe de chemin ; ces cas figent la seconde
  // garde, celle qui tient même si la première tombait.
  it('refuse une évasion, y compris vers un nom autorisé', () => {
    expect(sourceFileKind('../README.md')).toBeNull()
    expect(sourceFileKind('../.github/PULL_REQUEST_TEMPLATE.md')).toBeNull()
    expect(sourceFileKind('..')).toBeNull()
  })

  // Une instruction d'agent reste reconnue à n'importe quelle profondeur : la
  // remontée, elle, est arrêtée par la vérification de préfixe côté lecture.
  it('reconnaît encore un CLAUDE.md remonté, que le préfixe rejettera', () => {
    expect(sourceFileKind('../CLAUDE.md')).toBe('memory')
  })
})
