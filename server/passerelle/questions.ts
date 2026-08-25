// Le formulaire de l'Atelier, porté dans une conversation.
//
// Même doctrine que `routage.ts` : tout ce qui décide vit ici, sans réseau ni
// registre — c'est ce qui rend le comportement vérifiable par un test sans bot.
// `index.ts` ne fait qu'émettre ce que ce fichier rend et transmettre ce qu'il
// conclut.
//
// Ce qu'il reproduit est `src/components/agent/AskPrompt.vue`, et rien de plus :
// une question par écran, le choix multiple qui se coche, la réponse libre quand
// aucune option ne convient. La forme des réponses est celle du harnais — les
// choix multiples joints par `, ` —, parce que c'est elle que le rejeu relit.

import type { InlineKeyboardMarkup } from 'node-telegram-bot-api'
import type { AskQuestion } from '../../shared/agent.ts'
import { t } from '../i18n/index.ts'
import type { InputRichBlock } from './riche.ts'
import { grille, tronqueBouton, type Bouton } from './telegram.ts'

/**
 * Ce qu'une maquette prend au plus dans son bloc.
 *
 * Quatre options portant chacune deux cents lignes d'ASCII dépasseraient les
 * 32 768 caractères du message riche, et c'est le message **entier** que l'API
 * refuserait alors. La cascade de `envoieRendu` rattraperait la chute, mais en
 * perdant toute la mise en forme : mieux vaut couper une maquette que rendre le
 * formulaire en texte nu.
 */
const MAX_MAQUETTE = 1_200

/** Une demande en vol, et où l'on en est. */
export interface Formulaire {
  id: string
  questions: AskQuestion[]
  /** L'étape — une question par écran, comme le stepper de l'Atelier. */
  etape: number
  /** Les choix faits, par question. Un choix multiple garde sa liste. */
  choix: string[][]
  /** Le message de l'étape, dont on réécrit le clavier quand on coche. */
  messageId: number | null
}

export function formulaire(id: string, questions: AskQuestion[]): Formulaire {
  return { id, questions, etape: 0, choix: questions.map(() => []), messageId: null }
}

/** La question de l'étape courante, si l'on n'est pas déjà au bout. */
export function courante(f: Formulaire): AskQuestion | undefined {
  return f.questions[f.etape]
}

/**
 * Ce qu'une pression a produit, et ce que l'appelant doit en faire.
 *
 * `coche` ne demande qu'une réécriture du clavier — le texte de la question ne
 * bouge pas, ce qui tombe bien : un message riche ne se réécrit pas.
 */
export type Suite = 'coche' | 'suivant' | 'fini' | 'rien'

/**
 * `messageId` n'est **pas** remis à zéro ici, et c'est délibéré : l'appelant en
 * a encore besoin pour retirer le clavier de l'étape qu'on quitte. Sans cela,
 * les boutons d'un écran déjà répondu resteraient pressables et agiraient sur la
 * question suivante — une option cochée par un clic destiné à la précédente.
 */
function avance(f: Formulaire): Suite {
  f.etape += 1
  return f.etape >= f.questions.length ? 'fini' : 'suivant'
}

/**
 * Une option pressée, ou la validation d'un choix multiple.
 *
 * `suffixe` est ce que le bouton portait : un rang d'option, ou `ok`.
 */
export function presse(f: Formulaire, suffixe: string): Suite {
  const question = courante(f)
  const choix = f.choix[f.etape]
  if (!question || !choix) return 'rien'

  if (suffixe === 'ok') {
    // Valider sans rien avoir coché ne veut rien dire : on laisse l'écran en
    // place plutôt que d'envoyer une réponse vide au modèle.
    return choix.length ? avance(f) : 'rien'
  }

  const option = /^\d+$/.test(suffixe) ? question.options[Number(suffixe)] : undefined
  if (!option) return 'rien'

  if (!question.multiSelect) {
    f.choix[f.etape] = [option.label]
    return avance(f)
  }

  const deja = choix.indexOf(option.label)
  if (deja === -1) choix.push(option.label)
  else choix.splice(deja, 1)
  return 'coche'
}

/**
 * Une réponse écrite à la main, qui prend la place des options.
 *
 * C'est le « Other » du harnais, et la seule façon de répondre ce qu'aucun
 * bouton ne dit. Elle remplace ce qui était coché — répondre en toutes lettres
 * n'ajoute pas à un choix, il le tranche.
 */
export function repondLibre(f: Formulaire, texte: string): Suite {
  if (!courante(f)) return 'rien'
  f.choix[f.etape] = [texte]
  return avance(f)
}

/** Les réponses, dans la forme que le harnais écrit et que le rejeu relit. */
export function reponses(f: Formulaire): Record<string, string> {
  const out: Record<string, string> = {}
  f.questions.forEach((q, i) => {
    out[q.question] = (f.choix[i] ?? []).join(', ')
  })
  return out
}

/** Le clavier d'une étape : une option par bouton, cochée ou non. */
export function clavier(f: Formulaire): InlineKeyboardMarkup {
  const question = courante(f)
  if (!question) return { inline_keyboard: [] }
  const pris = f.choix[f.etape] ?? []

  const cases: Bouton[] = question.options.map((o, i) => ({
    // La marque vit dans le libellé : c'est le seul endroit d'un clavier
    // Telegram où un état puisse se lire.
    texte: tronqueBouton(question.multiSelect ? `${mark(pris, o.label)} ${o.label}` : o.label),
    donnee: `q:${f.id}:${i}`,
  }))

  const solo: Bouton[] = question.multiSelect ? [{ texte: t('passerelle.questionValider'), donnee: `q:${f.id}:ok` }] : []
  return grille(cases, solo)
}

function mark(pris: string[], label: string): string {
  return pris.includes(label) ? '☑' : '☐'
}

/**
 * L'écran d'une étape : les blocs riches, le texte de repli, et le clavier.
 *
 * Les blocs se construisent un à un plutôt que par `enBlocs` : il n'y a pas de
 * markdown à analyser ici, seulement une structure connue à poser.
 */
export function ecran(f: Formulaire): {
  blocs: InputRichBlock[]
  brut: string
  clavier: InlineKeyboardMarkup
} {
  const question = courante(f)
  if (!question) return { blocs: [], brut: '', clavier: { inline_keyboard: [] } }

  const total = f.questions.length
  const entete = total > 1 ? t('passerelle.questionEtape', { header: question.header, n: f.etape + 1, total }) : question.header

  const blocs: InputRichBlock[] = [
    { type: 'heading', text: entete, size: 3 },
    { type: 'paragraph', text: question.question },
  ]
  const lignes = [entete, '', question.question]

  if (question.multiSelect) {
    const mention = t('passerelle.questionMultiple')
    blocs.push({ type: 'paragraph', text: { type: 'italic', text: mention } })
    lignes.push('', mention)
  }

  question.options.forEach((o, i) => {
    // Le numéro relie le bouton — rogné à 32 caractères — au texte entier qui le
    // précède. Sans lui, un libellé long devient un choix qu'on fait de mémoire.
    const titre = `${i + 1}. ${o.label}`
    blocs.push({
      type: 'paragraph',
      text: o.description ? [{ type: 'bold', text: titre }, ` — ${o.description}`] : { type: 'bold', text: titre },
    })
    lignes.push('', o.description ? `${titre} — ${o.description}` : titre)

    if (o.preview) {
      const maquette = borne(o.preview, MAX_MAQUETTE)
      blocs.push({ type: 'pre', text: maquette })
      lignes.push(maquette)
    }
  })

  const pied = t('passerelle.questionLibre')
  blocs.push({ type: 'paragraph', text: { type: 'italic', text: pied } })
  lignes.push('', pied)

  return { blocs, brut: lignes.join('\n'), clavier: clavier(f) }
}

function borne(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte
}
