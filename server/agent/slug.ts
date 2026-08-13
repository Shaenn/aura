// Où le SDK écrit le transcript d'une session.
//
// Le CLI dérive le nom du dossier de projet du `cwd`, en remplaçant **chaque**
// caractère non alphanumérique par un tiret, **sans fusionner** les tirets
// consécutifs ni traiter le point à part :
//
//   C:\Users\jean.dupont  →  C--Users-jean-dupont
//
// Le miroir de cet encodeur vit côté front (`src/utils/slug.ts` en donne la
// lecture inverse, approximative). Ici on n'a besoin que du sens aller, mais il
// doit être exact au caractère près : un slug faux ne casse rien bruyamment, il
// rend simplement le transcript introuvable.

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export function projectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * Le `cwd` sous sa forme longue.
 *
 * Relevé au spike de Phase 0 : lancé avec un chemin court Windows
 * (`C:\Users\JEANDU~1.DUP\...`), le modèle hallucine un chemin voisin, échoue en
 * `EPERM`, appelle `pwd` pour se rattraper — trois tours perdus avant le premier
 * travail utile. `realpath` résout le 8.3 ; on retombe sur `resolve` si le
 * chemin n'existe pas encore, pour que l'erreur vienne du SDK et dise pourquoi.
 */
export function longPath(cwd: string): string {
  try {
    return realpathSync.native(resolve(cwd));
  } catch {
    return resolve(cwd);
  }
}
