// Le seul fichier qui sache que la messagerie est Telegram.
//
// Il s'appuie sur `node-telegram-bot-api` (v2), qui apporte deux choses que
// notre client à la main ne pouvait pas donner :
//
//  - **les types de l'API**, jusqu'aux blocs riches. Ils ferment un piège
//    coûteux : l'API accepte les champs qu'elle ne connaît pas et les ignore en
//    silence, si bien qu'un `header` écrit pour `is_header` ne produit aucune
//    erreur — seulement un tableau sans en-tête. Le compilateur, lui, refuse ;
//  - la boucle de long-polling, son acquittement et ses reprises.
//
// Ce qui reste à nous, parce que la bibliothèque ne le fournit pas : la cascade
// de replis d'un document (blocs → bloc unique → texte nu), et la garde qui
// filtre les conversations avant tout traitement.
//
// Le long-polling reste **sortant**, et c'est la raison d'être du dispositif :
// AURA continue de n'écouter que la boucle locale (`server/index.ts`), et
// `guard.ts` n'a rien de nouveau à trancher. Aucun port ne s'ouvre pour ceci.

import { Api, Bot } from 'node-telegram-bot-api';
import type {
  InlineKeyboardMarkup,
  InputRichBlock as InputRichBlockLib,
} from 'node-telegram-bot-api';
import { MAX_RICHE, type InputRichBlock } from './riche.ts';

/** Ce qu'un message ordinaire accepte. Le riche en prend huit fois plus. */
const MAX_TEXTE = 4_000;

/** Coupe à la borne, plutôt que de laisser l'API refuser le message entier. */
function borne(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte;
}

/** Un message reçu, réduit à ce dont la Passerelle a besoin. */
export interface MessageEntrant {
  chatId: number;
  texte: string;
}

/** Un bouton pressé sous un message d'AURA. */
export interface BoutonPresse {
  chatId: number;
  /** À renvoyer pour que Telegram cesse d'afficher l'attente sur le bouton. */
  callbackId: string;
  /** Ce que le bouton portait — voir `boutons()`. */
  donnee: string;
}

/**
 * Ce qu'un envoi de document a donné : par quel barreau il est passé, et sous
 * quel identifiant. Le second sert à réécrire le clavier d'un formulaire.
 */
export interface Rendu {
  voie: 'riche' | 'nu' | 'brut';
  messageId: number | null;
}

/** Un bouton : ce qu'il affiche, et ce qu'il renvoie quand on le presse. */
export interface Bouton {
  texte: string;
  donnee: string;
}

/**
 * Un libellé de bouton : Telegram les veut courts, et les tronque mal.
 *
 * Vit ici plutôt que chez l'appelant parce que c'est une borne de Telegram, au
 * même titre que la largeur d'une rangée.
 */
export function tronqueBouton(texte: string): string {
  return texte.length > 32 ? `${texte.slice(0, 31)}…` : texte;
}

/** Une rangée de boutons sous un message. */
export function boutons(paires: Bouton[]): InlineKeyboardMarkup {
  return { inline_keyboard: [paires.map((p) => ({ text: p.texte, callback_data: p.donnee }))] };
}

/**
 * Le caractère qui élargit une bulle sans rien y écrire.
 *
 * `U+2800`, la case braille vide. Contrairement à une espace ordinaire, elle
 * n'est pas rognée en fin de ligne : Telegram la compte comme un caractère
 * plein, et elle ne dessine rien. C'est l'astuce répandue des claviers de bots,
 * et la seule qui fonctionne — un remplissage placé dans les **libellés** des
 * boutons n'a, lui, aucun effet, la largeur du clavier étant celle de la bulle.
 */
const BLANC = '⠀';

/**
 * Combien de caractères ordinaires il faut pour saturer la largeur d'une bulle.
 *
 * Mesuré sur un même clavier de trois boutons : 35 caractères donnent 285 px,
 * 50 en donnent 391, et le plafond de 480 px est atteint vers 63. Au-delà, plus
 * rien ne bouge.
 */
const CIBLE_CARACTERES = 63;

/**
 * Ce que vaut un blanc braille, en caractères ordinaires.
 *
 * **Il est plus large qu'une lettre**, et l'ignorer était un bug : 22 lettres
 * suivies de 25 blancs saturent la bulle, là où il aurait fallu 63 lettres pour
 * le même résultat — les 25 blancs valent donc les 41 lettres manquantes, soit
 * 1,6 chacun. Compter un blanc pour une lettre sous-remplissait tous les
 * en-têtes moyens, et les chemins profonds gardaient des boutons rétrécis.
 */
const BLANC_EN_CARACTERES = 1.6;

/**
 * Complète un texte pour que son clavier prenne toute la largeur.
 *
 * Sans cela, la largeur du clavier suit celle du texte : un en-tête de vingt
 * caractères donne des boutons de soixante pixels, où trois libellés côte à
 * côte deviennent illisibles. C'est un artifice, et il est assumé — la seule
 * autre voie était d'allonger le texte visible, c'est-à-dire d'écrire pour
 * occuper de la place.
 *
 * Ne s'applique qu'aux écrans à boutons : un message ordinaire n'a aucune
 * raison de traîner des caractères que le copier-coller emporterait.
 */
export function elargi(texte: string): string {
  // La largeur d'une bulle est celle de sa **ligne la plus longue**. Un texte
  // qui l'atteint déjà n'a besoin de rien.
  const plusLongue = texte.split('\n').reduce((max, l) => Math.max(max, l.length), 0);
  if (plusLongue >= CIBLE_CARACTERES) return texte;

  // Le remplissage prend **sa propre ligne**, et ce n'est pas un détail. Collé
  // au texte, il le pousse au-delà du bord et coupe la dernière phrase en deux
  // — « 19 fichiers. » devenait « 19 » puis « fichiers. » sur un écran de
  // téléphone, plus étroit que celui où la cible a été mesurée. Sur sa ligne, il
  // n'a plus rien à bousculer.
  //
  // Conséquence à ne pas manquer : cette ligne ne **complète** plus le texte,
  // elle le **remplace** dans le calcul de la largeur. Il faut donc de quoi
  // atteindre la cible à elle seule — la première version en mettait juste ce
  // qui manquait au texte, et rétrécissait les bulles au lieu de les élargir.
  return `${texte}\n${BLANC.repeat(Math.ceil(CIBLE_CARACTERES / BLANC_EN_CARACTERES))}`;
}

/**
 * Ce qu'une rangée de boutons offre, en caractères.
 *
 * Telegram partage la largeur **également** entre les boutons d'une rangée :
 * trois boutons font chacun un tiers, quel que soit leur texte, et ce qui
 * dépasse est rogné. Le budget d'une rangée est donc fixe, et c'est le libellé
 * le plus long qui décide combien s'y tiennent.
 *
 * Trente-deux : la largeur d'un téléphone en portrait, qui est la contrainte de
 * cette surface. Un écran large en supporterait plus — mais c'est le petit qui
 * décide, puisque c'est pour lui que la Passerelle existe.
 */
const LARGEUR_RANGEE = 32;

/**
 * Combien de boutons par rangée, au maximum.
 *
 * Pas une limite de l'API mais une limite du doigt : au-delà de trois, un
 * bouton fait moins d'un tiers d'écran et devient une cible qu'on manque.
 */
const MAX_PAR_RANGEE = 3;

/**
 * Range les boutons en rangées, en remplissant chacune au plus près.
 *
 * Un nombre de colonnes fixe pour toute la grille gaspille dès que les
 * longueurs varient : quatre `rules/ 19` tiennent sur une rangée là où un seul
 * `SPEC-014_notes-de-projet-longues.md` la remplit. On remplit donc comme un
 * texte se compose — tant que ça tient, on ajoute.
 *
 * Le critère se recalcule à chaque ajout, car c'est le plus long de **la
 * rangée** qui fixe la largeur de tous ses boutons : ajouter un libellé long à
 * une rangée de courts peut la faire déborder d'un coup.
 *
 * Les rangées passées en `solo` gardent leur pleine largeur — c'est ce qu'il
 * faut d'une action, qu'on ne veut pas voir se confondre avec la liste.
 */
export function grille(cases: Bouton[], solo: Bouton[] = []): InlineKeyboardMarkup {
  const rangees: { text: string; callback_data: string }[][] = [];
  let rangee: Bouton[] = [];
  let plusLong = 0;

  const pose = (): void => {
    if (!rangee.length) return;
    rangees.push(rangee.map((b) => ({ text: b.texte, callback_data: b.donnee })));
    rangee = [];
    plusLong = 0;
  };

  for (const bouton of cases) {
    const large = Math.max(plusLong, bouton.texte.length);
    // Un bouton plus large qu'une rangée entière ne tient nulle part : il prend
    // la sienne, où il sera rogné mais lisible sur toute la largeur.
    if (
      rangee.length &&
      (large * (rangee.length + 1) > LARGEUR_RANGEE || rangee.length >= MAX_PAR_RANGEE)
    ) {
      pose();
    }
    rangee.push(bouton);
    plusLong = Math.max(plusLong, bouton.texte.length);
  }
  pose();

  for (const b of solo) rangees.push([{ text: b.texte, callback_data: b.donnee }]);
  return { inline_keyboard: rangees };
}

export class Telegram {
  private readonly api: Api;
  private readonly bot: Bot;
  private stopped = false;

  constructor(token: string) {
    this.api = new Api(token);
    this.bot = new Bot(token);
  }

  /**
   * Le nom du bot, ou `null` si le jeton ne vaut rien.
   *
   * Sert à démarrer : un jeton refusé doit se dire une fois, pas se retenter
   * indéfiniment dans une boucle que personne ne regarde.
   */
  async identite(): Promise<string | null> {
    try {
      const moi = await this.api.getMe();
      return moi.username || null;
    } catch {
      return null;
    }
  }

  /**
   * Branche les gestionnaires et lance la boucle.
   *
   * `autorise` est consulté **avant** tout traitement, et un message venu
   * d'ailleurs ne reçoit aucune réponse : répondre confirmerait que ce bot
   * existe et à quoi il sert.
   */
  ecoute(
    autorise: (chatId: number) => boolean,
    surMessage: (m: MessageEntrant) => Promise<void>,
    surBouton: (b: BoutonPresse) => Promise<void>,
    surErreur: (message: string) => void,
  ): void {
    this.bot.on('message', async (ctx) => {
      const chatId = ctx.chatId;
      const texte = ctx.message?.text;
      if (!chatId || !texte || !autorise(chatId)) return;
      await surMessage({ chatId, texte });
    });

    this.bot.on('callback_query', async (ctx) => {
      const chatId = ctx.chatId;
      const rappel = ctx.callbackQuery;
      if (!chatId || !rappel?.data || !autorise(chatId)) return;
      // Accuser d'abord : sans cela le bouton tourne pendant tout le traitement.
      await ctx.answerCallbackQuery();
      await surBouton({ chatId, callbackId: rappel.id, donnee: rappel.data });
    });

    // Une erreur de traitement ne doit pas arrêter la boucle : la suivante
    // pourrait très bien passer.
    this.bot.catch((err) => {
      surErreur(err instanceof Error ? err.message : String(err));
    });

    void this.bot.startPolling().catch((e: unknown) => {
      if (this.stopped) return;
      surErreur(e instanceof Error ? e.message : String(e));
    });
  }

  /**
   * Envoie un texte. `clavier` ajoute des boutons sous le message.
   *
   * La coupe est faite ici et non chez l'appelant : c'est une borne de
   * Telegram, et un module qui compose un message n'a pas à la connaître.
   */
  async envoie(chatId: number, texte: string, clavier?: InlineKeyboardMarkup): Promise<void> {
    try {
      await this.api.sendMessage({
        chat_id: chatId,
        text: borne(texte, MAX_TEXTE),
        ...(clavier ? { reply_markup: clavier } : {}),
      });
    } catch {
      // Une messagerie injoignable n'est pas une panne d'AURA : le BFF continue
      // de servir l'interface et les sessions de tourner.
    }
  }

  /**
   * Envoie un texte et rend l'identifiant du message, pour pouvoir le réécrire.
   *
   * C'est ce qui permet de naviguer **dans un seul message** plutôt que d'en
   * empiler un par clic : une conversation n'a pas de bouton « retour », et une
   * pile de listes mortes derrière soi est le contraire d'un fil qu'on relit.
   */
  async envoieSuivi(
    chatId: number,
    texte: string,
    clavier?: InlineKeyboardMarkup,
  ): Promise<number | null> {
    try {
      const envoye = await this.api.sendMessage({
        chat_id: chatId,
        text: texte,
        ...(clavier ? { reply_markup: clavier } : {}),
      });
      return envoye.message_id;
    } catch {
      return null;
    }
  }

  /**
   * Réécrit un message déjà envoyé.
   *
   * Rend `false` si Telegram refuse — un message trop vieux, supprimé, ou dont
   * le contenu n'a pas changé. L'appelant retombe alors sur un envoi neuf plutôt
   * que de laisser le clic sans effet visible.
   */
  async reecrit(
    chatId: number,
    messageId: number,
    texte: string,
    clavier?: InlineKeyboardMarkup,
  ): Promise<boolean> {
    try {
      await this.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: texte,
        ...(clavier ? { reply_markup: clavier } : {}),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ne réécrit que le clavier d'un message, sans toucher à son texte.
   *
   * C'est la seule réécriture possible sur un message riche : la bibliothèque
   * expose `sendRichMessage` mais **aucun** `editMessageRichText`. Cocher une
   * case d'un formulaire passe donc par ici — et c'est de toute façon ce qu'on
   * veut, la question au-dessus n'ayant aucune raison de bouger.
   */
  async reecritClavier(
    chatId: number,
    messageId: number,
    clavier: InlineKeyboardMarkup,
  ): Promise<boolean> {
    try {
      await this.api.editMessageReplyMarkup({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: clavier,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Déclare la liste que Telegram propose sous le `/`.
   *
   * `langue` absente pose la liste **par défaut**, celle que voit un client dont
   * la langue n'a pas la sienne. Un échec ne coûte que l'autocomplétion : les
   * commandes restent reconnues, puisque c'est `routage.ts` qui en juge et non
   * cette déclaration.
   */
  async declare(
    commandes: { command: string; description: string }[],
    langue?: string,
  ): Promise<boolean> {
    try {
      await this.api.setMyCommands({
        commands: commandes,
        ...(langue ? { language_code: langue } : {}),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Envoie un document, du plus riche au plus sûr.
   *
   * Trois tentatives, dans cet ordre, et les deux premières sont le **même
   * appel** — ce qui change entre elles est la structure, pas le format :
   *
   *  1. **les blocs** — de vrais tableaux, avec bordures. C'est la seule voie
   *     qui rende un tableau lisible.
   *  2. **un bloc unique** — le document tel quel dans un seul `paragraph`.
   *     Les retours à la ligne et les lignes vides sont conservés (mesuré) : on
   *     perd la mise en forme, on garde la mise en page. Sert si c'est la
   *     *structure* qui a été refusée — trop de blocs, imbrication trop
   *     profonde —, et il garde les 32 768 caractères et le repli « Afficher
   *     plus » du message riche.
   *  3. **texte nu** — un message ordinaire, donc **coupé à 4 000
   *     caractères**. Ne sert que si l'API riche est indisponible sur ce
   *     compte, et c'est le seul barreau qui perde du contenu.
   *
   * Ce n'est pas de la prudence de principe : le contenu vient de documents
   * qu'on n'a pas écrits, et un seul bloc mal formé fait échouer l'envoi entier.
   * Un document laid vaut mieux qu'un document disparu.
   */
  async envoieRendu(
    chatId: number,
    blocs: InputRichBlock[],
    brut: string,
    clavier?: InlineKeyboardMarkup,
  ): Promise<Rendu> {
    const markup = clavier ? { reply_markup: clavier } : {};

    // Sans cela, Telegram fabrique des liens dans notre dos. Le piège est
    // propre à ce que la Passerelle affiche : `.md` est un domaine de premier
    // niveau — la Moldavie —, si bien que `0.livraison.md` devient un lien vers
    // un site qui n'existe pas. `.py`, `.pl`, `.sh`, `.io` en sont d'autres :
    // un dépôt en est plein.
    const riche = (blocks: InputRichBlock[]) => ({
      chat_id: chatId,
      rich_message: { blocks, skip_entity_detection: true },
      ...markup,
    });

    if (blocs.length) {
      try {
        const envoye = await this.api.sendRichMessage(riche(blocs));
        return { voie: 'riche', messageId: envoye.message_id };
      } catch {
        /* la structure a été refusée ; le texte, lui, tient peut-être */
      }
    }

    try {
      const envoye = await this.api.sendRichMessage(
        riche([{ type: 'paragraph', text: borne(brut, MAX_RICHE) }]),
      );
      return { voie: 'nu', messageId: envoye.message_id };
    } catch {
      return {
        voie: 'brut',
        messageId: await this.envoieSuivi(chatId, borne(brut, MAX_TEXTE), clavier),
      };
    }
  }

  /**
   * Un brouillon éphémère — la bulle montrée pendant qu'un tour travaille.
   *
   * Ce n'est pas un message : il expire au bout de trente secondes, ne persiste
   * pas dans le fil, et deux envois portant le même `draftId` s'**animent** au
   * lieu de s'empiler. C'est ce qui permet de montrer une activité sans
   * déverser un flux dans la conversation.
   *
   * Deux réserves mesurées : la méthode ne vaut que pour une **conversation
   * privée**, et le client web ne la rend pas — seuls les clients mobiles le
   * font aujourd'hui. Un échec est donc l'ordinaire ici, jamais une panne : on
   * se tait plutôt que de le journaliser à chaque battement.
   */
  async brouillon(chatId: number, draftId: number, texte: string): Promise<void> {
    try {
      await this.api.sendRichMessageDraft({
        chat_id: chatId,
        draft_id: draftId,
        rich_message: {
          // La première des deux corrections de `riche.ts` : le `RichText` de la
          // bibliothèque n'admet pas la chaîne nue, que l'API accepte pourtant
          // — sans quoi aucun texte simple ne serait exprimable. La conversion
          // ne porte que sur ce point-là.
          blocks: [{ type: 'thinking', text: texte } as unknown as InputRichBlockLib],
          skip_entity_detection: true,
        },
      });
    } catch {
      /* un signe de vie qui ne s'affiche pas ne casse rien */
    }
  }

  /**
   * « Aura est en train d'écrire… » dans l'en-tête de la conversation.
   *
   * Le compagnon du brouillon, et non son doublon : celui-ci fonctionne en
   * **groupe** comme en privé, et sur tous les clients. Là où le brouillon dit
   * ce qui se passe, celui-ci dit seulement que quelque chose se passe — et
   * c'est ce qui reste quand l'autre ne s'affiche pas.
   */
  async saisie(chatId: number): Promise<void> {
    try {
      await this.api.sendChatAction({ chat_id: chatId, action: 'typing' });
    } catch {
      /* idem */
    }
  }

  /** Coupe le long-polling en vol : la requête en attente est abandonnée. */
  stop(): void {
    this.stopped = true;
    this.bot.stop();
  }
}
