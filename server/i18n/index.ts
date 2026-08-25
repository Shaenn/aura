// La langue du serveur.
//
// Pourquoi le BFF traduit lui-même : ce qu'il renvoie au front est lu tel quel
// par l'utilisateur — messages d'erreur, noms de zones de stockage, constats du
// diagnostic. La règle du dépôt est de corriger le message ici et non à
// l'affichage (`server/CLAUDE.md`), et elle vaut aussi pour sa langue. Les
// phrases du diagnostic, en particulier, interpolent des chiffres au milieu
// d'une syntaxe : les découper en fragments pour les recomposer côté front,
// c'est les rendre intraduisibles.
//
// Comment il la connaît : **la requête le lui dit**, en `Accept-Language`, et
// rien d'autre. Le serveur ne va pas la chercher sur le disque, même s'il l'y
// écrit : ce serait une seconde source de vérité, en retard d'un anti-rebond sur
// la première, et deux réponses à la même question finissent toujours par
// diverger. Sans en-tête, le français — la langue de référence.
//
// Le contexte de requête passe par `AsyncLocalStorage` plutôt que d'être promené
// d'appel en appel : `t()` est appelé au fond du diagnostic, à cinq ou six
// niveaux d'une route, par des fonctions qui n'ont aucune raison de connaître
// HTTP. Threader la locale jusque-là aurait touché toute la chaîne pour un
// besoin qui n'est pas le sien.

import { AsyncLocalStorage } from 'node:async_hooks'
import en from './en.ts'
import fr from './fr.ts'

export const SUPPORTED_LOCALES = ['fr', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** Le français est la langue de référence : celle du repli comme celle du départ. */
export const DEFAULT_LOCALE: Locale = 'fr'

export type Catalog = typeof fr

const CATALOGS: Record<Locale, Catalog> = { fr, en }

type Params = Record<string, string | number>

function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(v)
}

const context = new AsyncLocalStorage<Locale>()

/**
 * Fixe la langue de la requête en cours.
 *
 * `enterWith` et non `run` : un hook Fastify rend la main avant que le
 * gestionnaire ne s'exécute, donc rien n'est enveloppable dans une closure.
 * `enterWith` pose le store sur le contexte asynchrone courant et sur tous ceux
 * qui en descendent — ce qui est exactement la durée d'une requête.
 */
export function enterLocale(locale: Locale | null): void {
  context.enterWith(locale ?? DEFAULT_LOCALE)
}

/** Exécute `fn` dans une langue donnée — pour les tests, et le hors-requête. */
export function withLocale<T>(locale: Locale, fn: () => T): T {
  return context.run(locale, fn)
}

/**
 * La langue d'un en-tête `Accept-Language`, si on sait la servir.
 *
 * Volontairement sommaire : on ne sert que deux langues, et le client est notre
 * propre front, qui envoie un code nu. Les poids `;q=` d'une négociation
 * complète n'auraient rien à départager ici.
 */
export function localeFromHeader(header: string | undefined): Locale | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? ''
    const base = tag.split('-')[0]
    if (isLocale(base)) return base
  }
  return null
}

/** La langue en vigueur : celle de la requête, ou la référence hors requête. */
export function locale(): Locale {
  return context.getStore() ?? DEFAULT_LOCALE
}

function lookup(catalog: Catalog, path: string): unknown {
  let node: unknown = catalog
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

/**
 * Le message d'une clé, dans la langue en vigueur.
 *
 * Les paramètres se posent en `{nom}`. Une clé absente du catalogue anglais
 * retombe sur le français plutôt que de rendre la clé brute : mieux vaut une
 * phrase dans la mauvaise langue qu'un identifiant à l'écran.
 */
export function t(path: string, params?: Params): string {
  const found = lookup(CATALOGS[locale()], path) ?? lookup(fr, path)
  if (typeof found !== 'string') return path
  if (!params) return found
  return found.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}
