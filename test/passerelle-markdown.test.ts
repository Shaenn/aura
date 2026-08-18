// Rendre un Markdown lisible dans une conversation, sans casser l'envoi.
//
// Deux risques, et un seul se voit à l'œil : un rendu laid, et un message que
// Telegram **refuse** parce qu'une balise traîne ouverte ou qu'un `<` du
// document a été pris pour du balisage. Le second est le vrai danger — l'envoi
// échoue en bloc, et le document disparaît.

import { describe, expect, it } from 'vitest';
import { echappe, enHtml, paginer, PAGE_SOURCE } from '../server/passerelle/markdown.ts';

describe('echappe', () => {
  it('neutralise ce qui se lirait comme du balisage', () => {
    expect(echappe('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('échappe l’esperluette avant tout, sinon elle mange les autres', () => {
    // `&lt;` produit par la première passe ne doit pas devenir `&amp;lt;`.
    expect(echappe('<')).toBe('&lt;');
  });
});

describe('enHtml', () => {
  it('rend les titres en gras, faute de niveaux chez Telegram', () => {
    expect(enHtml('# Titre')).toBe('<b>Titre</b>');
    expect(enHtml('### Sous-titre')).toBe('<b>Sous-titre</b>');
  });

  it('rend les puces avec un vrai caractère de puce', () => {
    expect(enHtml('- un\n- deux')).toBe('• un\n• deux');
  });

  it('retrait les sous-listes, sinon elles se confondent avec leur mère', () => {
    expect(enHtml('- mère\n  - fille')).toBe('• mère\n  • fille');
  });

  it('garde le gras, l’italique et le barré', () => {
    expect(enHtml('**gras** et *penché* et ~~barré~~')).toBe(
      '<b>gras</b> et <i>penché</i> et <s>barré</s>',
    );
  });

  it('ne prend pas un souligné de nom de fichier pour de l’italique', () => {
    // Le cas réel qui a motivé la règle : `SPEC-014_notes-projet.md`.
    expect(enHtml('SPEC-014_notes-de-projet-longues.md')).toBe(
      'SPEC-014_notes-de-projet-longues.md',
    );
  });

  it('ne touche pas à ce qui est entre accents graves', () => {
    // `**` dans du code reste du code : c'est tout l'intérêt des jetons.
    expect(enHtml('voir `a**b` ici')).toBe('voir <code>a**b</code> ici');
  });

  it('rend un bloc de code et le referme', () => {
    expect(enHtml('```ts\nconst a = 1;\n```')).toBe(
      '<pre><code class="language-ts">\nconst a = 1;\n</code></pre>',
    );
  });

  it('referme un bloc de code laissé ouvert par une coupure', () => {
    // Une page coupée en plein bloc laisserait sinon une balise en l'air, et
    // Telegram refuserait le message entier.
    expect(enHtml('```\ndu code')).toContain('</code></pre>');
  });

  it('échappe le contenu d’un bloc de code', () => {
    expect(enHtml('```\nif (a < b) {}\n```')).toContain('if (a &lt; b) {}');
  });

  it('garde un tableau en chasse fixe et jette sa ligne d’alignement', () => {
    const rendu = enHtml('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(rendu).toBe('<pre>\n| a | b |\n| 1 | 2 |\n</pre>');
  });

  it('rend un lien, et laisse tomber les protocoles qu’on ne relaie pas', () => {
    expect(enHtml('[doc](https://exemple.fr)')).toBe('<a href="https://exemple.fr">doc</a>');
    expect(enHtml('[courriel](mailto:a@b.fr)')).toBe('<a href="mailto:a@b.fr">courriel</a>');
    // Un `javascript:` n'a rien à faire dans un href qu'on relaie : seul le
    // libellé survit. Une URL à parenthèses imbriquées laisse en plus une
    // parenthèse orpheline — la capture s'arrête à la première fermante. C'est
    // le défaut classique du Markdown à une passe, et il est sans conséquence
    // ici : le lien est refusé dans les deux cas.
    expect(enHtml('[piège](javascript:alert)')).toBe('piège');
    expect(enHtml('[piège](javascript:alert(1))')).toBe('piège)');
  });

  it('rend une citation et une ligne de séparation', () => {
    expect(enHtml('> cité')).toBe('<blockquote>cité</blockquote>');
    expect(enHtml('---')).toBe('──────────');
  });

  it('ne laisse jamais un jeton interne dans le rendu', () => {
    // Les jetons qui mettent le code littéral de côté doivent tous être
    // ressortis : un jeton qui survit s'afficherait tel quel, et le `<code>`
    // qu'il portait aurait disparu.
    const JETON = String.fromCharCode(0xe000);
    expect(enHtml('`a` et `b` et du texte')).not.toContain(JETON);
    expect(enHtml('`a` et `b`')).toBe('<code>a</code> et <code>b</code>');
  });

  it('désamorce un jeton que le document porterait lui-même', () => {
    // Un document qui contiendrait ce caractère pourrait sinon faire ressortir
    // un littéral qui n'est pas le sien. Le nettoyage retire le caractère et
    // **garde son voisinage** : le texte n'est pas amputé, la contrefaçon ne
    // ressemble plus à un jeton.
    const JETON = String.fromCharCode(0xe000);
    expect(enHtml(`avant${JETON}0${JETON}après`)).toBe('avant0après');
  });
});

describe('paginer', () => {
  it('rend une seule page pour un document court', () => {
    expect(paginer('court')).toEqual(['court']);
  });

  it('rend une page même pour un document vide', () => {
    expect(paginer('')).toEqual(['']);
  });

  it('coupe sur des frontières de lignes', () => {
    const doc = Array.from({ length: 400 }, (_, i) => `ligne ${i}`).join('\n');
    const pages = paginer(doc);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(PAGE_SOURCE);
    // Rien ne se perd et rien ne se duplique.
    expect(pages.join('\n').split('\n')).toEqual(doc.split('\n'));
  });

  it('referme et rouvre un bloc de code à cheval sur deux pages', () => {
    // Sans cela, la clôture ``` se retrouve en tête de la page suivante où elle
    // *ouvre* un bloc au lieu de le fermer, et tout le reste part en code.
    const gros = Array.from({ length: 400 }, (_, i) => `code ${i}`).join('\n');
    const pages = paginer('```ts\n' + gros + '\n```');
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]?.endsWith('```')).toBe(true);
    expect(pages[1]?.startsWith('```ts')).toBe(true);
    // Et chaque page se rend seule, sans balise en l'air.
    for (const p of pages) {
      const html = enHtml(p);
      expect(html.split('<pre>').length).toBe(html.split('</pre>').length);
    }
  });

  it('coupe une ligne plus longue qu’une page entière', () => {
    const pages = paginer('x'.repeat(PAGE_SOURCE * 2 + 10));
    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(PAGE_SOURCE);
  });
});
