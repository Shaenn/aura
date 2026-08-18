// Markdown → blocs riches de Telegram.
//
// Le piège de cette API, et la raison d'être de ces cas : **elle accepte les
// champs qu'elle ne connaît pas et les ignore**. Un `header` écrit au lieu de
// `is_header` ne produit aucune erreur — seulement un tableau sans en-tête, et
// rien pour dire pourquoi. Les noms de champs sont donc gelés ici, contre la
// spec, parce que rien à l'exécution ne les défendra.

import { describe, expect, it } from 'vitest';
import { enBlocs, fragments } from '../server/passerelle/riche.ts';

describe('fragments', () => {
  it('rend une ligne sans balisage en un seul morceau', () => {
    expect(fragments('du texte')).toEqual(['du texte']);
  });

  it('mêle le nu et l’enrichi dans l’ordre de lecture', () => {
    expect(fragments('avant **gras** après')).toEqual([
      'avant ',
      { type: 'bold', text: 'gras' },
      ' après',
    ]);
  });

  it('garde le code littéral hors des autres transformations', () => {
    expect(fragments('`a**b`')).toEqual([{ type: 'code', text: 'a**b' }]);
  });

  it('n’échappe rien : ces morceaux voyagent en JSON', () => {
    // Contrairement au rendu HTML, `<` et `&` sont du texte et le restent.
    expect(fragments('a < b & c')).toEqual(['a < b & c']);
  });

  it('ne prend pas les soulignés d’un nom de fichier pour de l’italique', () => {
    expect(fragments('SPEC-014_notes_projet.md')).toEqual(['SPEC-014_notes_projet.md']);
  });

  it('rend un lien, et refuse les protocoles qu’on ne relaie pas', () => {
    expect(fragments('[doc](https://exemple.fr)')).toEqual([
      { type: 'url', text: 'doc', url: 'https://exemple.fr' },
    ]);
    expect(fragments('[piège](javascript:alert)')).toEqual(['piège']);
  });
});

describe('enBlocs', () => {
  it('donne aux titres les six tailles, dans le même sens que le Markdown', () => {
    // 1 est le plus grand des deux côtés : la correspondance est directe.
    expect(enBlocs('# un')).toEqual([{ type: 'heading', text: ['un'], size: 1 }]);
    expect(enBlocs('###### six')).toEqual([{ type: 'heading', text: ['six'], size: 6 }]);
  });

  it('regroupe les lignes consécutives en un paragraphe', () => {
    expect(enBlocs('une ligne\net sa suite')).toEqual([
      { type: 'paragraph', text: ['une ligne et sa suite'] },
    ]);
  });

  it('borde le tableau et marque son en-tête', () => {
    // Les deux champs qui manquaient au premier essai. Sans `is_bordered` le
    // tableau se lit comme des mots posés côte à côte ; sans `is_header` sa
    // première ligne ne se distingue pas des autres.
    const blocs = enBlocs('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(blocs).toEqual([
      {
        type: 'table',
        is_bordered: true,
        cells: [
          [
            { text: ['a'], is_header: true },
            { text: ['b'], is_header: true },
          ],
          [{ text: ['1'] }, { text: ['2'] }],
        ],
      },
    ]);
  });

  it('ne déclare pas d’en-tête sans ligne d’alignement', () => {
    // C'est elle qui, en Markdown, distingue un en-tête d'une ligne ordinaire.
    const blocs = enBlocs('| a | b |\n| 1 | 2 |');
    const table = blocs[0] as { cells: { is_header?: true }[][] };
    expect(table.cells[0]?.[0]?.is_header).toBeUndefined();
  });

  it('écrit la case à cocher dans le texte, faute d’être rendue', () => {
    // `has_checkbox` existe dans la spec mais aucun client ne l'affiche : sans
    // ce préfixe, une liste de tâches perdrait l'état de chacune.
    const blocs = enBlocs('- [x] fait\n- [ ] à faire');
    const items = (blocs[0] as { items: { blocks: { text: string[] }[] }[] }).items;
    expect(items[0]?.blocks[0]?.text[0]).toBe('☑︎ fait');
    expect(items[1]?.blocks[0]?.text[0]).toBe('☐︎ à faire');
  });

  it('garde le numéro d’une liste ordonnée dans le texte', () => {
    const blocs = enBlocs('1. premier');
    const items = (blocs[0] as { items: { blocks: { text: string[] }[] }[] }).items;
    expect(items[0]?.blocks[0]?.text[0]).toBe('1. premier');
  });

  it('rend un bloc de code avec sa langue', () => {
    expect(enBlocs('```ts\nconst a = 1;\n```')).toEqual([
      { type: 'pre', text: 'const a = 1;', language: 'ts' },
    ]);
  });

  it('referme un bloc de code que la coupure d’une page a laissé ouvert', () => {
    expect(enBlocs('```\ndu code')).toEqual([{ type: 'pre', text: 'du code' }]);
  });

  it('rend une citation et un séparateur', () => {
    expect(enBlocs('> cité')).toEqual([
      { type: 'blockquote', blocks: [{ type: 'paragraph', text: ['cité'] }] },
    ]);
    expect(enBlocs('a\n\n---\n\nb')).toEqual([
      { type: 'paragraph', text: ['a'] },
      { type: 'divider' },
      { type: 'paragraph', text: ['b'] },
    ]);
  });

  it('ferme chaque bloc dès que la ligne suivante ne lui appartient plus', () => {
    const blocs = enBlocs('# titre\n- puce\n| a |\ntexte');
    expect(blocs.map((b) => b.type)).toEqual(['heading', 'list', 'table', 'paragraph']);
  });

  it('rend une liste vide de blocs pour un document vide', () => {
    expect(enBlocs('')).toEqual([]);
    expect(enBlocs('\n\n')).toEqual([]);
  });
});
