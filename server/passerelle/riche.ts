// Markdown → messages riches de Telegram (Bot API 10.1).
//
// `sendMessage` n'affiche qu'un sous-ensemble de HTML : ni titres, ni listes,
// **ni tableaux** — `<table>` y est refusé net. C'est ce qui obligeait à rendre
// un tableau en chasse fixe, où il se disloque dès qu'il dépasse la largeur d'un
// téléphone.
//
// `sendRichMessage` est une autre API, et elle change la donne : des blocs
// structurés en JSON plutôt qu'un balisage, avec de vrais tableaux — bordures
// comprises —, de vrais titres, de vraies listes, et une borne de 32 768
// caractères au lieu de 4 096.
//
// **Les noms de champs viennent de la documentation, et c'est important** :
// l'API accepte les champs qu'elle ne connaît pas et les ignore en silence. Un
// `header` au lieu de `is_header` ne produit donc aucune erreur — seulement un
// tableau sans en-tête, et rien pour dire pourquoi. Ne rien renommer ici sans
// l'avoir relu dans la spec.

import type { RichBlockTableCell } from 'node-telegram-bot-api';

// Les formes s'appuient sur celles de `node-telegram-bot-api` plutôt que d'être
// redéclarées ici. C'est tout l'intérêt de la dépendance : elle **défend les
// noms de champs**, là où l'API ne les défend pas. Un `header` écrit pour
// `is_header` ne produit aucune erreur à l'exécution — l'API ignore ce qu'elle
// ne connaît pas — et donnait un tableau sans en-tête, sans rien pour le dire.
//
// **Deux corrections, mesurées contre l'API et contre sa documentation.** Les
// types de la bibliothèque sont faux sur ces points-là, et s'y conformer
// empêcherait d'écrire des documents que Telegram accepte :
//
//  1. son `RichText` n'admet ni chaîne nue ni tableau, alors que la doc dit
//     « either a String for plain text, an Array of RichText, or … » et que
//     l'API accepte les deux — sans quoi **aucun texte simple** ne serait
//     exprimable, puisqu'il n'existe pas de type pour lui ;
//  2. `align` et `valign` d'une cellule y sont requis, alors qu'une cellule
//     sans eux est acceptée.
//
// Le reste — `is_header`, `is_bordered`, `colspan`, `rowspan` — vient d'eux, et
// c'est ce qui compte : ce sont ces noms-là qui échouaient en silence.

/** Le texte tel que l'API l'accepte vraiment. Voir la correction (1) ci-dessus. */
export type RichText = string | RichText[] | { type: string; text: RichText; url?: string };

/** Une cellule : la leur, dont on rend `align` et `valign` optionnels. */
export type Cellule = Omit<RichBlockTableCell, 'text' | 'align' | 'valign'> & {
  text?: RichText;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
};

/**
 * Un bloc, tel qu'on l'émet.
 *
 * Les clés reprennent celles de la bibliothèque ; seul le texte suit la forme
 * réelle de l'API. `InputRichBlock` est ce que le client attend, et la
 * conversion se fait au point d'envoi — un seul endroit, commenté.
 */
export type InputRichBlock =
  | { type: 'paragraph'; text: RichText }
  | { type: 'heading'; text: RichText; size: number }
  | { type: 'table'; cells: Cellule[][]; is_bordered?: true; is_striped?: true }
  | { type: 'list'; items: { blocks: InputRichBlock[] }[] }
  | { type: 'pre'; text: RichText; language?: string }
  | { type: 'blockquote'; blocks: InputRichBlock[] }
  | { type: 'divider' };

/** Ce qu'un message riche accepte — huit fois la borne de `sendMessage`. */
export const MAX_RICHE = 32_768;

/** Une ligne de tableau qui ne sert qu'à l'alignement. */
const SEPARATEUR = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

/**
 * Le texte d'une ligne, découpé en morceaux.
 *
 * Le code littéral passe en premier : un `**` à l'intérieur d'un `code` doit
 * rester du code. Rien n'est échappé — ces morceaux voyagent en JSON, donc `<`
 * et `&` sont du texte et le restent, contrairement au rendu HTML.
 */
export function fragments(ligne: string): RichText[] {
  const out: RichText[] = [];
  const motif =
    /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<![\w_])_([^_\n]+)_(?![\w_])/g;

  let reste = 0;
  for (let m = motif.exec(ligne); m; m = motif.exec(ligne)) {
    if (m.index > reste) out.push(ligne.slice(reste, m.index));
    const [, code, libelle, url, gras, barre, penche, souligne] = m;

    if (code !== undefined) out.push({ type: 'code', text: code });
    else if (libelle !== undefined && url !== undefined) {
      // Une URL n'est reprise que si elle mène quelque part de connu : le reste
      // n'a rien à faire dans un lien qu'on relaie.
      if (/^(https?:\/\/|mailto:)/i.test(url)) out.push({ type: 'url', text: libelle, url });
      else out.push(libelle);
    } else if (gras !== undefined) out.push({ type: 'bold', text: gras });
    else if (barre !== undefined) out.push({ type: 'strikethrough', text: barre });
    else if (penche !== undefined) out.push({ type: 'italic', text: penche });
    else if (souligne !== undefined) out.push({ type: 'italic', text: souligne });

    reste = m.index + m[0].length;
  }
  if (reste < ligne.length) out.push(ligne.slice(reste));
  return out.length ? out : [''];
}

/** Les cellules d'une ligne de tableau, bords vides retirés. */
function cellules(ligne: string): string[] {
  return ligne
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * Ce que devient une case à cocher, faute d'être rendue nativement.
 *
 * Les deux voies natives ont été essayées, et fermées :
 *
 *  - `has_checkbox` / `is_checked` sur un item de liste : **acceptés par l'API,
 *    ignorés par le client** — une case cochée s'affiche comme une puce
 *    ordinaire. Constaté sur le client web ; si un client venait à les rendre,
 *    c'est ici qu'il faudrait revenir ;
 *  - `sendChecklist`, la checklist native et cochable : refusée
 *    (`PREMIUM_ACCOUNT_REQUIRED`). Elle exige un `business_connection_id`, donc
 *    un compte Business connecté — hors de portée d'un bot ordinaire.
 *
 * Reste le symbole dans le texte. Il est laid, il est fiable, et surtout il ne
 * perd pas l'information : sans lui, une liste de tâches ne dit plus lesquelles
 * sont faites.
 */
const COCHE = { fait: '☑︎ ', reste: '☐︎ ' };

/**
 * Le document, découpé en blocs.
 *
 * Ligne à ligne, avec les regroupements qu'aucune ligne seule ne porte : un
 * paragraphe court sur plusieurs lignes, un tableau aussi, une liste également.
 * Chacun se ferme sur la première ligne qui ne lui appartient plus.
 */
export function enBlocs(markdown: string): InputRichBlock[] {
  const lignes = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocs: InputRichBlock[] = [];

  let paragraphe: string[] = [];
  let tableau: string[] = [];
  let liste: string[] = [];
  let code: string[] | null = null;
  let langue = '';

  const fermeParagraphe = (): void => {
    if (!paragraphe.length) return;
    blocs.push({ type: 'paragraph', text: fragments(paragraphe.join(' ')) });
    paragraphe = [];
  };

  const fermeTableau = (): void => {
    if (!tableau.length) return;
    const grille = tableau.filter((l) => !SEPARATEUR.test(l)).map(cellules);
    const avaitSeparateur = tableau.some((l) => SEPARATEUR.test(l));
    tableau = [];
    if (!grille.length) return;
    blocs.push({
      type: 'table',
      // Les bordures ne sont pas décoratives ici : sans elles, un tableau se lit
      // comme des mots posés côte à côte.
      is_bordered: true,
      // La ligne d'alignement du Markdown est ce qui désigne l'en-tête. Sans
      // elle, la première ligne est une ligne comme une autre.
      cells: grille.map((rangee, i) =>
        rangee.map((c) => ({
          text: fragments(c),
          ...(i === 0 && avaitSeparateur ? { is_header: true as const } : {}),
        })),
      ),
    });
  };

  const fermeListe = (): void => {
    if (!liste.length) return;
    blocs.push({
      type: 'list',
      items: liste.map((texte) => ({
        blocks: [{ type: 'paragraph', text: fragments(texte) }],
      })),
    });
    liste = [];
  };

  const fermeTout = (): void => {
    fermeParagraphe();
    fermeTableau();
    fermeListe();
  };

  for (const ligne of lignes) {
    if (code !== null) {
      if (/^\s*```/.test(ligne)) {
        blocs.push({ type: 'pre', text: code.join('\n'), ...(langue ? { language: langue } : {}) });
        code = null;
        langue = '';
      } else code.push(ligne);
      continue;
    }

    if (/^\s*```/.test(ligne)) {
      fermeTout();
      langue = ligne.replace(/^\s*```/, '').trim();
      code = [];
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(ligne)) {
      fermeParagraphe();
      fermeListe();
      tableau.push(ligne);
      continue;
    }
    fermeTableau();

    const puce = /^\s*[-*+]\s+(.*)$/.exec(ligne);
    if (puce) {
      fermeParagraphe();
      const contenu = puce[1] ?? '';
      // `- [ ]` et `- [x]` : le symbole va dans le texte. La spec offre bien
      // `has_checkbox`, mais aucun client ne le rend aujourd'hui — l'état de la
      // tâche disparaîtrait sans laisser de trace. Voir `RichListItem`.
      const case_ = /^\[([ xX])\]\s+(.*)$/.exec(contenu);
      if (case_) {
        const prefixe = (case_[1] ?? '').toLowerCase() === 'x' ? COCHE.fait : COCHE.reste;
        liste.push(prefixe + (case_[2] ?? ''));
      } else liste.push(contenu);
      continue;
    }

    const numerotee = /^\s*(\d+)[.)]\s+(.*)$/.exec(ligne);
    if (numerotee) {
      fermeParagraphe();
      // Le numéro reste dans le texte : le client dessine ses propres puces et
      // ignore le `label` qui aurait dû le porter.
      liste.push(`${numerotee[1] ?? ''}. ${numerotee[2] ?? ''}`);
      continue;
    }
    fermeListe();

    const titre = /^(#{1,6})\s+(.*)$/.exec(ligne);
    if (titre) {
      fermeParagraphe();
      // Les six niveaux du Markdown sont exactement les six tailles de Telegram,
      // dans le même sens : 1 est le plus grand.
      blocs.push({
        type: 'heading',
        text: fragments(titre[2] ?? ''),
        size: (titre[1] ?? '#').length,
      });
      continue;
    }

    const citation = /^\s*>\s?(.*)$/.exec(ligne);
    if (citation) {
      fermeParagraphe();
      blocs.push({
        type: 'blockquote',
        blocks: [{ type: 'paragraph', text: fragments(citation[1] ?? '') }],
      });
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(ligne)) {
      fermeTout();
      blocs.push({ type: 'divider' });
      continue;
    }

    if (!ligne.trim()) {
      fermeParagraphe();
      continue;
    }
    paragraphe.push(ligne.trim());
  }

  // Un document qui s'arrête dans un bloc ouvert — page coupée, fichier
  // tronqué — doit tout de même rendre ce qu'il avait commencé.
  if (code !== null) {
    blocs.push({ type: 'pre', text: code.join('\n'), ...(langue ? { language: langue } : {}) });
  }
  fermeTout();

  return blocs;
}
