// Poser une langue sur le navigateur — la seule partie de l'i18n qui touche le
// DOM et Quasar.
//
// Elle est séparée d'`index.ts` pour que celui-ci reste sans DOM : des helpers
// purs comme `utils/resourceFrontmatter.ts` ou `components/replay/contextRows.ts`
// traduisent désormais, et sont importés par des tests qui tournent sous Node.
// Tout ce qui suppose un document doit donc rester hors de leur chemin.

import { Lang } from 'quasar';
import { i18n, type AppLocale } from './index';

/**
 * Ce que `Lang.set()` accepte, tel qu'il le déclare lui-même.
 *
 * Quasar type ses packs de langue à deux endroits qui ont cessé de se
 * rejoindre en 2.25 : `lang.d.ts` décrit un pack — ce que renvoie
 * `import('quasar/lang/fr')` — et `index.d.ts` décrit le paramètre de
 * `Lang.set()`. Les libellés d'accessibilité ajoutés à `q-date` y sont
 * déclarés dans deux formes incompatibles : `prevRangeYears?: (range: number)`
 * d'un côté, `prevRangeYears: (range?: number)` de l'autre. Sous
 * `exactOptionalPropertyTypes`, l'un n'est plus assignable à l'autre.
 *
 * L'objet importé est bien celui que la fonction attend à l'exécution : c'est
 * le typage amont qui est incohérent, pas cet appel. Dériver le type du
 * paramètre plutôt que l'écrire à la main fait qu'un vrai changement de forme,
 * lui, sera toujours vu.
 */
type QuasarLangPack = Parameters<typeof Lang.set>[0];

/**
 * Applique une langue à toute l'application.
 *
 * Trois surfaces à tenir ensemble : nos propres messages, l'attribut `lang` du
 * document — que lisent les lecteurs d'écran pour choisir leur voix — et le pack
 * de langue de Quasar (dates des `q-date`, libellés des tables, pagination).
 *
 * `Lang.set()` repose ensuite son propre code sur `lang` (`en-US` là où nous
 * posions `en`) — plus précis, donc tant mieux : notre ligne n'est là que pour
 * garantir un attribut correct même quand le pack, lui, n'arrive pas.
 *
 * L'ordre n'est pas indifférent. Les deux premières sont synchrones et sûres ;
 * la troisième est un import réseau, et cette fonction est appelée depuis un
 * boot **awaité**. Un rejet y remonterait jusqu'à Quasar, qui abandonne le
 * montage : une préférence de langue laisserait AURA sur une page blanche.
 * Le pack est un raffinement — la pagination d'un tableau en anglais au milieu
 * d'une interface française —, jamais une raison de ne pas démarrer.
 *
 * Les deux imports sont écrits en clair plutôt que construits : Vite ne sait
 * découper un import dynamique que s'il peut en lire le chemin.
 */
export async function applyLocale(locale: AppLocale): Promise<void> {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  try {
    const pack =
      locale === 'en' ? await import('quasar/lang/en-US') : await import('quasar/lang/fr');
    Lang.set(pack.default as QuasarLangPack);
  } catch (e) {
    console.error(`Pack de langue Quasar « ${locale} » non chargé`, e);
  }
}
