// Le pliage des compteurs de tokens d'une réponse API.
//
// Claude Code écrit une ligne JSONL par *bloc de contenu*, si bien qu'une seule
// réponse répète son `message.id` sur plusieurs lignes — et leurs `usage` ne sont
// pas identiques : `output_tokens` grossit au fil du streaming, la dernière ligne
// porte le compte vrai, la première une fraction. Compter les lignes gonfle donc
// tous les totaux, et les gonfle *inégalement* : un tour riche en outils compte
// plus de fois qu'un tour qui ne dit qu'une phrase.
//
// Ces quatre fonctions sont la parade. Elles vivent ici, et non dans le module
// qui les a écrites en premier, parce que deux agrégateurs les utilisent
// désormais — `usage.ts` (le cube coût) et `diagnostics/signals.ts` (le signal
// par session). S'ils pliaient différemment, leurs totaux divergeraient sans que
// rien ne le signale, et le diagnostic accuserait des sessions que la page Usage
// dit innocentes. Un seul pliage, partagé, rend l'écart impossible.

import type { TokenCounts } from './pricing.ts'

export const ZERO: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }

export function zeroTokens(): TokenCounts {
  return { ...ZERO }
}

export function addTokens(a: TokenCounts, b: TokenCounts): void {
  a.input += b.input
  a.output += b.output
  a.cacheRead += b.cacheRead
  a.cacheCreate += b.cacheCreate
}

/**
 * De combien `next` dépasse ce qui est déjà compté pour une réponse, champ par
 * champ. Avance `counted` au maximum courant. Un champ qui a rétréci vaut zéro :
 * les instantanés de streaming ne font que croître, et une ligne aberrante ne
 * doit jamais soustraire.
 */
export function growth(counted: TokenCounts, next: TokenCounts): TokenCounts {
  const delta = { ...ZERO }
  for (const k of ['input', 'output', 'cacheRead', 'cacheCreate'] as const) {
    if (next[k] > counted[k]) {
      delta[k] = next[k] - counted[k]
      counted[k] = next[k]
    }
  }
  return delta
}

/** `AAAA-MM-JJ` dans le fuseau du serveur — le calendrier de l'utilisateur. */
export function localDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
