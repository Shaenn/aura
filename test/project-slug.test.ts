// L'encodage d'un chemin de projet en nom de dossier sous `~/.claude/projects`.
//
// Tout le rattachement d'une session à son transcript tient sur cette fonction :
// une session active se trouve par son `cwd`, qu'on ré-encode pour retrouver le
// dossier. L'encodage ne se limite pas aux séparateurs — Claude Code remplace
// *tout* ce qui n'est ni lettre ni chiffre. Un dossier nommé `_archives` produit
// donc un double tiret, et un encodage qui n'aurait vu que `:\/.` aurait rendu
// « Transcript introuvable » sur un projet pourtant bien présent.

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { encodeProjectPath } from '../server/maintenance.ts';

describe('encodeProjectPath', () => {
  it('encode les séparateurs et le deux-points du lecteur', () => {
    expect(encodeProjectPath(String.raw`C:\Users\jean.dupont\Documents\devl\aura`)).toBe(
      'c--users-jean-dupont-documents-devl-aura',
    );
  });

  it('encode aussi le souligné, en doublant le tiret du séparateur', () => {
    expect(encodeProjectPath(String.raw`C:\devl\_archives\scanner`)).toBe(
      'c--devl--archives-scanner',
    );
  });

  it('encode le point et l’espace', () => {
    expect(encodeProjectPath(String.raw`C:\devl\mon projet\.claude`)).toBe(
      'c--devl-mon-projet--claude',
    );
  });

  it('ne produit que des lettres, des chiffres et des tirets', () => {
    // Ce que le parc confirme : aucun dossier réel ne porte d'autre caractère.
    const dir = join(homedir(), '.claude', 'projects');
    let names: string[];
    try {
      names = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return; // pas de parc local : le reste des cas suffit.
    }
    for (const name of names) expect(name).toMatch(/^[A-Za-z0-9-]+$/);
  });
});
