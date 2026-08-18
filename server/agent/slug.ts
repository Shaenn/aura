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
//
// Cette dérivation cesse d'être vraie si `CLAUDE_CODE_PROJECT_DIR_NAME` est
// posée dans l'environnement : depuis le CLI 2.1.234, elle laisse choisir le nom
// du dossier de transcript au lieu de le tirer du `cwd`. Les deux sens tombent
// alors ensemble, et sans un bruit — c'est la panne décrite au-dessus, mais que
// rien dans le `cwd` ne laisse deviner. AURA ne pose pas cette variable et ne
// passe aucun `env` au SDK ; elle ne peut venir que de l'environnement du
// serveur, et c'est là qu'il faudra la chercher le jour où un transcript
// existant se met à manquer à l'appel.

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export function projectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * Le `cwd` sous sa forme longue.
 *
 * Mesuré avant d'écrire l'Atelier : lancé avec un chemin court Windows
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
