// Les chiffres du diagnostic, mis en forme une seule fois.
//
// Ils étaient écrits deux fois — dans `rules.ts` et dans `recommend.ts` — avec
// la virgule et le symbole du français en dur. Or ces nombres sont posés *au
// milieu* des phrases que le serveur rend : une phrase anglaise qui annonce
// « 0,42 $ » se trahit à son chiffre avant même qu'on l'ait lue.
//
// `Intl` sait déjà tout cela — séparateur décimal, place du symbole, espace
// avant le pourcentage — et le sait pour les deux langues à la fois.

import { locale } from '../i18n/index.ts'

/** Un montant en dollars, au prix catalogue de l'API. */
export function usd(n: number): string {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/**
 * Un rapport entre deux grandeurs de même nature : `1,5` / `1.5`.
 *
 * Une décimale, comme le `toFixed(1)` qu'il remplace — mais la virgule du
 * français au lieu du point.
 */
export function ratio(n: number): string {
  return new Intl.NumberFormat(locale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)
}

/** Une part, en pourcentage entier : `78 %` / `78%`. */
export function pct(n: number): string {
  return new Intl.NumberFormat(locale(), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(n)
}

/**
 * Un compte de tokens, abrégé.
 *
 * `k` et `M` restent tels quels dans les deux langues — ce sont des symboles,
 * pas des mots. Ce qui change est l'espace qui les précède : le français en met
 * une devant ses symboles, l'anglais les colle (`605 k` contre `605k`). Une
 * règle de typographie, donc, et non une traduction : elle n'a rien à faire dans
 * le catalogue.
 */
export function tok(n: number): string {
  function num(v: number, digits: number): string {
    return new Intl.NumberFormat(locale(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(v)
  }
  const space = locale() === 'fr' ? ' ' : ''

  if (n >= 1_000_000) return `${num(n / 1_000_000, 1)}${space}M`
  if (n >= 1_000) return `${num(Math.round(n / 1_000), 0)}${space}k`
  return num(Math.round(n), 0)
}
