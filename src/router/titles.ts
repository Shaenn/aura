// Nom d'écran par route — une seule table, lue par deux surfaces : le fil
// d'Ariane du haut (MainLayout) et le titre de l'onglet. Les deux disent donc
// toujours la même chose, y compris quand une page précise son fil (nom de
// projet, identifiant de session) : le titre en découle.
//
// Les libellés vivent dans `src/i18n/<langue>/nav.ts`, indexés par nom de route. Le nom de
// route est l'identifiant stable ; ce qui s'affiche dépend de la langue.

import { t, te } from '@/i18n';

const APP_NAME = 'AURA';

/**
 * Le nom d'écran d'une route, ou une chaîne vide si la route n'en a pas.
 *
 * Les routes hors navigation — la page d'erreur — n'ont délibérément pas
 * d'entrée : elles ne figurent dans aucun fil d'Ariane.
 */
export function routeTitle(name: unknown): string {
  const key = typeof name === 'string' ? name : '';
  return key && te(`nav.${key}`) ? t(`nav.${key}`) : '';
}

/**
 * Compose le titre de l'onglet à partir des segments du fil d'Ariane.
 *
 * L'ordre est inversé — le plus précis d'abord — parce qu'un onglet se rétrécit
 * par la droite : « a1b2c3d · Mon projet · AURA » reste lisible réduit, là où
 * l'ordre du fil d'Ariane n'aurait laissé voir que « Projets… ».
 */
export function documentTitle(labels: string[]): string {
  const parts = labels.filter(Boolean).reverse();
  return [...parts, APP_NAME].join(' · ');
}

/** Titre par défaut d'une route, avant qu'une page ne précise son fil. */
export function titleForRouteName(name: unknown): string {
  if (name === 'home') return documentTitle([]);
  return documentTitle([routeTitle(name)]);
}
