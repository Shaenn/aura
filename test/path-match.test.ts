// Le classement et la mise en arbre des chemins derrière le `@` de l'Atelier.
//
// Deux exigences s'y croisent, et elles tirent dans des sens opposés :
// l'arborescence doit être **prévisible** — donc triée comme un explorateur,
// dossiers puis fichiers, par ordre alphabétique — et la touche Entrée doit
// insérer la **meilleure réponse**, que l'alphabet ne sait pas désigner. D'où
// `best`, calculé sur la pertinence et rendu à part de l'affichage.
//
// Rien n'est tronqué à l'affichage : ce qui borne la liste, c'est ce que le
// dépôt ignore (côté serveur) et ce que l'utilisateur replie.

import { describe, expect, it } from 'vitest';
import { treeRows } from '../src/utils/pathMatch.ts';

const FILES = [
  'README.md',
  'package.json',
  'src/components/agent/SessionComposer.vue',
  'src/components/ui/SegmentedControl.vue',
  'src/composables/useLiveSession.ts',
  'src/services/agent/index.ts',
  'src/services/projects/index.ts',
  'server/agent/files.ts',
  'server/agent/runner.ts',
  'app/MainWindow.xaml',
  'app/MainWindow.xaml.cs',
];

/** Les fichiers retenus, dans l'ordre où le clavier les parcourt. */
const files = (query: string): string[] =>
  treeRows(FILES, query)
    .rows.filter((r) => r.kind === 'file')
    .map((r) => r.path);

/** Le rendu tel qu'il s'affiche, indentation comprise. */
const drawn = (query: string, collapsed?: Set<string>): string[] =>
  treeRows(FILES, query, collapsed).rows.map(
    (r) => '  '.repeat(r.depth) + (r.kind === 'dir' ? `${r.label}/` : r.label),
  );

describe('treeRows — ce qui est retenu', () => {
  it('cherche par extension seule, ce qu’on tape le plus souvent', () => {
    expect(files('cs')).toEqual(['app/MainWindow.xaml.cs']);
    // Le `.xaml` d'abord, son code-behind juste après : son nom contient bien
    // « xaml », et pour qui travaille en WPF c'est le fichier jumeau, pas du bruit.
    expect(files('xaml')).toEqual(['app/MainWindow.xaml', 'app/MainWindow.xaml.cs']);
    expect(files('ts').every((p) => p.endsWith('.ts'))).toBe(true);
  });

  it('accepte le point, écrit ou non', () => {
    expect(files('.xaml')).toEqual(files('xaml'));
  });

  it('ne pêche pas au chalut sur une saisie courte', () => {
    // `cs` en sous-séquence ramenait sept chemins sur onze : un `c` suivi d'un
    // `s` se trouve à peu près partout. Sous quatre caractères, seules les
    // correspondances franches comptent — sauf si la saisie porte un `/`.
    expect(files('cs')).toEqual(['app/MainWindow.xaml.cs']);
    expect(files('ui/')).toEqual(['src/components/ui/SegmentedControl.vue']);
  });

  it('écarte le remplissage dès qu’il existe mieux', () => {
    // `composer` trouvait 54 chemins sur ce dépôt, dont 53 parce que ces lettres
    // se suivent quelque part dans leur dossier. Seuls le meilleur rang et le
    // suivant sont gardés.
    expect(files('composer')).toEqual(['src/components/agent/SessionComposer.vue']);
  });

  it('écarte ce qui ne correspond pas du tout', () => {
    expect(treeRows(FILES, 'zzz').rows).toEqual([]);
  });
});

describe('treeRows — l’arbre', () => {
  it('emboîte les segments, un par ligne, sans jamais montrer un chemin', () => {
    expect(drawn('index')).toEqual([
      'src/services/',
      '  agent/',
      '    index.ts',
      '  projects/',
      '    index.ts',
    ]);
  });

  it('fond les dossiers à enfant unique : une branche, pas un couloir', () => {
    expect(drawn('src/services/agent/')).toEqual(['src/services/agent/', '  index.ts']);
  });

  it('trie comme un explorateur : dossiers puis fichiers, par ordre alphabétique', () => {
    // Sans saisie, tout correspond : c'est l'arbre entier qui se montre, et
    // c'est là que l'ordre se vérifie le mieux.
    expect(drawn('')).toEqual([
      'app/',
      '  MainWindow.xaml',
      '  MainWindow.xaml.cs',
      'server/agent/',
      '  files.ts',
      '  runner.ts',
      'src/',
      '  components/',
      '    agent/',
      '      SessionComposer.vue',
      '    ui/',
      '      SegmentedControl.vue',
      '  composables/',
      '    useLiveSession.ts',
      '  services/',
      '    agent/',
      '      index.ts',
      '    projects/',
      '      index.ts',
      'package.json',
      'README.md',
    ]);
  });

  it('désigne la meilleure réponse à part, puisque l’alphabet l’ignore', () => {
    // `runner` sort en troisième branche à l'affichage, mais c'est lui qu'Entrée
    // doit insérer : `best` le dit, l'ordre des lignes ne le pouvait pas.
    expect(treeRows(FILES, 'runner').best).toBe('server/agent/runner.ts');
    expect(treeRows(FILES, 'composer').best).toBe('src/components/agent/SessionComposer.vue');
  });

  it('laisse les fichiers de racine à la racine', () => {
    expect(drawn('readme')).toEqual(['README.md']);
  });

  it('compte tous les fichiers retenus, repliés compris', () => {
    expect(treeRows(FILES, 'index').total).toBe(2);
  });
});

describe('treeRows — le repli', () => {
  it('cache les descendants d’un dossier fermé et annonce ce qu’il retient', () => {
    const { rows } = treeRows(FILES, 'index', new Set(['src/services']));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'dir',
      label: 'src/services',
      collapsed: true,
      count: 2,
    });
  });

  it('ne replie que la branche visée', () => {
    expect(drawn('index', new Set(['src/services/agent']))).toEqual([
      'src/services/',
      '  agent/',
      '  projects/',
      '    index.ts',
    ]);
  });

  it('garde le compte total, même replié : ce qui est caché existe encore', () => {
    expect(treeRows(FILES, 'index', new Set(['src/services'])).total).toBe(2);
  });
});
