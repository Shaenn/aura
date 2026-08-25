// Les dossiers inclus d'un projet, et le bac à sable qu'ils dessinent.
//
// C'est le troisième chemin qui sorte de `.claude`, et le seul dont l'étendue
// dépend d'un geste de l'utilisateur. La liste vit dans les préférences, donc
// dans un fichier que le front écrit : ce module doit tenir même si cette liste
// a été bricolée à la main. D'où les cas d'évasion, qui ne sont pas
// hypothétiques — c'est la seule chose qui sépare « voir mon dossier docs » de
// « lire n'importe quel fichier du projet ».

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { folderCandidates, listIncludedFolders, normalizeFolderRel, resolveIncludedFile, sanitizeFolders } from '../server/project-folders.ts'

describe('normalizeFolderRel', () => {
  it('accepte un chemin relatif, à plat ou imbriqué', () => {
    expect(normalizeFolderRel('docs')).toBe('docs')
    expect(normalizeFolderRel('docs/specs')).toBe('docs/specs')
    expect(normalizeFolderRel('docs\\specs')).toBe('docs/specs')
    expect(normalizeFolderRel('  docs/  ')).toBe('docs')
  })

  it('refuse toute forme qui pourrait sortir du projet', () => {
    expect(normalizeFolderRel('..')).toBeNull()
    expect(normalizeFolderRel('../secrets')).toBeNull()
    expect(normalizeFolderRel('docs/../..')).toBeNull()
    expect(normalizeFolderRel('/etc')).toBeNull()
    expect(normalizeFolderRel('C:/Windows')).toBeNull()
    expect(normalizeFolderRel('')).toBeNull()
  })

  // Le dossier a déjà son propre arbre : l'inclure en ferait un second.
  it('refuse .claude', () => {
    expect(normalizeFolderRel('.claude')).toBeNull()
    expect(normalizeFolderRel('.claude/agents')).toBeNull()
  })
})

describe('sanitizeFolders', () => {
  it('garde ce qui passe, jette le reste, et dédoublonne', () => {
    expect(sanitizeFolders(['docs', '../x', 'docs', 42, 'specs'])).toEqual(['docs', 'specs'])
  })

  it('rend une liste vide de ce qui n’est pas une liste', () => {
    expect(sanitizeFolders(undefined)).toEqual([])
    expect(sanitizeFolders('docs')).toEqual([])
    expect(sanitizeFolders({ 0: 'docs' })).toEqual([])
  })
})

describe('resolveIncludedFile', () => {
  const root = join(tmpdir(), 'projet')
  const folders = ['docs', 'notes/2026']

  it('ouvre un document sous un dossier inclus', () => {
    expect(resolveIncludedFile(root, 'docs/guide.md', folders)).toContain('guide.md')
    expect(resolveIncludedFile(root, 'docs/api/routes.md', folders)).toContain('routes.md')
    expect(resolveIncludedFile(root, 'notes/2026/janvier.txt', folders)).toContain('janvier.txt')
  })

  // Le dossier lui-même n'est pas un document, et un dossier dont le nom commence
  // pareil n'est pas le dossier inclus.
  it('n’ouvre rien hors des dossiers inclus', () => {
    expect(resolveIncludedFile(root, 'src/index.ts', folders)).toBeNull()
    expect(resolveIncludedFile(root, 'documentation/guide.md', folders)).toBeNull()
    expect(resolveIncludedFile(root, 'notes/2025/janvier.md', folders)).toBeNull()
    expect(resolveIncludedFile(root, 'docs', folders)).toBeNull()
  })

  it('n’ouvre que des documents', () => {
    expect(resolveIncludedFile(root, 'docs/build.sh', folders)).toBeNull()
    expect(resolveIncludedFile(root, 'docs/secrets.env', folders)).toBeNull()
    expect(resolveIncludedFile(root, 'docs/schema.json', folders)).toBeNull()
  })

  it('refuse une évasion, même déguisée en document', () => {
    expect(resolveIncludedFile(root, 'docs/../../.ssh/id_rsa.md', folders)).toBeNull()
    expect(resolveIncludedFile(root, '../docs/guide.md', folders)).toBeNull()
  })

  // Sans inclusion, la route ne peut rien ouvrir : c'est l'état par défaut de
  // tout projet.
  it('n’ouvre rien quand rien n’est inclus', () => {
    expect(resolveIncludedFile(root, 'docs/guide.md', [])).toBeNull()
  })
})

describe('parcours d’un projet', () => {
  let root = ''

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'aura-folders-'))
    await mkdir(join(root, 'docs', 'api'), { recursive: true })
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(join(root, 'node_modules', 'paquet'), { recursive: true })
    await writeFile(join(root, 'docs', 'guide.md'), '# Guide')
    await writeFile(join(root, 'docs', 'api', 'routes.md'), '# Routes')
    await writeFile(join(root, 'docs', 'logo.png'), 'binaire')
    await writeFile(join(root, 'src', 'index.ts'), 'export {};')
    await writeFile(join(root, 'node_modules', 'paquet', 'README.md'), '# Paquet')
    await writeFile(join(root, 'README.md'), '# Projet')
  })

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  /**
   * `~/.claude.json` range les chemins de projet en barres obliques, et c'est de
   * là que vient la racine. Le parcours les mêlait à celles que `join` produit,
   * comparait `C:\…\projet\docs` à `C:/…/projet\`, et refusait tout : l'arbre
   * annonçait le dossier et le montrait vide.
   */
  it('accepte une racine en barres obliques', async () => {
    const posix = root.replace(/\\/g, '/')
    const [folder] = await listIncludedFolders(posix, ['docs'])
    expect(folder?.files).toHaveLength(2)
    expect(resolveIncludedFile(posix, 'docs/guide.md', ['docs'])).toContain('guide.md')
  })

  it('ne rend que les documents, avec un rel parti de la racine', async () => {
    const [folder] = await listIncludedFolders(root, ['docs'])
    expect(folder?.files.map((f) => f.rel)).toEqual(['docs/api/routes.md', 'docs/guide.md'])
    expect(folder?.files.every((f) => f.category === 'included')).toBe(true)
  })

  it('rend un groupe vide pour un dossier disparu, pour qu’on puisse le retirer', async () => {
    const [folder] = await listIncludedFolders(root, ['disparu'])
    expect(folder).toEqual({ rel: 'disparu', files: [] })
  })

  it('propose les dossiers à documents, parents compris, et compte le sous-arbre', async () => {
    const candidates = await folderCandidates(root, new Set(['node_modules']), ['docs'])
    const byRel = new Map(candidates.map((c) => [c.rel, c]))
    expect(byRel.get('docs')?.docs).toBe(2) // guide.md + api/routes.md
    expect(byRel.get('docs/api')?.docs).toBe(1)
    expect(byRel.get('docs')?.included).toBe(true)
    // Ni le code, ni les dossiers lourds, ni la racine elle-même.
    expect(byRel.has('src')).toBe(false)
    expect(byRel.has('node_modules')).toBe(false)
    expect(byRel.has('')).toBe(false)
  })
})
