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

import { mkdir, rm, writeFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BACKUPS_DIR, LOCAL_DIR } from '../server/paths.ts';
import { purgeBackup, readBackup } from '../server/backups.ts';

/** Une date d'instantané que le parc ne peut pas porter : elle est inventée. */
const STAMP = '1999-01-01T00-00-00-001Z';
const stampDir = join(BACKUPS_DIR, STAMP);

/**
 * Le voisin des sauvegardes, celui qu'une évasion d'un cran emporterait.
 *
 * Posé par ce fichier, et non emprunté à l'installation : `preferences.json`
 * ferait l'affaire sur un poste qui a déjà lancé l'application, et manquerait
 * sur un clone neuf comme sur un exécuteur de CI — le cas passerait au rouge
 * sans qu'aucune garde ait cédé.
 */
const temoin = join(LOCAL_DIR, 'temoin-purge.txt');

const existe = async (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  await mkdir(stampDir, { recursive: true });
  await writeFile(join(stampDir, 'settings.json'), '{"ancien":true}');
  await writeFile(temoin, 'à ne pas emporter');
});

afterEach(async () => {
  await rm(stampDir, { recursive: true, force: true });
  await rm(temoin, { force: true });
});

describe('purgeBackup', () => {
  it('refuse un nom qui n’est pas un instantané', async () => {
    const avant = await readdir(BACKUPS_DIR);
    // `''` compte parmi eux : il valait « tout effacer » par omission, et c'est
    // ainsi que les sauvegardes de ce poste ont disparu en écrivant ce fichier.
    for (const nom of ['..', '.', 'backups', '2026-08-13', '..\\..\\autre', 'a.b', '']) {
      await expect(purgeBackup(nom)).rejects.toThrow();
    }
    // Rien n'a bougé : ni les instantanés, ni ce qui vit à côté d'eux.
    expect(await readdir(BACKUPS_DIR)).toEqual(avant);
    expect(await existe(temoin)).toBe(true);
  });

  it('efface l’instantané qu’on lui nomme, et lui seul', async () => {
    const voisins = (await readdir(BACKUPS_DIR)).filter((d) => d !== STAMP);
    await purgeBackup(STAMP);
    expect(await existe(stampDir)).toBe(false);
    expect((await readdir(BACKUPS_DIR)).sort()).toEqual(voisins.sort());
  });
});

describe('readBackup', () => {
  it('refuse de lire hors du dossier des instantanés', async () => {
    await expect(readBackup('..', 'preferences.json')).rejects.toThrow();
    await expect(readBackup(STAMP, '../../preferences.json')).rejects.toThrow();
  });

  it('lit le fichier sauvegardé', async () => {
    expect(await readBackup(STAMP, 'settings.json')).toBe('{"ancien":true}');
  });
});
