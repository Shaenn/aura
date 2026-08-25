// Markdown → messages riches de Telegram (Bot API 10.1).
//
// `sendMessage` n'affiche qu'un sous-ensemble de HTML : ni titres, ni listes,
// **ni tableaux** — `<table>` y est refusé net. Un tableau n'y tient qu'en
// chasse fixe, où il se disloque dès qu'il dépasse la largeur d'un téléphone.
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

import type { RichBlockTableCell } from 'node-telegram-bot-api'

// Les formes s'appuient sur celles de `node-telegram-bot-api` plutôt que d'être
// redéclarées ici : c'est ce qui défend les noms de champs, pour la raison dite
// plus haut.
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
export type RichText = string | RichText[] | { type: string; text: RichText; url?: string }

/** Une cellule : la leur, dont on rend `align` et `valign` optionnels. */
export type Cellule = Omit<RichBlockTableCell, 'text' | 'align' | 'valign'> & {
  text?: RichText
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
}

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
  /**
   * Le seul repli que l'API offre, et il est **explicite**.
   *
   * Rien en Markdown ne le déclenche : il ne sort donc pas d'`enBlocs` mais se
   * pose à la main, autour d'un document qu'on ne veut pas déverser. Le
   * « Afficher plus » automatique d'un message long n'en tient pas lieu —
   * mesuré, il ne s'est pas déclenché sur un résumé de sept mille caractères.
   */
  | { type: 'details'; summary: RichText; blocks: InputRichBlock[]; is_open?: true }
  | { type: 'divider' }

/** Ce qu'un message riche accepte — huit fois la borne de `sendMessage`. */
export const MAX_RICHE = 32_768

/** Une ligne de tableau qui ne sert qu'à l'alignement. */
const SEPARATEUR = /^\s*\|?[\s:|-]+\|[\s:|-]*$/

/**
 * Le texte d'une ligne, découpé en morceaux.
 *
 * Le code littéral passe en premier : un `**` à l'intérieur d'un `code` doit
 * rester du code. Rien n'est échappé — ces morceaux voyagent en JSON, donc `<`
 * et `&` sont du texte et le restent, contrairement au rendu HTML.
 */
export function fragments(ligne: string): RichText[] {
  const out: RichText[] = []

  /**
   * Le contenu d'une marque, relu comme le reste.
   *
   * Sans cette relecture, `[`chemin.md`](…)` gardait ses accents graves à
   * l'écran : le libellé d'un lien n'était jamais analysé, et le Markdown y
   * restait littéral. La récursion s'arrête d'elle-même — chaque tour retire
   * les délimiteurs, donc le texte décroît strictement.
   *
   * Un contenu sans balisage rend la chaîne telle quelle plutôt qu'un tableau
   * d'un élément : c'est la même chose pour l'API, et c'est plus lisible au
   * journal comme au test.
   */
  const interieur = (texte: string): RichText => {
    const morceaux = fragments(texte)
    const seul = morceaux[0]
    return morceaux.length === 1 && typeof seul === 'string' ? seul : morceaux
  }

  const motif = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<![\w_])_([^_\n]+)_(?![\w_])/g

  let reste = 0
  for (let m = motif.exec(ligne); m; m = motif.exec(ligne)) {
    if (m.index > reste) out.push(ligne.slice(reste, m.index))
    const [, code, libelle, url, gras, barre, penche, souligne] = m

    // Le code littéral porte deux marques plutôt qu'une. `code` seul est rendu
    // en chasse fixe teintée, ce qui suffit sur un grand écran mais se perd sur
    // un téléphone — une nuance de couleur y devient invisible avant une
    // différence de surface. `marked` ajoute un fond, et les deux se cumulent :
    // mesuré, l'emboîtement fonctionne et son ordre est sans effet.
    if (code !== undefined) out.push({ type: 'marked', text: { type: 'code', text: code } })
    else if (libelle !== undefined && url !== undefined) {
      // Une URL n'est reprise que si elle mène quelque part de connu : le reste
      // n'a rien à faire dans un lien qu'on relaie. Le libellé, lui, garde sa
      // mise en forme dans les deux cas — un lien écarté ne doit pas rendre son
      // texte plus pauvre que s'il n'avait jamais été un lien.
      if (/^(https?:\/\/|mailto:)/i.test(url)) {
        out.push({ type: 'url', text: interieur(libelle), url })
      } else out.push(...fragments(libelle))
    } else if (gras !== undefined) out.push({ type: 'bold', text: interieur(gras) })
    else if (barre !== undefined) out.push({ type: 'strikethrough', text: interieur(barre) })
    else if (penche !== undefined) out.push({ type: 'italic', text: interieur(penche) })
    else if (souligne !== undefined) out.push({ type: 'italic', text: interieur(souligne) })

    reste = m.index + m[0].length
  }
  if (reste < ligne.length) out.push(ligne.slice(reste))
  return out.length ? out : ['']
}

/** Les cellules d'une ligne de tableau, bords vides retirés. */
function cellules(ligne: string): string[] {
  return ligne
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

/**
 * L'alignement de chaque colonne, lu dans la ligne de séparation.
 *
 * Les deux-points du Markdown ne sont pas décoratifs : une colonne de nombres
 * alignée à droite dans la source doit l'être à l'écran, sinon le tableau perd
 * ce qui le rendait comparable. Rien de deviné — une colonne sans deux-points
 * n'impose rien, et laisse le client décider.
 */
function alignements(separateur: string): (Cellule['align'] | undefined)[] {
  return cellules(separateur).map((c) => {
    const gauche = c.startsWith(':')
    const droite = c.endsWith(':')
    if (gauche && droite) return 'center'
    if (droite) return 'right'
    if (gauche) return 'left'
    return undefined
  })
}

/**
 * Un élément de liste, tel qu'il se lit dans la source.
 *
 * `indent` porte l'imbrication : deux espaces devant une puce en font la
 * sous-puce de la précédente. `lignes` porte les retours à la ligne d'un
 * élément long — un point numéroté qui court sur trois lignes est **un** point,
 * pas trois.
 */
interface Element {
  indent: number
  lignes: string[]
}

/**
 * Une liste à partir d'éléments plats, l'imbrication reconstruite.
 *
 * L'indentation de la source est la seule information disponible : tout ce qui
 * est plus rentré que le premier élément appartient à celui qui le précède, et
 * la même règle s'applique un cran plus bas. Aplatir aurait remonté un
 * sous-point au rang de son parent, ce qui inverse le sens d'une consigne.
 */
function listeDepuis(elements: Element[]): InputRichBlock {
  const base = Math.min(...elements.map((e) => e.indent))
  const groupes: { tete: Element; enfants: Element[] }[] = []

  for (const element of elements) {
    const dernier = groupes[groupes.length - 1]
    if (!dernier || element.indent <= base) groupes.push({ tete: element, enfants: [] })
    else dernier.enfants.push(element)
  }

  return {
    type: 'list',
    items: groupes.map((g) => ({
      blocks: [{ type: 'paragraph' as const, text: fragments(g.tete.lignes.join(' ')) }, ...(g.enfants.length ? [listeDepuis(g.enfants)] : [])],
    })),
  }
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
const COCHE = { fait: '☑︎ ', reste: '☐︎ ' }

/**
 * Le document, découpé en blocs.
 *
 * Ligne à ligne, avec les regroupements qu'aucune ligne seule ne porte : un
 * paragraphe court sur plusieurs lignes, un tableau aussi, une liste également.
 * Chacun se ferme sur la première ligne qui ne lui appartient plus.
 */
export function enBlocs(markdown: string): InputRichBlock[] {
  const lignes = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocs: InputRichBlock[] = []

  let paragraphe: string[] = []
  let tableau: string[] = []
  let liste: Element[] = []
  let citation: string[] = []
  let code: string[] | null = null
  let langue = ''

  const fermeParagraphe = (): void => {
    if (!paragraphe.length) return
    blocs.push({ type: 'paragraph', text: fragments(paragraphe.join(' ')) })
    paragraphe = []
  }

  const fermeTableau = (): void => {
    if (!tableau.length) return
    const grille = tableau.filter((l) => !SEPARATEUR.test(l)).map(cellules)
    const separateur = tableau.find((l) => SEPARATEUR.test(l))
    const aligne = separateur ? alignements(separateur) : []
    tableau = []
    if (!grille.length) return
    blocs.push({
      type: 'table',
      // Les bordures ne sont pas décoratives ici : sans elles, un tableau se lit
      // comme des mots posés côte à côte.
      is_bordered: true,
      // La ligne d'alignement du Markdown est ce qui désigne l'en-tête. Sans
      // elle, la première ligne est une ligne comme une autre.
      cells: grille.map((rangee, i) =>
        rangee.map((c, j) => ({
          text: fragments(c),
          ...(i === 0 && separateur ? { is_header: true as const } : {}),
          ...(aligne[j] ? { align: aligne[j] } : {}),
        })),
      ),
    })
  }

  const fermeListe = (): void => {
    if (!liste.length) return
    blocs.push(listeDepuis(liste))
    liste = []
  }

  /**
   * Une citation se relit entièrement, comme un document à elle seule.
   *
   * C'est ce qui lui rend ce qu'elle porte : une citation contenant une liste
   * numérotée est fréquente — un message à recopier, une consigne — et la
   * traiter ligne à ligne en faisait autant de citations d'une ligne, chacune
   * dans son cadre. La récursion s'arrête d'elle-même : chaque tour retire un
   * chevron.
   */
  const fermeCitation = (): void => {
    if (!citation.length) return
    const dedans = enBlocs(citation.join('\n'))
    citation = []
    if (dedans.length) blocs.push({ type: 'blockquote', blocks: dedans })
  }

  const fermeTout = (): void => {
    fermeParagraphe()
    fermeTableau()
    fermeListe()
    fermeCitation()
  }

  for (const ligne of lignes) {
    if (code !== null) {
      if (/^\s*```/.test(ligne)) {
        blocs.push({ type: 'pre', text: code.join('\n'), ...(langue ? { language: langue } : {}) })
        code = null
        langue = ''
      } else code.push(ligne)
      continue
    }

    if (/^\s*```/.test(ligne)) {
      fermeTout()
      langue = ligne.replace(/^\s*```/, '').trim()
      code = []
      continue
    }

    // La citation se ramasse d'abord : un chevron l'emporte sur tout le reste,
    // et ce qu'il y a derrière sera relu par la récursion.
    const chevron = /^ {0,3}>\s?(.*)$/.exec(ligne)
    if (chevron) {
      fermeParagraphe()
      fermeTableau()
      fermeListe()
      citation.push(chevron[1] ?? '')
      continue
    }
    fermeCitation()

    if (/^\s*\|.*\|\s*$/.test(ligne)) {
      fermeParagraphe()
      fermeListe()
      tableau.push(ligne)
      continue
    }
    fermeTableau()

    const puce = /^(\s*)[-*+]\s+(.*)$/.exec(ligne)
    if (puce) {
      fermeParagraphe()
      const indent = (puce[1] ?? '').length
      const contenu = puce[2] ?? ''
      // `- [ ]` et `- [x]` : le symbole va dans le texte. La spec offre bien
      // `has_checkbox`, mais aucun client ne le rend aujourd'hui — l'état de la
      // tâche disparaîtrait sans laisser de trace. Voir `RichListItem`.
      const case_ = /^\[([ xX])\]\s+(.*)$/.exec(contenu)
      if (case_) {
        const prefixe = (case_[1] ?? '').toLowerCase() === 'x' ? COCHE.fait : COCHE.reste
        liste.push({ indent, lignes: [prefixe + (case_[2] ?? '')] })
      } else liste.push({ indent, lignes: [contenu] })
      continue
    }

    const numerotee = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(ligne)
    if (numerotee) {
      fermeParagraphe()
      // Le numéro reste dans le texte. La liste ordonnée native existe —
      // `value` et `type` sur l'item — mais sa forme décimale décale d'un rang
      // sur le client actuel : le premier point s'affiche « 0. ». Dans un
      // document où l'ordre est la consigne, c'est pire que la redondance
      // d'une puce suivie d'un numéro. Mesuré ; voir `blocs-riches.md`.
      liste.push({
        indent: (numerotee[1] ?? '').length,
        lignes: [`${numerotee[2] ?? ''}. ${numerotee[3] ?? ''}`],
      })
      continue
    }

    // La suite d'un élément long : rentrée, sans marqueur, et pas un paragraphe.
    // Sans ceci, la deuxième ligne d'un point numéroté fermait la liste, et le
    // point suivant repartait à « 1 » dans un nouveau bloc.
    const dernier = liste[liste.length - 1]
    if (dernier && /^\s/.test(ligne) && ligne.trim()) {
      dernier.lignes.push(ligne.trim())
      continue
    }
    fermeListe()

    const titre = /^(#{1,6})\s+(.*)$/.exec(ligne)
    if (titre) {
      fermeParagraphe()
      // Les six niveaux du Markdown sont exactement les six tailles de Telegram,
      // dans le même sens : 1 est le plus grand.
      blocs.push({
        type: 'heading',
        text: fragments(titre[2] ?? ''),
        size: (titre[1] ?? '#').length,
      })
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(ligne)) {
      fermeTout()
      blocs.push({ type: 'divider' })
      continue
    }

    if (!ligne.trim()) {
      fermeParagraphe()
      continue
    }
    paragraphe.push(ligne.trim())
  }

  // Un document qui s'arrête dans un bloc ouvert — page coupée, fichier
  // tronqué — doit tout de même rendre ce qu'il avait commencé.
  if (code !== null) {
    blocs.push({ type: 'pre', text: code.join('\n'), ...(langue ? { language: langue } : {}) })
  }
  fermeTout()

  return blocs
}
