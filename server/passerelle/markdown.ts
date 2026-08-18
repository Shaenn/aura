// Rendre un document Markdown lisible dans une conversation.
//
// Telegram n'affiche pas le Markdown. Il affiche un **sous-ensemble de HTML** —
// `b`, `i`, `s`, `u`, `code`, `pre`, `a`, `blockquote`, et rien d'autre. Ni
// titres, ni listes, ni tableaux : un `<h2>` ou un `<ul>` fait échouer l'envoi
// en 400, et le `.md` brut affiché tel quel noie le texte sous sa ponctuation.
//
// D'où cette traduction, qui ne cherche pas la fidélité mais la **lisibilité au
// pouce** : un titre devient du gras, une puce devient une puce, un tableau
// reste en chasse fixe parce que c'est son alignement qui le rend lisible, et
// tout le reste tombe en texte simple.
//
// Aucun réseau ici, et c'est voulu : tout ce fichier se vérifie par un test.

/** Ce que Telegram accepte dans un message, balises comprises. */
export const MAX_MESSAGE = 4096;

/**
 * Ce qu'une page prend au document source.
 *
 * Nettement sous la limite : la traduction *ajoute* des balises, et un document
 * dense en `code` peut gagner un tiers de sa taille. La marge évite d'avoir à
 * re-découper après coup, ce qui couperait au mauvais endroit.
 */
export const PAGE_SOURCE = 2_600;

/** Les trois caractères qui feraient lire une balise là où il n'y en a pas. */
export function echappe(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Les transformations en ligne, sur du texte **déjà échappé**.
 *
 * L'ordre n'est pas indifférent : le code littéral part en premier et revient en
 * dernier, sous forme de jetons, pour qu'un `**` à l'intérieur d'un `code` reste
 * du code et ne devienne pas du gras.
 */
function enLigne(texte: string): string {
  const litteraux: string[] = [];
  // `\uE000` est le premier point de la zone à usage privé : aucun document
  // ne le porte, et il est retiré de l’entrée au nettoyage — un jeton ne peut donc
  // jamais entrer en collision avec le texte. Un caractère de contrôle ferait le
  // même office, mais `no-control-regex` le refuse à raison : en regex, il ne se
  // relit pas.
  const jeton = (i: number): string => `\uE000${i}\uE000`;

  let out = texte.replace(/`([^`]+)`/g, (_all, code: string) => {
    litteraux.push(`<code>${code}</code>`);
    return jeton(litteraux.length - 1);
  });

  // Les liens avant l'emphase : un libellé en gras dedans doit rester dans le
  // libellé, pas couper la balise en deux.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_all, libelle: string, url: string) => {
    // Une URL n'est reprise que si elle mène quelque part de connu : un
    // `javascript:` dans un href est refusé par Telegram, et n'a rien à faire
    // dans un document qu'on relaie.
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return libelle;
    return `<a href="${url}">${libelle}</a>`;
  });

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');

  return out.replace(/\uE000(\d+)\uE000/g, (_all, i: string) => litteraux[Number(i)] ?? '');
}

/** Une ligne de tableau Markdown — celles qui ne servent qu'à l'alignement. */
const SEPARATEUR_TABLEAU = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

/**
 * Au-delà de quelle largeur un tableau cesse d'être lisible en chasse fixe.
 *
 * Mesuré contre l'API, pas déduit : **Telegram n'a aucune balise de tableau**
 * pour les bots — `<table>` est refusé net (« Unsupported start tag »), tout
 * comme `<ul>` et `<h1>`. Un tableau ne peut donc être qu'un `<pre>`, et un
 * `<pre>` trop large ne défile pas sur un téléphone : il **passe à la ligne**,
 * ce qui détruit exactement l'alignement qui le rendait lisible.
 *
 * Quarante colonnes est ce qu'un écran de téléphone tient sans replier. Au-delà,
 * mieux vaut renoncer à la forme tabulaire que la voir se disloquer.
 */
const LARGEUR_TABLEAU = 40;

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
 * Un tableau, rendu de la façon qui reste lisible.
 *
 * Deux formes, et le choix se fait sur la largeur :
 *
 *  - **étroit** — un `<pre>` aux colonnes recalculées au plus juste. Le padding
 *    du document est refait plutôt que repris : un tableau écrit large dans le
 *    fichier tient souvent une fois ses colonnes serrées.
 *  - **large** — une fiche par ligne : la première cellule en titre, puis
 *    `en-tête : valeur`. On perd la comparaison colonne à colonne, on garde ce
 *    que chaque ligne dit — et c'est tout ce qui survivait au repli automatique.
 */
function rendTableau(lignes: string[]): string[] {
  const grille = lignes.filter((l) => !SEPARATEUR_TABLEAU.test(l)).map(cellules);
  if (!grille.length) return [];

  const colonnes = Math.max(...grille.map((r) => r.length));
  const largeurs = Array.from({ length: colonnes }, (_, c) =>
    Math.max(...grille.map((r) => (r[c] ?? '').length)),
  );
  // `| ` + ` | ` entre colonnes + ` |` : la largeur qu'aurait la forme serrée.
  const largeur = largeurs.reduce((a, b) => a + b, 0) + 3 * colonnes + 1;

  if (largeur <= LARGEUR_TABLEAU) {
    const lignesRendues = grille.map(
      (r) => `| ${largeurs.map((w, c) => (r[c] ?? '').padEnd(w)).join(' | ')} |`,
    );
    return ['<pre>', ...lignesRendues.map(echappe), '</pre>'];
  }

  const [entetes, ...corps] = grille;
  if (!entetes || !corps.length) {
    return ['<pre>', ...grille.map((r) => echappe(r.join(' | '))), '</pre>'];
  }

  const out: string[] = [];
  for (const rangee of corps) {
    const titre = rangee[0] ?? '';
    out.push('', `<b>${enLigne(echappe(titre))}</b>`);
    for (let c = 1; c < colonnes; c++) {
      const valeur = rangee[c] ?? '';
      if (!valeur) continue;
      const entete = entetes[c] ?? '';
      out.push(`  ${enLigne(echappe(entete))} : ${enLigne(echappe(valeur))}`);
    }
  }
  return out;
}

/**
 * Le document, traduit pour Telegram.
 *
 * Travaille ligne à ligne, avec deux états qui ne se devinent pas d'une ligne
 * seule : on est dans un bloc de code, ou dans un tableau. Les deux se rendent
 * en chasse fixe et échappent à toute transformation — le premier parce que
 * c'est du code, le second parce que seul l'alignement le rend lisible.
 */
export function enHtml(markdown: string): string {
  const lignes = markdown
    .replace(/\uE000/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const out: string[] = [];
  let dansCode = false;
  let tableau: string[] = [];

  const fermeTableau = (): void => {
    if (!tableau.length) return;
    out.push(...rendTableau(tableau));
    tableau = [];
  };

  for (const ligne of lignes) {
    const cloture = /^\s*```/.test(ligne);

    if (dansCode) {
      if (cloture) {
        out.push('</code></pre>');
        dansCode = false;
      } else {
        out.push(echappe(ligne));
      }
      continue;
    }

    if (cloture) {
      fermeTableau();
      const langue = ligne.replace(/^\s*```/, '').trim();
      out.push(langue ? `<pre><code class="language-${echappe(langue)}">` : '<pre><code>');
      dansCode = true;
      continue;
    }

    // Un tableau est mis de côté jusqu'à sa dernière ligne : sa forme ne se
    // décide qu'une fois sa largeur connue — voir `rendTableau`.
    if (/^\s*\|.*\|\s*$/.test(ligne)) {
      tableau.push(ligne);
      continue;
    }
    fermeTableau();

    const titre = /^(#{1,6})\s+(.*)$/.exec(ligne);
    if (titre) {
      // Pas de niveaux : Telegram n'a qu'un gras. Une ligne vide avant fait le
      // découpage visuel que la taille de police ferait ailleurs.
      out.push('', `<b>${enLigne(echappe(titre[2] ?? ''))}</b>`);
      continue;
    }

    const puce = /^(\s*)[-*+]\s+(.*)$/.exec(ligne);
    if (puce) {
      // L'indentation devient un retrait visible : deux espaces par niveau,
      // sinon une sous-liste se confond avec sa mère.
      const retrait = ' '.repeat(Math.floor((puce[1] ?? '').length / 2) * 2);
      out.push(`${retrait}• ${enLigne(echappe(puce[2] ?? ''))}`);
      continue;
    }

    const citation = /^\s*>\s?(.*)$/.exec(ligne);
    if (citation) {
      out.push(`<blockquote>${enLigne(echappe(citation[1] ?? ''))}</blockquote>`);
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(ligne)) {
      out.push('──────────');
      continue;
    }

    out.push(enLigne(echappe(ligne)));
  }

  // Un document qui se termine dans un bloc ouvert — page coupée, fichier
  // tronqué — laisserait une balise en l'air, et Telegram refuserait tout.
  if (dansCode) out.push('</code></pre>');
  fermeTableau();

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Le document en pages, coupées sur des frontières de lignes.
 *
 * Couper au caractère près trancherait au milieu d'un mot, et surtout au milieu
 * d'un bloc de code — dont la clôture se retrouverait sur la page suivante, où
 * elle *ouvrirait* un bloc au lieu de le fermer. D'où le suivi de l'état : une
 * page qui s'arrête dans un bloc le referme, et la suivante le rouvre.
 */
export function paginer(markdown: string, max = PAGE_SOURCE): string[] {
  const lignes = markdown.replace(/\r\n?/g, '\n').split('\n');
  const pages: string[] = [];
  let courante: string[] = [];
  let taille = 0;
  let dansCode = false;
  let langue = '';

  const cloture = (): void => {
    if (!courante.length) return;
    if (dansCode) courante.push('```');
    pages.push(courante.join('\n'));
    courante = dansCode ? ['```' + langue] : [];
    taille = courante.length ? langue.length + 4 : 0;
  };

  for (const ligne of lignes) {
    // Une ligne à elle seule plus longue qu'une page : on la coupe, faute de
    // mieux. Rare, et toujours préférable à une page qui ne part jamais.
    for (const part of ligne.length > max ? decoupe(ligne, max) : [ligne]) {
      if (taille + part.length + 1 > max) cloture();
      courante.push(part);
      taille += part.length + 1;

      if (/^\s*```/.test(part)) {
        if (dansCode) {
          dansCode = false;
          langue = '';
        } else {
          dansCode = true;
          langue = part.replace(/^\s*```/, '').trim();
        }
      }
    }
  }

  if (courante.length) pages.push(courante.join('\n'));
  return pages.length ? pages : [''];
}

/** Coupe une ligne trop longue en morceaux d'au plus `max`. */
function decoupe(ligne: string, max: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < ligne.length; i += max) out.push(ligne.slice(i, i + max));
  return out;
}
