// Le manuel d'un skill, tel que le CLI l'injecte après un appel `Skill`.
//
// Lancer un skill ne fait pas travailler un outil : ça verse son mode d'emploi
// entier dans la fenêtre, en ligne `user` marquée `isMeta`. Le rejeu la rendait
// en markdown comme n'importe quelle prose, sous « Système (contexte) ».
//
// Ces documents sont massifs et très inégaux : une poignée d'entre eux porte
// l'essentiel du volume. Le plus gros pèse plusieurs centaines de milliers de
// caractères ; déplié, il représentait à lui seul la quasi-totalité de la
// hauteur de sa page et de ses nœuds DOM.
//
// Deux marqueurs, et il en faut deux : le CLI a ajouté `sourceToolUseID`
// récemment — les lignes qui le portent désignent toutes un appel
// `Skill` — tandis que l'en-tête `Base directory for this skill:` est présent
// sur 58 injections, dont 44 qui n'ont pas l'autre. Leur union fait 62 ; ni
// l'un ni l'autre seul ne les couvre.

export interface SkillDoc {
  /** Le nom du skill — celui de l'appel, sinon le dernier segment du dossier. */
  name: string;
  /**
   * D'où il vient, en un mot, quand le dossier le dit.
   *
   * La clé du catalogue, pas le mot : ce fichier ne rend rien, et un libellé
   * calculé ici serait figé dans la langue du démarrage. `''` quand le chemin
   * ne dit rien.
   */
  origin: '' | 'bundled' | 'plugin' | 'project' | 'personal';
  /** Le dossier de base, tel que l'en-tête l'annonce. `''` sans en-tête. */
  dir: string;
  /** Le document lui-même, en-tête retirée. */
  body: string;
  lines: number;
}

const HEAD = 'Base directory for this skill: ';

/**
 * D'où vient un skill, lu sur son chemin.
 *
 * Sur les 58 dossiers du parc : 44 sont dans un `.claude/skills` de projet, 8
 * livrés avec le CLI, 4 viennent d'une extension, 2 du dossier personnel.
 */
function originOf(dir: string): SkillDoc['origin'] {
  const p = dir.split('\\').join('/');
  if (p.includes('/bundled-skills/')) return 'bundled';
  if (p.includes('/plugins/')) return 'plugin';
  if (/\/\.claude\/skills\//.test(p)) return p.includes('/Documents/') ? 'project' : 'personal';
  return '';
}

/**
 * Le document, ou `null` si ce texte n'en est pas un.
 *
 * `named` est le nom que le serveur a retrouvé par l'identifiant de l'appel. Il
 * suffit à lui seul : 4 injections du parc n'ont aucun en-tête — `artifact-design`
 * ouvre sur « Approach this as the design lead… », et rien dans son texte ne dit
 * de quel skill il s'agit.
 */
export function skillDocument(text: string, named?: string): SkillDoc | null {
  const lines = text.split('\n');
  const first = lines[0] ?? '';
  const hasHead = first.startsWith(HEAD);
  if (!hasHead && !named) return null;

  const dir = hasHead ? first.slice(HEAD.length).trim() : '';
  // Les 58 en-têtes du parc sont suivies d'une ligne vide : la retirer aussi,
  // sinon le markdown s'ouvre sur un blanc.
  const body = (hasHead ? lines.slice(1).join('\n') : text).replace(/^\r?\n/, '');
  const fromDir = dir.split(/[\\/]/).pop() ?? '';
  const name = named || fromDir;
  if (!name) return null;

  return {
    name,
    origin: originOf(dir),
    dir,
    body,
    lines: body ? body.split('\n').length : 0,
  };
}
