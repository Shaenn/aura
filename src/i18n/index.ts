// L'instance i18n d'AURA, créée hors du boot pour rester importable partout —
// y compris depuis un module qui n'est pas un composant (`utils/format.ts`,
// `router/titles.ts`), où `useI18n()` n'est pas disponible.
//
// La langue n'est pas choisie ici : c'est une préférence, elle vit dans le store
// `settings` et sur le disque du BFF.
//
// Ce module ne touche ni au DOM ni à Quasar — poser la langue sur le navigateur
// est le rôle d'`apply.ts`. La raison est que des helpers purs traduisent, et
// que les tests Node les importent : leur chemin doit rester sans DOM.

import { createI18n } from 'vue-i18n'
import en from './en'
import fr from './fr'

export const SUPPORTED_LOCALES = ['fr', 'en'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

/** Le français est la langue de référence : celle du repli comme celle du départ. */
export const DEFAULT_LOCALE: AppLocale = 'fr'

export function isLocale(v: unknown): v is AppLocale {
  return typeof v === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(v)
}

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { fr, en },
})

/** Traduire hors d'un composant. Dans un template, préférer `useI18n()`. */
export const t = i18n.global.t

/**
 * La clé existe-t-elle ?
 *
 * Utile là où la clé est construite à partir d'une donnée — le nom d'un outil,
 * par exemple, qui peut venir d'un plugin qu'AURA ne connaît pas. Sans ce test,
 * `t()` rendrait la clé brute à l'écran.
 */
export const te = (key: string): boolean => i18n.global.te(key)

/** La locale en vigueur, pour les formateurs qui passent par `Intl`. */
export function currentLocale(): AppLocale {
  const l = i18n.global.locale.value
  return isLocale(l) ? l : DEFAULT_LOCALE
}
