// Ce qu'AURA montre pendant qu'un tour travaille, et à quel rythme.
//
// Le besoin : entre l'envoi d'un message et la réponse, il peut se passer dix
// minutes sans un octet. À l'écran, la ligne d'activité comble ce silence ;
// dans une conversation, il ne restait rien — ni signe que le message avait été
// reçu, ni moyen de distinguer « ça travaille » de « c'est tombé ».
//
// Le support est le **brouillon** (`sendRichMessageDraft`), et non un message :
// il est éphémère, il ne persiste pas dans le fil, et il s'anime au lieu de
// s'empiler. C'est ce qui le rend compatible avec la règle du manuel — AURA
// n'envoie pas le flux d'activité. Un brouillon n'est pas envoyé, il est
// montré, puis il disparaît.
//
// Deux contraintes viennent de l'API, et les deux constantes plus bas en
// découlent :
//
//  - un brouillon **expire au bout de trente secondes**, donc il faut le
//    réémettre tant que le tour dure ;
//  - il ne vaut que pour une **conversation privée**. Un groupe n'en verra
//    rien, et c'est pourquoi l'action de saisie l'accompagne : elle, marche
//    partout.

import type { AgentActivity } from '../../shared/agent.ts'
import { t } from '../i18n/index.ts'

/**
 * Le battement, plus court que l'expiration.
 *
 * Trente secondes est la borne ; vingt laisse de quoi encaisser une requête
 * lente sans que la bulle clignote.
 */
export const BATTEMENT_MS = 20_000

/**
 * Le pas minimal entre deux émissions.
 *
 * Une phase d'outil change toutes les deux ou trois secondes, et suivre chaque
 * changement au plus près ferait une requête par seconde pour un gain nul : en
 * dessous de deux secondes, un libellé qui se remplace se lit comme un
 * scintillement, pas comme une information.
 */
export const PAS_MINIMAL_MS = 2_000

/**
 * Sous ce seuil, on n'affiche pas de durée.
 *
 * Un chrono qui démarre à « 1 s » n'apprend rien et attire l'œil sur le seul
 * moment où il n'y a rien à s'expliquer. C'est le même seuil qu'à l'écran.
 */
const DUREE_MUETTE_S = 5

/** Combien d'outils se nomment avant qu'on se mette à les compter. */
const OUTILS_NOMMES = 2

/** Une durée telle qu'on la lit d'un coup d'œil, jamais au dixième. */
function duree(secondes: number): string {
  if (secondes < 60) return t('passerelle.activite.secondes', { n: Math.floor(secondes) })
  const minutes = Math.floor(secondes / 60)
  const reste = String(Math.floor(secondes % 60)).padStart(2, '0')
  return t('passerelle.activite.minutes', { min: minutes, s: reste })
}

/**
 * Ce que la bulle dit d'une activité, ou `null` s'il n'y a rien à dire.
 *
 * Le libellé suit celui de l'Atelier — mêmes phases, mêmes noms d'outils — pour
 * qu'une même session lue de deux endroits ne raconte pas deux histoires. La
 * durée affichée est celle du **tour**, pas de la phase : une phase dure trois
 * secondes et se remplace, un tour dure dix minutes, et c'est la seconde qu'on
 * se demande vraiment.
 */
export function ligne(activite: AgentActivity, maintenant: number): string | null {
  const { phase, tools, retry, turnStartedAt } = activite
  if (!phase) return null

  let quoi: string
  if (phase === 'retrying' && retry) {
    quoi = t('passerelle.activite.retrying', { attempt: retry.attempt, max: retry.maxRetries })
  } else if (phase !== 'tool') {
    quoi = t(`passerelle.activite.${phase}`)
  } else if (!tools.length) {
    quoi = t('passerelle.activite.toolUnnamed')
  } else {
    // Deux noms plutôt que les trois de l'écran : la bulle d'une messagerie est
    // plus étroite qu'une ligne d'Atelier, et un libellé qui déborde y pousse
    // le chrono hors de vue.
    const vus = tools.slice(0, OUTILS_NOMMES).map((o) => o.name)
    const reste = tools.length - vus.length
    quoi = reste > 0 ? `${vus.join(', ')} +${reste}` : vus.join(', ')
  }

  const secondes = turnStartedAt ? (maintenant - turnStartedAt) / 1000 : 0
  if (secondes < DUREE_MUETTE_S) return quoi
  return t('passerelle.activite.ligne', { quoi, duree: duree(secondes) })
}

/** Ce qu'il faut savoir émettre pour qu'un battement existe. */
export interface Emetteur {
  brouillon: (chatId: number, draftId: number, texte: string) => Promise<void>
  saisie: (chatId: number) => Promise<void>
}

/**
 * Le battement d'une conversation.
 *
 * Il ne tient aucun état du tour : il reçoit une activité, décide s'il y a lieu
 * de la montrer maintenant, et se rappelle tout seul avant l'expiration. Ce qui
 * l'arrête est toujours un événement de la session — fin de tour, demande de
 * permission, session close —, jamais une échéance.
 */
export class Battement {
  private minuteur: ReturnType<typeof setTimeout> | null = null
  private derniere = ''
  private emisA = 0
  private enAttente = false

  constructor(
    private readonly emetteur: Emetteur,
    private readonly chatId: number,
    private readonly draftId: number,
  ) {}

  /**
   * Montre cette activité, si elle mérite d'être montrée maintenant.
   *
   * Un texte inchangé ne se réémet pas avant l'échéance du battement : c'est ce
   * qui distingue « tenir la bulle en vie » de « la redessiner ».
   */
  montre(activite: AgentActivity, maintenant: number = Date.now()): void {
    const texte = ligne(activite, maintenant)
    if (texte === null) {
      this.arrete()
      return
    }
    const change = texte !== this.derniere
    const assezVieux = maintenant - this.emisA >= PAS_MINIMAL_MS
    this.derniere = texte
    if (change && !assezVieux) {
      // Trop tôt pour celui-ci, mais le minuteur en cours reprendra le dernier
      // texte connu : rien ne se perd, seul le rythme est borné.
      this.programme(PAS_MINIMAL_MS - (maintenant - this.emisA))
      return
    }
    this.emet(maintenant)
  }

  /** Coupe le battement. La bulle s'efface d'elle-même en trente secondes. */
  arrete(): void {
    if (this.minuteur) clearTimeout(this.minuteur)
    this.minuteur = null
    this.derniere = ''
  }

  private emet(maintenant: number): void {
    this.emisA = maintenant
    const texte = this.derniere
    if (!this.enAttente) {
      this.enAttente = true
      void Promise.all([this.emetteur.brouillon(this.chatId, this.draftId, texte), this.emetteur.saisie(this.chatId)]).finally(() => {
        this.enAttente = false
      })
    }
    this.programme(BATTEMENT_MS)
  }

  private programme(delai: number): void {
    if (this.minuteur) clearTimeout(this.minuteur)
    // `unref` : un battement ne doit pas retenir le process à l'extinction.
    this.minuteur = setTimeout(() => {
      if (this.derniere) this.emet(Date.now())
    }, delai)
    this.minuteur.unref?.()
  }
}
