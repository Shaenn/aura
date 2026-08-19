// Où en est la fenêtre de contexte, et quand cela mérite d'être dit.
//
// Même doctrine que `routage.ts` et `questions.ts` : tout ce qui décide vit ici,
// sans réseau ni registre — c'est ce qui rend le comportement vérifiable par un
// test sans bot. `index.ts` ne fait qu'émettre ce que ce fichier rend.
//
// Le nombre, lui, ne se calcule pas ici : `SessionRunner.contextWindow` le relève
// sur les réponses du modèle, et c'est la **même somme** que la page Contexte
// emploie (`transcript.ts`, `settleTurn`). Ce fichier ne fait que le rapporter à
// la fenêtre du modèle et juger s'il y a lieu d'en parler.

import { t } from '../i18n/index.ts';

/**
 * À partir d'où la fenêtre mérite qu'on en parle sans qu'on ait rien demandé.
 *
 * C'est le garde-fou du signal `contextFill` (`diagnostics/thresholds.ts`),
 * repris à l'identique : deux surfaces qui parlent du même remplissage n'ont pas
 * à se contredire de deux points de pourcentage. La valeur est recopiée et non
 * importée — `SPECS` y est privé, et les deux mesures ne portent pas sur la même
 * chose (le diagnostic juge le pic d'une session finie contre le parc, celle-ci
 * lit une session vivante maintenant). Un test tient les deux nombres égaux.
 */
export const SEUIL_ALERTE = 0.8;

/**
 * Un relevé de fenêtre, rapporté à la limite du modèle.
 *
 * Rien n'horodate le relevé, et ce n'est pas un oubli : la fenêtre ne change
 * qu'aux tours et aux compactions, tous deux relevés. Entre les deux, le dernier
 * chiffre **est** le chiffre courant, si vieux soit-il — dater la mesure ferait
 * croire à une péremption qui n'existe pas.
 */
export interface Fenetre {
  /** Le contexte du dernier tour, exact. `0` quand aucun tour n'a répondu. */
  tokens: number;
  /** La fenêtre du modèle, telle que `contextLimitFor` la déduit. */
  limite: number;
}

/**
 * La part occupée, entre 0 et 1.
 *
 * Bornée à 1 : un relevé au-dessus de la limite n'est pas impossible — la
 * fenêtre déduite peut être la petite alors que la session tourne sur la grande,
 * le temps qu'une preuve arrive — et « 118 % » ferait douter du reste de
 * l'écran là où « 100 % » dit déjà tout ce qu'il y a à dire.
 */
export function part(f: Fenetre): number {
  if (f.tokens <= 0 || f.limite <= 0) return 0;
  return Math.min(1, f.tokens / f.limite);
}

/**
 * Ce que `/etat` écrit.
 *
 * Court, parce que cela se lit sur un téléphone. Le modèle et le mode ne sont
 * pas du décor : **la limite dépend du modèle**, et un pourcentage sans son
 * dénominateur ne se vérifie pas. Ce sont des étiquettes de données — AURA y
 * reste nominale, comme `docs/voix.md` le demande.
 */
export function lignes(f: Fenetre, cwd: string, modele: string, mode: string): string[] {
  const entete = t('passerelle.etatEntete', { cwd, modele, mode });

  // Une session neuve n'a rien fait répondre au modèle : il n'y a pas de
  // fenêtre à annoncer. Le dire vaut mieux que de montrer un zéro, qui se lit
  // comme une mesure alors que c'est une absence de mesure.
  if (f.tokens <= 0) return [entete, '', t('passerelle.etatSansReleve')];

  return [
    entete,
    '',
    t('passerelle.etatFenetre', {
      tokens: nombre(f.tokens),
      limite: nombre(f.limite),
      pourcent: Math.round(part(f) * 100),
    }),
  ];
}

/**
 * Faut-il alerter maintenant ?
 *
 * Pur : l'état « déjà dit » vit sur le fil de la conversation, pas ici. Une
 * seule fois par remplissage — répéter à chaque tour ne dirait rien de plus et
 * transformerait un avertissement en bruit de fond.
 */
export function alerte(deja: boolean, ratio: number): boolean {
  return !deja && ratio >= SEUIL_ALERTE;
}

/**
 * Un nombre de tokens tel qu'on le lit d'un coup d'œil.
 *
 * L'espace fine insécable est celle du français typographique, et elle tient
 * dans un message : sans elle, `112400` se compte à la main.
 */
function nombre(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
