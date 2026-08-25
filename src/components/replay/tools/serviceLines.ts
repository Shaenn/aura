// Les lignes que le CLI ajoute à un résultat et qui ne viennent pas de l'outil.
//
// Le harness numérote les sorties pour qu'une autre puisse y renvoyer : chaque
// résultat se termine par sa poignée, `[result-id: r5]`, et un résultat qui
// répète le précédent est remplacé par le renvoi seul. Aucune des deux n'a de
// sens pour qui relit une session : la poignée ne désigne rien qu'on affiche, et
// le renvoi est une phrase anglaise de plomberie à la place du contenu.
//
// La poignée est attachée aux résultats d'une poignée d'outils — `Read`, `Bash`,
// `Grep`, `Glob`, `ExitPlanMode`, `AskUserQuestion` — et elle est **toujours la
// dernière ligne**, jamais au milieu, jamais seule sur un résultat. Le renvoi,
// lui, est bien plus rare et se limite à `Read`, `Bash` et `Glob`.
//
// Les vues `shell` et `glob` portent leur propre copie de ces motifs, écrite à
// leurs relevés respectifs, parce qu'elles les traitent au milieu d'un bloc de
// lignes de service plus large qui leur est propre. Elles ne sont pas reprises
// ici : ce module sert les vues qui n'avaient rien.

/** La poignée qu'un résultat porte pour qu'un autre puisse y renvoyer. */
import { t } from '@/i18n'

export const RESULT_ID = /^\[result-id: [^\]]+\]$/

/** Le renvoi qui remplace un résultat identique à un précédent. */
const IDENTICAL = /^<identical to result \[[^\]]+\] from your (\w+) call earlier/

/** Le texte sans ses poignées — les lignes de contenu, elles, sont intactes. */
export function stripResultIds(text: string): string {
  if (!text.includes('[result-id:')) return text
  return text
    .split('\n')
    .filter((l) => !RESULT_ID.test(l.trim()))
    .join('\n')
}

// Le refus de l'utilisateur, tel que le CLI le rapporte — au modèle.
//
// La forme est fixe : 194 caractères de tête, le message de l'utilisateur, puis
// 211 caractères de queue qui recommandent au modèle de retenir la correction.
// Soit quatre cents caractères d'anglais de plomberie autour d'un message qui en
// fait quelques dizaines. Les refus visent surtout `ExitPlanMode`, `Edit`, `Bash`,
// `AskUserQuestion` et `Agent` ; une bonne part d'entre eux ne portent aucun
// message — l'utilisateur a refusé sans rien dire.
const REFUSED = "The user doesn't want to proceed with this tool use."
const SAID = /To tell you how to proceed, the user said:([\s\S]*?)(?:\n+Note: The user's next message|$)/

/**
 * Ce que l'utilisateur a dit en refusant, `null` si le résultat n'est pas un
 * refus. `said` est vide quand il n'a rien dit — le refus, lui, reste un fait.
 */
export function userRefusal(text: string): { said: string } | null {
  if (!text.startsWith(REFUSED)) return null
  return { said: (SAID.exec(text)?.[1] ?? '').trim() }
}

/**
 * La phrase à afficher quand le résultat n'est qu'un renvoi, `''` sinon.
 *
 * Le contenu n'a pas été renvoyé par le CLI : il n'y a rien à montrer, et le
 * dire vaut mieux que d'afficher la phrase anglaise comme si elle était la
 * sortie de l'outil.
 */
export function identicalTo(text: string): string {
  const m = IDENTICAL.exec(text.trim())
  if (!m) return ''
  return t('replay.tools.service.identicalTo', { tool: m[1] ?? '' })
}

// Le refus de permission — celui du CLI, pas celui de l'utilisateur.
//
// Quand la session tourne sans demander confirmation, un outil hors périmètre
// est refusé sans que personne ne soit consulté. Le harness répond alors 732
// caractères adressés au modèle : ce qu'il a le droit de tenter à la place, ce
// qu'il ne doit pas contourner, et à quel moment s'arrêter pour en parler à
// l'utilisateur. Rien de tout cela n'apprend au lecteur du rejeu autre chose que
// le fait, qui tient en une ligne.
//
// Ces refus sont rares et suivent tous le même motif, essentiellement sur
// `WebSearch`. La vue `glob` ne s'en sert pas encore — elle a son propre
// traitement des lignes de service, et le cas est trop rare pour y toucher.
const DENIED = /^Permission to use (\S+) has been denied because (.*?)\. IMPORTANT/

/** Ce qui a été refusé et pourquoi, `null` si le résultat n'est pas un refus. */
export function permissionDenied(text: string): { tool: string; why: string } | null {
  const m = DENIED.exec(text)
  if (!m) return null
  const why = m[2] === "Claude Code is running in don't ask mode" ? t('replay.tools.service.dontAsk') : (m[2] ?? '')
  return { tool: m[1] ?? '', why }
}
