// Le nom d'un instantané est une donnée du client comme une autre.
//
// L'ancien filtre retirait les séparateurs mais gardait le point : `..` passait
// intact. `purgeBackups('..')` désignait alors le dossier parent des instantanés
// — soit tout `.local/` — et l'effaçait récursivement, préférences comprises.
// Le même chemin servait à lire hors du dossier des sauvegardes.
//
// La forme d'un instantané est connue : c'est l'instant ISO du fichier sauvé,
// deux-points et points devenus tirets. On la vérifie, plutôt que d'essayer de
// retirer ce qui gêne.
//
// `BACKUPS_DIR` se déduit de l'emplacement du module et ne se surcharge pas :
// les cas tournent donc dans le vrai dossier, sur un instantané au nom réservé
// que ce fichier crée et retire lui-même. Les refus, eux, ne touchent rien —
// c'est tout leur objet.
//
// Ce vrai dossier est partagé : `mcp-secrets` y dépose et y retire ses propres
// instantanés, en parallèle de ce fichier. Photographier tout le dossier rendait
// le cas intermittent. Ce qui ne doit pas bouger est donc un instantané voisin
// que ce fichier pose lui-même, et non le contenu du dossier entier.

import { mkdir, rm, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { purgeBackup, readBackup } from '../server/backups.ts'
import { BACKUPS_DIR, LOCAL_DIR } from '../server/paths.ts'

/** Une date d'instantané que le parc ne peut pas porter : elle est inventée. */
const STAMP = '1999-01-01T00-00-00-001Z'
const stampDir = join(BACKUPS_DIR, STAMP)

/** Le voisin qu'une purge trop large emporterait avec l'instantané visé. */
const VOISIN = '1999-01-01T00-00-00-002Z'
const voisinDir = join(BACKUPS_DIR, VOISIN)

/**
 * Le voisin des sauvegardes, celui qu'une évasion d'un cran emporterait.
 *
 * Posé par ce fichier, et non emprunté à l'installation : `preferences.json`
 * ferait l'affaire sur un poste qui a déjà lancé l'application, et manquerait
 * sur un clone neuf comme sur un exécuteur de CI — le cas passerait au rouge
 * sans qu'aucune garde ait cédé.
 */
const temoin = join(LOCAL_DIR, 'temoin-purge.txt')

async function existe(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  )
}

beforeEach(async () => {
  await mkdir(stampDir, { recursive: true })
  await writeFile(join(stampDir, 'settings.json'), '{"ancien":true}')
  await mkdir(voisinDir, { recursive: true })
  await writeFile(join(voisinDir, 'settings.json'), '{"voisin":true}')
  await writeFile(temoin, 'à ne pas emporter')
})

afterEach(async () => {
  await rm(stampDir, { recursive: true, force: true })
  await rm(voisinDir, { recursive: true, force: true })
  await rm(temoin, { force: true })
})

describe('purgeBackup', () => {
  it('refuse un nom qui n’est pas un instantané', async () => {
    // `''` compte parmi eux : il valait « tout effacer » par omission, et c'est
    // ainsi que les sauvegardes de ce poste ont disparu en écrivant ce fichier.
    for (const nom of ['..', '.', 'backups', '2026-08-13', '..\\..\\autre', 'a.b', '']) {
      await expect(purgeBackup(nom)).rejects.toThrow('Instantané inconnu.')
    }
    // Rien n'a bougé : ni les instantanés, ni ce qui vit à côté d'eux.
    await expect(existe(stampDir)).resolves.toBe(true)
    await expect(existe(voisinDir)).resolves.toBe(true)
    await expect(existe(temoin)).resolves.toBe(true)
  })

  it('efface l’instantané qu’on lui nomme, et lui seul', async () => {
    await purgeBackup(STAMP)
    await expect(existe(stampDir)).resolves.toBe(false)
    await expect(existe(voisinDir)).resolves.toBe(true)
    await expect(existe(temoin)).resolves.toBe(true)
  })
})

describe('readBackup', () => {
  it('refuse de lire hors du dossier des instantanés', async () => {
    await expect(readBackup('..', 'preferences.json')).rejects.toThrow('Instantané inconnu.')
    await expect(readBackup(STAMP, '../../preferences.json')).rejects.toThrow('Chemin de backup invalide.')
  })

  it('lit le fichier sauvegardé', async () => {
    await expect(readBackup(STAMP, 'settings.json')).resolves.toBe('{"ancien":true}')
  })
})
