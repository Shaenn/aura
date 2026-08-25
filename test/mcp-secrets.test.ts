// Ce que l'inventaire MCP dit du serveur, et ce qu'il en tait.
//
// Un serveur MCP porte ses secrets dans `env` : jeton GitHub, clé d'API, URL de
// base de données. L'inventaire les recopiait vers le navigateur, qui n'en fait
// rien — l'écran montre le transport et la commande, jamais l'environnement.
//
// Le retrait a un piège, et c'est lui que ce fichier garde. Le formulaire
// d'édition repose telles quelles les clés qu'il ne connaît pas : un `env`
// absent de ce qu'il a reçu est un `env` absent de ce qu'il renvoie. Sans
// reconduction côté serveur, changer la commande d'un serveur effacerait ses
// clés — une perte silencieuse, que rien à l'écran n'annoncerait.

import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type * as Mcp from '../server/mcp.ts'

let home: string
let claudeJson: string
let mcp: typeof Mcp

const CONFIG = {
  mcpServers: {
    github: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: 'ghp_secret_a_ne_pas_servir', REGION: 'eu' },
    },
    sansEnv: { command: 'node', args: ['serveur.js'] },
  },
  autreCle: { intacte: true },
}

/**
 * Les instantanés que l'écriture laisse derrière elle.
 *
 * `applyMcpWrite` sauvegarde avant d'écrire, et `BACKUPS_DIR` se déduit de
 * l'emplacement du module : il ne suit pas `AURA_CLAUDE_DIR`. Le bac à sable de
 * ce fichier ne le couvre donc pas, et sans ce ramassage chaque exécution
 * déposerait trois copies du `.claude.json` de test dans les sauvegardes de la
 * machine — jeton d'exemple compris.
 */
const laisses: string[] = []

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'aura-mcp-'))
  claudeJson = join(home, '.claude.json')
  // `mcp.ts` situe `~/.claude.json` à côté du dossier géré.
  process.env.AURA_CLAUDE_DIR = join(home, '.claude')
  mcp = await import('../server/mcp.ts')
})

afterAll(async () => {
  delete process.env.AURA_CLAUDE_DIR
  await rm(home, { recursive: true, force: true })
  for (const dir of laisses) await rm(dir, { recursive: true, force: true })
})

/** Applique, et retient l'instantané pour le retirer à la fin. */
async function applique(name: string, server: Parameters<typeof mcp.applyMcpWrite>[1]) {
  const { expectedHash } = await mcp.proposeMcpWrite(name, server)
  const { backupPath } = await mcp.applyMcpWrite(name, server, expectedHash)
  if (backupPath) laisses.push(dirname(backupPath))
}

beforeEach(async () => {
  await writeFile(claudeJson, JSON.stringify(CONFIG, null, 2))
})

describe('inventaire', () => {
  it('ne sert pas les valeurs d’environnement, seulement leurs noms', async () => {
    const inv = await mcp.getMcpInventory()
    const github = inv.globalServers.github
    expect(github?.env).toBeUndefined()
    expect(github?.envKeys).toEqual(['GITHUB_TOKEN', 'REGION'])
    expect(JSON.stringify(inv)).not.toContain('ghp_secret_a_ne_pas_servir')
  })

  it('laisse intact un serveur qui n’a pas d’environnement', async () => {
    const inv = await mcp.getMcpInventory()
    expect(inv.globalServers.sansEnv).toEqual({ command: 'node', args: ['serveur.js'] })
  })
})

describe('écriture', () => {
  /** Ce que le formulaire renvoie : ce qu'il a reçu, donc sans `env`. */
  const commeLeFront = { command: 'npx', args: ['-y', 'autre-serveur'], envKeys: ['GITHUB_TOKEN'] }

  const relire = async (): Promise<Record<string, Record<string, unknown>>> =>
    (JSON.parse(await readFile(claudeJson, 'utf8')) as { mcpServers: never }).mcpServers

  it('reconduit l’environnement que le client n’a pas reçu', async () => {
    await applique('github', commeLeFront)

    const servers = await relire()
    expect(servers.github?.env).toEqual({
      GITHUB_TOKEN: 'ghp_secret_a_ne_pas_servir',
      REGION: 'eu',
    })
    expect(servers.github?.args).toEqual(['-y', 'autre-serveur'])
    // `envKeys` est une vue : elle ne descend pas sur le disque.
    expect(servers.github).not.toHaveProperty('envKeys')
  })

  it('laisse écrire un environnement neuf quand il en vient un', async () => {
    const avecEnv = { command: 'npx', env: { GITHUB_TOKEN: 'nouveau' } }
    await applique('github', avecEnv)

    expect((await relire()).github?.env).toEqual({ GITHUB_TOKEN: 'nouveau' })
  })

  it('ne touche pas au reste du fichier', async () => {
    await applique('sansEnv', null)

    const obj = JSON.parse(await readFile(claudeJson, 'utf8')) as Record<string, unknown>
    expect(obj.autreCle).toEqual({ intacte: true })
    await expect(relire()).resolves.not.toHaveProperty('sansEnv')
  })
})
