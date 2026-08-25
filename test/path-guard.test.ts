// La garde de chemin, prise par où elle cédait.
//
// La denylist comparait des chaînes octet par octet sur un système de fichiers
// qui, lui, ne fait pas la différence. `.credentials.json` était refusé,
// `.Credentials.json` ouvrait le même fichier — soit le jeton du compte, servi
// par une requête à un caractère près de celle qu'on refusait.
//
// Les cas ci-dessous sont les trois façons de désigner un fichier sans l'écrire
// comme la liste l'écrit : la casse, le lien, et le nom court de Windows. Ils
// tournent sur un faux dossier `.claude`, pas sur le vôtre.

import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type * as Paths from '../server/claude/paths.ts'

let root: string
let outside: string
let paths: typeof Paths

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'aura-guard-'))
  outside = await mkdtemp(join(tmpdir(), 'aura-hors-'))
  await writeFile(join(root, '.credentials.json'), '{"token":"secret"}')
  await mkdir(join(root, 'agents'))
  await writeFile(join(root, 'agents', 'relecteur.md'), '# Relecteur')
  await mkdir(join(root, 'sessions'))
  await writeFile(join(root, 'sessions', 'privee.jsonl'), '{"prompt":"privé"}')
  await writeFile(join(outside, 'butin.txt'), 'rien à voir ici')

  // Le module lit la racine au chargement : elle doit être posée avant l'import.
  process.env.AURA_CLAUDE_DIR = root
  paths = await import('../server/claude/paths.ts')
})

afterAll(async () => {
  delete process.env.AURA_CLAUDE_DIR
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('isDenied', () => {
  it('refuse le secret quelle que soit la casse', () => {
    for (const nom of ['.credentials.json', '.Credentials.json', '.CREDENTIALS.JSON']) {
      expect(paths.isDenied(nom)).toBe(true)
    }
  })

  it('refuse les zones privées quelle que soit la casse', () => {
    for (const nom of ['sessions', 'Sessions', 'File-History/x.json', 'STATSIG/a']) {
      expect(paths.isDenied(nom)).toBe(true)
    }
  })

  it('laisse passer ce qui n’est pas listé', () => {
    expect(paths.isDenied('agents/relecteur.md')).toBe(false)
  })
})

describe('isWritable', () => {
  it('accepte les deux fichiers nommés, dans leur casse d’usage', () => {
    expect(paths.isWritable('settings.json')).toBe(true)
    expect(paths.isWritable('CLAUDE.md')).toBe(true)
  })

  it('accepte les zones éditables et refuse le reste', () => {
    expect(paths.isWritable('agents/relecteur.md')).toBe(true)
    expect(paths.isWritable('telemetry/a.json')).toBe(false)
    expect(paths.isWritable('.credentials.json')).toBe(false)
  })
})

describe('resolveForRead', () => {
  it('refuse le secret écrit dans une autre casse', () => {
    expect(() => paths.resolveForRead('.Credentials.json')).toThrow(paths.PathError)
  })

  it('rend le nom que le disque emploie, pas celui qu’on a demandé', () => {
    // C'est ce qui fait tenir la denylist : elle juge la forme canonique.
    expect(paths.resolveForRead('AGENTS/relecteur.md').rel).toBe('agents/relecteur.md')
  })

  it('refuse un chemin qui remonte hors de la racine', () => {
    expect(() => paths.resolveForRead('../hors.txt')).toThrow(paths.PathError)
  })

  // Des jonctions, et non des liens de fichier : Windows n'accorde ces derniers
  // qu'à un compte privilégié, si bien qu'un cas écrit avec eux se sauterait en
  // silence sur le poste même où il compte.
  it('refuse une jonction qui sort de la racine', async () => {
    try {
      await symlink(outside, join(root, 'evasion'), 'junction')
    } catch {
      return // même les jonctions sont refusées ici : le reste des cas suffit.
    }
    expect(() => paths.resolveForRead('evasion/butin.txt')).toThrow(paths.PathError)
  })

  it('refuse une zone privée atteinte par une jonction interne', async () => {
    // Le nom demandé — `agents/archives` — n'est dans aucune liste. Seule la
    // forme canonique dit qu'il mène à `sessions`, et c'est elle qu'on juge.
    try {
      await symlink(join(root, 'sessions'), join(root, 'agents', 'archives'), 'junction')
    } catch {
      return
    }
    // Le refus doit venir de la denylist, pas d'un fichier introuvable : c'est
    // la canonisation qui a fait apparaître `sessions` derrière `agents`.
    expect(paths.resolveSafe('agents/archives/privee.jsonl').rel).toBe('sessions/privee.jsonl')
    expect(() => paths.resolveForRead('agents/archives/privee.jsonl')).toThrow(/ne lis pas ce chemin/)
  })
})
