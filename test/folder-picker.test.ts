// Le point d'ouverture du sélecteur de dossier.
//
// La boîte de dialogue Windows échoue en silence : donnez-lui un départ qu'elle
// n'accepte pas, et elle s'ouvre sur son dossier par défaut sans un mot. Deux
// façons de la fâcher, toutes deux rencontrées pour de vrai :
//
//  - des barres obliques — `SelectedPath` les accepte, la propriété les relit
//    telles quelles, et c'est `IFileDialog::SetFolder` qui les refuse à
//    l'ouverture. Or l'API des projets rend précisément `C:/Users/…` ;
//  - un dossier absent, ignoré de la même manière.
//
// Le symptôme observé — « ça ouvre Documents, mais pas le sous-dossier devl » —
// ne dit rien de sa cause. Ce test la fixe.

import { describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import { normalizeStart } from '../server/agent/folder.ts';

const HOME = homedir();

describe('normalizeStart', () => {
  it('convertit les barres obliques en séparateurs natifs', () => {
    const posix = HOME.replace(/\\/g, '/');
    expect(normalizeStart(posix)).toBe(HOME);
    expect(normalizeStart(posix)).not.toContain('/');
  });

  it('remonte au premier parent qui existe', () => {
    const ghost = join(HOME, 'ce-dossier-nexiste-pas-xyz', 'ni-celui-ci');
    expect(normalizeStart(ghost)).toBe(HOME);
  });

  it('garde un dossier existant tel quel', () => {
    expect(normalizeStart(HOME)).toBe(HOME);
  });

  it('rend `undefined` plutôt qu’un départ vide, pour laisser le défaut du système', () => {
    expect(normalizeStart(undefined)).toBeUndefined();
    expect(normalizeStart('')).toBeUndefined();
    expect(normalizeStart('   ')).toBeUndefined();
  });

  it('ne rend jamais un chemin relatif : la boîte n’en veut pas', () => {
    const out = normalizeStart('..');
    expect(out === undefined || out.includes(sep)).toBe(true);
  });
});
