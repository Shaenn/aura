// Le seul fichier qui sache que la messagerie est Telegram.
//
// Rien ici ne décide : on lit des mises à jour, on envoie du texte, on accuse
// réception d'un bouton. Le jour où un second fournisseur se présente, c'est ce
// fichier qu'on double — et lui seul.
//
// Le long-polling est **sortant**, et c'est la raison d'être de tout le
// dispositif : AURA continue de n'écouter que la boucle locale
// (`server/index.ts`), et `guard.ts` n'a rien de nouveau à trancher. Aucun port
// ne s'ouvre pour que ceci fonctionne.

import { num, str } from '../json.ts';

const API = 'https://api.telegram.org';

/**
 * Combien de temps Telegram garde la requête ouverte quand rien n'arrive.
 *
 * Vingt-cinq secondes : sous la minute au-delà de laquelle les intermédiaires
 * coupent, et assez long pour qu'une journée sans message ne coûte que quelques
 * milliers de requêtes vides.
 */
const POLL_SECONDS = 25;

/** Le délai après un échec réseau, et le plafond qu'il ne dépasse pas. */
const RETRY_MS = 2_000;
const RETRY_MAX_MS = 60_000;

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

export interface Mises {
  messages: MessageEntrant[];
  boutons: BoutonPresse[];
}

/** Un couple de boutons sous un message, tel que Telegram l'attend. */
export function boutons(paires: { texte: string; donnee: string }[]): unknown {
  return {
    inline_keyboard: [paires.map((p) => ({ text: p.texte, callback_data: p.donnee }))],
  };
}

export class Telegram {
  private offset = 0;
  private readonly aborter = new AbortController();
  private stopped = false;

  constructor(private readonly token: string) {}

  private url(methode: string): string {
    return `${API}/bot${this.token}/${methode}`;
  }

  /**
   * Un appel à l'API. Rend `null` sur échec plutôt que de lever.
   *
   * Une messagerie injoignable n'est pas une panne d'AURA : le BFF continue de
   * servir l'interface et les sessions de tourner. L'appelant retentera.
   */
  private async appel(methode: string, corps: unknown, timeoutMs: number): Promise<unknown> {
    // Une horloge propre à l'appel, en plus de l'arrêt global : sans elle, un
    // `getUpdates` dont la socket reste ouverte sans jamais répondre tiendrait
    // la boucle indéfiniment.
    const horloge = AbortSignal.timeout(timeoutMs);
    try {
      const res = await fetch(this.url(methode), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
        signal: AbortSignal.any([this.aborter.signal, horloge]),
      });
      if (!res.ok) return null;
      const json: unknown = await res.json();
      const rec = (json ?? {}) as Record<string, unknown>;
      return rec.ok === true ? rec.result : null;
    } catch {
      // Abandon volontaire compris : `stopped` dira à la boucle quoi en faire.
      return null;
    }
  }

  /** Le nom du bot, ou `null` si le jeton ne vaut rien. Sert à démarrer. */
  async identite(): Promise<string | null> {
    const res = await this.appel('getMe', {}, 10_000);
    const nom = str((res as Record<string, unknown> | null)?.username);
    return nom || null;
  }

  /**
   * Les mises à jour depuis la dernière lue. `null` si l'appel a échoué.
   *
   * La distinction compte : une attente vide est le régime normal du
   * long-polling et ne doit rien ralentir, là où un échec doit faire monter le
   * délai. Les confondre ferait tourner une boucle serrée sur un réseau coupé.
   *
   * `offset` vaut acquittement : demander la suite dit à Telegram d'oublier ce
   * qui précède. On l'avance donc dès la lecture, avant tout traitement — sinon
   * un message qui fait échouer le traitement reviendrait à chaque tour de
   * boucle, indéfiniment.
   */
  async mises(): Promise<Mises | null> {
    const res = await this.appel(
      'getUpdates',
      {
        offset: this.offset,
        timeout: POLL_SECONDS,
        allowed_updates: ['message', 'callback_query'],
      },
      // Au-delà du temps que Telegram tient lui-même la requête : sans marge,
      // on couperait chaque attente vide au moment où elle allait aboutir.
      (POLL_SECONDS + 10) * 1_000,
    );

    if (!Array.isArray(res)) return null;
    const out: Mises = { messages: [], boutons: [] };

    for (const brut of res) {
      const maj = (brut ?? {}) as Record<string, unknown>;
      const id = num(maj.update_id);
      if (id >= this.offset) this.offset = id + 1;

      const message = (maj.message ?? {}) as Record<string, unknown>;
      const chat = (message.chat ?? {}) as Record<string, unknown>;
      const chatId = num(chat.id);
      const texte = str(message.text);
      if (chatId && texte) out.messages.push({ chatId, texte });

      const rappel = (maj.callback_query ?? {}) as Record<string, unknown>;
      const rappelMessage = (rappel.message ?? {}) as Record<string, unknown>;
      const rappelChat = (rappelMessage.chat ?? {}) as Record<string, unknown>;
      const rappelChatId = num(rappelChat.id);
      const callbackId = str(rappel.id);
      const donnee = str(rappel.data);
      if (rappelChatId && callbackId && donnee) {
        out.boutons.push({ chatId: rappelChatId, callbackId, donnee });
      }
    }
    return out;
  }

  /** Envoie un texte. `clavier` ajoute des boutons sous le message. */
  async envoie(chatId: number, texte: string, clavier?: unknown): Promise<void> {
    await this.appel(
      'sendMessage',
      {
        chat_id: chatId,
        text: texte,
        ...(clavier ? { reply_markup: clavier } : {}),
      },
      15_000,
    );
  }

  /** Accuse réception d'un bouton : sans cela, il tourne côté client. */
  async accuse(callbackId: string, texte?: string): Promise<void> {
    await this.appel(
      'answerCallbackQuery',
      { callback_query_id: callbackId, ...(texte ? { text: texte } : {}) },
      10_000,
    );
  }

  get arrete(): boolean {
    return this.stopped;
  }

  /** Le délai à observer après un tour de boucle infructueux. */
  attente(echecs: number): number {
    return Math.min(RETRY_MS * 2 ** Math.max(0, echecs - 1), RETRY_MAX_MS);
  }

  /** Coupe le long-polling en vol : la requête en attente est abandonnée. */
  stop(): void {
    this.stopped = true;
    this.aborter.abort();
  }
}
