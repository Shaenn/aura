// Ce que toute requête vers `/api/*` porte, quel que soit le domaine.
//
// Pour l'instant une seule chose, mais elle vaut d'être en un point : la langue.
// Le BFF rend ses messages — erreurs, noms de zones, constats du diagnostic —
// dans la langue que la requête demande, et il ne la déduit de rien d'autre.
// Oublier l'en-tête sur un service, c'est le voir répondre en français au milieu
// d'une interface anglaise.

import { currentLocale } from '@/i18n';

/**
 * Une table d'en-têtes, sans passer par `HeadersInit`.
 *
 * Ce module est tiré dans le graphe des tests, qui compilent sous les règles du
 * BFF — Node, sans `lib: dom`. Un type DOM ici casserait `pnpm typecheck` sans
 * rien apporter : nos en-têtes sont des paires de chaînes, et rien d'autre.
 */
export type HeaderMap = Record<string, string>;

/**
 * Les en-têtes communs, fusionnés avec ceux de l'appelant.
 *
 * `Accept-Language` porte un code nu (`fr`, `en`) : le serveur n'en sert que
 * deux et n'a rien à négocier. Ce que l'appelant passe l'emporte — un service
 * qui a une bonne raison de forcer autre chose n'est pas contrarié ici.
 */
export function apiHeaders(extra?: HeaderMap): HeaderMap {
  return {
    Accept: 'application/json',
    'Accept-Language': currentLocale(),
    ...extra,
  };
}
