// La liste des fichiers proposés derrière un `@`.
//
// C'est le seul endroit du BFF qui lit des noms hors de `~/.claude`, et la seule
// garantie qui compte est structurelle : la racine vient du `cwd` de la session,
// jamais d'un paramètre. Ce que ces tests tiennent, c'est le reste — qu'on ne
// propose pas ce qu'on refuserait de lire, et qu'un dossier lourd ne se déverse
// pas dans le menu.
//
// Le parcours testé est celui des dossiers **sans** dépôt git : quand il y en a
// un, c'est `git ls-files` qui répond, et c'est son `.gitignore` qui exclut.

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listProjectFiles } from '../server/agent/files.ts';

/** Un dossier jetable, avec les pièges habituels d'une arborescence réelle. */
async function tree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aura-files-'));
  await mkdir(join(root, 'src', 'deep'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'left-pad'), { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });

  await writeFile(join(root, 'README.md'), '#');
  await writeFile(join(root, '.env'), 'TOKEN=1');
  await writeFile(join(root, 'secrets.json'), '{}');
  await writeFile(join(root, 'src', 'app.ts'), '//');
  await writeFile(join(root, 'src', 'deep', 'util.ts'), '//');
  await writeFile(join(root, 'node_modules', 'left-pad', 'index.js'), '//');
  await writeFile(join(root, '.git', 'HEAD'), 'ref');
  await writeFile(join(root, 'dist', 'bundle.js'), '//');
  return root;
}

describe('listProjectFiles', () => {
  it('rend les fichiers du projet, chemins relatifs et séparateurs uniformes', async () => {
    const { files } = await listProjectFiles(await tree());

    expect(files).toContain('README.md');
    expect(files).toContain('src/app.ts');
    expect(files).toContain('src/deep/util.ts');
    // Jamais de séparateur Windows : le chemin s'écrit dans un prompt, et c'est
    // celui-là que le modèle relira.
    expect(files.every((f) => !f.includes('\\'))).toBe(true);
  });

  it('ne propose pas ce que le BFF refuserait de lire', async () => {
    const { files } = await listProjectFiles(await tree());

    expect(files).not.toContain('.env');
    expect(files).not.toContain('secrets.json');
  });

  it('laisse dehors les dossiers lourds ou engendrés', async () => {
    const { files } = await listProjectFiles(await tree());

    expect(files.filter((f) => f.startsWith('node_modules/'))).toEqual([]);
    expect(files.filter((f) => f.startsWith('.git/'))).toEqual([]);
    expect(files.filter((f) => f.startsWith('dist/'))).toEqual([]);
  });

  it('rend une liste vide plutôt qu’une erreur sur un dossier absent', async () => {
    const { files, truncated } = await listProjectFiles(join(tmpdir(), 'aura-absent-xyz'));

    expect(files).toEqual([]);
    expect(truncated).toBe(false);
  });
});
