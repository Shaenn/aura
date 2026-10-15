// Le journal du BFF, au format des autres projets du parc.
//
// Fastify journalise par pino, et pino écrit du JSON : une ligne par événement,
// l'heure en millisecondes depuis 1970, deux lignes par requête. Ni un terminal
// ni les consoles du radar de VIGIE n'en font rien de lisible. Les applications
// .NET du parc écrivent, elles, par le template console de Serilog :
//
//   {@t:dd/MM/yyyy HH:mm:ss.fff} {@l:w3} {SourceContext court} {@m}\n{@x}
//
// C'est ce format que ce module reproduit, à l'identique, depuis les objets que
// pino lui passe. Un seul format pour tout le parc : un œil qui sait lire le
// back de coptis sait lire n'importe quel BFF, et les consoles du radar
// colorent l'un comme l'autre sans adaptateur de plus.
//
// Pourquoi pas `pino-pretty` : il ajoute toujours un `:` après le niveau et met
// l'heure entre crochets — lu dans son code. L'en empêcher revient à vider tous
// ses champs et à tout réécrire dans `messageFormat`, c'est-à-dire à ne plus
// rien utiliser de lui. Trente lignes ici font la même chose, exactement.
//
// Ce module est fait pour être COPIÉ tel quel dans les autres BFF du parc,
// comme `lancement/` l'est déjà : il ne dépend de rien d'autre que de Node — pas
// même de Fastify, ce qui permet à du code qui ne doit rien savoir de HTTP d'y
// écrire aussi (voir `ecrire`). Ce qui est propre à chaque projet — quelles
// routes sont des relevés — vit dans son `index.ts`, pas ici.

/** Les niveaux pino, dans l'écriture `{@l:w3}` de Serilog. */
const NIVEAUX: Record<number, string> = { 10: 'vrb', 20: 'dbg', 30: 'inf', 40: 'wrn', 50: 'err', 60: 'ftl' }

/** Ce que pino écrit, pour la part qu'on en lit. */
export interface Evenement {
  level: number
  time: number
  msg?: string
  /** L'équivalent du `SourceContext` : posé par `log.child({ source })`. */
  source?: string
  err?: { message?: string; stack?: string }
}

function deux(n: number): string {
  return String(n).padStart(2, '0')
}

/** `dd/MM/yyyy HH:mm:ss.fff`, à l'heure du poste — comme Serilog. */
export function horodater(ms: number): string {
  const d = new Date(ms)
  const date = `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`
  const heure = `${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
  return `${date} ${heure}`
}

/**
 * Un événement pino, en une ligne Serilog — plus la pile de l'erreur, s'il y en
 * a une, sur les lignes suivantes, comme `{@x}`.
 */
export function formater(e: Evenement): string {
  const niveau = NIVEAUX[e.level] ?? 'inf'
  const source = e.source ? ` ${e.source}` : ''
  const message = e.msg ?? e.err?.message ?? ''
  const ligne = `${horodater(e.time)} ${niveau}${source} ${message}`
  return e.err?.stack ? `${ligne}\n${e.err.stack}` : ligne
}

/**
 * La destination à donner à Fastify : `Fastify({ logger: { stream: journal } })`.
 *
 * Écriture synchrone sur la sortie standard, comme pino par défaut : un
 * journal qui se perd au moment où le processus tombe ne sert à rien.
 */
export const journal = {
  write(brut: string): void {
    let e: Evenement
    try {
      e = JSON.parse(brut) as Evenement
    } catch {
      // Ce qui n'est pas du JSON passe tel quel : on n'efface jamais une ligne.
      process.stdout.write(brut.endsWith('\n') ? brut : `${brut}\n`)
      return
    }
    process.stdout.write(`${formater(e)}\n`)
  },
}

/** Les niveaux, par leur nom Serilog, pour `ecrire`. */
const RANGS = { vrb: 10, dbg: 20, inf: 30, wrn: 40, err: 50, ftl: 60 } as const

/**
 * Écrire HORS du logger de Fastify, au même format : depuis du code qui n'a pas
 * le logger sous la main, et qui ne doit pas l'avoir — un module qui ne connaît
 * pas HTTP. La pile de `cause`, si c'est une erreur, suit la ligne.
 */
export function ecrire(niveau: keyof typeof RANGS, source: string, message: string, cause?: unknown): void {
  const stack = cause instanceof Error ? cause.stack : undefined
  process.stdout.write(`${formater({ level: RANGS[niveau], time: Date.now(), source, msg: message, err: stack ? { stack } : undefined })}\n`)
}

/**
 * L'échec du démarrage, avant que Fastify existe ou après qu'il est tombé. Sur
 * la sortie d'erreur : c'est la dernière ligne que le processus écrira.
 */
export function ecrireFatal(source: string, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err))
  process.stderr.write(`${formater({ level: RANGS.ftl, time: Date.now(), source, msg: e.message, err: { stack: e.stack } })}\n`)
}

/**
 * Le niveau d'une requête terminée.
 *
 * `inf`, comme le middleware de requêtes de Serilog — et plus haut quand elle
 * échoue : `wrn` pour une 4xx, `err` pour une 5xx.
 *
 * Seule exception, les RELEVÉS : les routes qu'une page interroge en boucle,
 * que le BFF marque comme telles (`config: { releve: true }` sur la route) —
 * le radar de VIGIE toutes les trois secondes, les sessions d'AURA toutes les
 * cinq. À `inf`, ces lignes noieraient toutes les autres. Elles descendent en
 * `dbg`, et `LOG_LEVEL=debug` les rend visibles. Toutes les lectures ne le
 * sont pas : les mettre toutes en `dbg` cachait aussi celles qu'on vient
 * chercher.
 */
export function niveauRequete(statut: number, releve = false): 'debug' | 'info' | 'warn' | 'error' {
  if (statut >= 500) {
    return 'error'
  }
  if (statut >= 400) {
    return 'warn'
  }
  return releve ? 'debug' : 'info'
}

/** `HTTP GET /api/radar responded 200 in 12.3 ms` — la ligne du middleware de requêtes de Serilog. */
export function ligneRequete(methode: string, url: string, statut: number, ms: number): string {
  return `HTTP ${methode} ${url} responded ${statut} in ${ms.toFixed(1)} ms`
}
