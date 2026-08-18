// La Passerelle : une conversation d'un côté, l'Atelier de l'autre.
//
// Elle n'ouvre aucun port. Le long-polling de `telegram.ts` est sortant, si bien
// que le BFF continue de n'écouter que `127.0.0.1` et que `guard.ts` reste
// inchangé — c'est la raison d'être de cette forme plutôt que d'un tunnel ou
// d'une écoute élargie.
//
// Elle ne passe pas non plus par HTTP : elle vit dans le même process que le
// registre et l'appelle directement. Il n'y a donc pas de requête à
// authentifier, et pas une ligne de l'API existante à ouvrir.
//
// Ce qu'elle emprunte et ne réimplémente pas : le cycle de vie des sessions
// (`agent/registry.ts`), la file d'entrée et les demandes en attente
// (`agent/runner.ts`), la forme des messages (`shared/agent.ts`).

import { t } from '../i18n/index.ts';
import { publicMessage } from '../errors.ts';
import type { AgentUpsert, AskQuestion, PermissionAnswer } from '../../shared/agent.ts';
import { isPermissionMode } from '../../shared/agent.ts';
import {
  atCapacity,
  createRunner,
  getRunner,
  listSessions,
  MAX_SESSIONS,
  removeRunner,
} from '../agent/registry.ts';
import type { SessionRunner } from '../agent/runner.ts';
import { autorise, lireChats, parseIntention } from './routage.ts';
import { boutons, Telegram } from './telegram.ts';

/** Ce que le journal du BFF sait faire, et tout ce que la Passerelle lui demande. */
interface Journal {
  info: (message: string) => void;
  warn: (message: string) => void;
}

/**
 * Ce qu'un message peut peser chez Telegram.
 *
 * Une réponse d'agent dépasse volontiers cette taille. On tronque plutôt que de
 * laisser l'envoi échouer en silence : un texte coupé se lit, un texte perdu ne
 * se voit pas.
 */
const MAX_TEXTE = 4_000;

/** Ce que la Passerelle garde d'une conversation. */
interface Fil {
  runId: string;
  /** Se désabonner du runner quand le fil se défait. */
  detache: () => void;
  /** Les textes de l'assistant du tour en cours, par uuid. */
  tour: Map<string, string>;
  /** Les questions en vol, pour retrouver l'option qu'un bouton désigne. */
  asks: Map<string, AskQuestion[]>;
}

let telegram: Telegram | null = null;
const fils = new Map<number, Fil>();

function tronque(texte: string): string {
  return texte.length > MAX_TEXTE ? `${texte.slice(0, MAX_TEXTE)}…` : texte;
}

/** Un libellé de bouton : Telegram les veut courts, et les tronque mal. */
function tronqueBouton(texte: string): string {
  return texte.length > 32 ? `${texte.slice(0, 31)}…` : texte;
}

/** Le mode de permission des sessions ouvertes de loin. */
function mode(): string {
  const brut = (process.env.AURA_TELEGRAM_MODE ?? '').trim();
  return brut && isPermissionMode(brut) ? brut : 'default';
}

/**
 * Branche une conversation sur une session.
 *
 * L'abonnement sert deux fins, et la seconde n'est pas un effet de bord : il
 * **protège la session du balayeur**. `SessionRunner.expired` rend `false` dès
 * qu'un abonné regarde ; sans cela, une session pilotée d'ici sans onglet ouvert
 * serait ramassée au bout d'une demi-heure, en pleine conversation.
 */
function attache(chatId: number, runner: SessionRunner): void {
  const fil: Fil = {
    runId: runner.session.runId,
    detache: () => {},
    tour: new Map(),
    asks: new Map(),
  };
  fil.detache = runner.subscribe((upsert) => {
    void applique(chatId, fil, upsert);
  });
  fils.set(chatId, fil);
}

/**
 * Défait le fil d'une conversation. Idempotent.
 *
 * `ferme` distingue les deux cas qui n'ont rien de commun : on abandonne un fil
 * dont la session est déjà morte, ou on ferme une session qui vit encore.
 */
function defait(chatId: number, ferme: boolean): void {
  const fil = fils.get(chatId);
  if (!fil) return;
  fil.detache();
  fils.delete(chatId);
  if (ferme) removeRunner(fil.runId);
}

/**
 * Ce qu'une conversation reçoit d'une session.
 *
 * Volontairement peu : le texte de fin de tour, les demandes qui attendent un
 * humain, et la fin de la session. Ni les `text-delta`, ni l'activité, ni les
 * entrées d'outils — une messagerie n'est pas une timeline, et un flux de tokens
 * y serait illisible.
 */
async function applique(chatId: number, fil: Fil, upsert: AgentUpsert): Promise<void> {
  const tg = telegram;
  if (!tg) return;

  switch (upsert.kind) {
    // `snapshot` rejoue tout l'historique à l'abonnement : le renvoyer
    // inonderait la conversation d'un travail déjà lu.
    case 'snapshot':
      return;

    case 'append-event':
    case 'replace-event': {
      const event = upsert.event;
      if (event.kind !== 'assistant' || event.isSidechain) return;
      const texte = event.blocks
        .filter((b) => b.kind === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim();
      // `replace-event` porte le même uuid : la carte écrase, elle n'ajoute pas.
      if (texte) fil.tour.set(event.uuid, texte);
      return;
    }

    case 'status': {
      if (upsert.status === 'working') {
        fil.tour.clear();
        return;
      }
      // Fin de tour : le moment où il y a enfin quelque chose à dire.
      const dit = [...fil.tour.values()].join('\n\n').trim();
      fil.tour.clear();
      if (dit) await tg.envoie(chatId, tronque(dit));

      if (upsert.status === 'failed') {
        await tg.envoie(chatId, t('passerelle.sessionEchouee', { message: upsert.error ?? '' }));
        defait(chatId, false);
      } else if (upsert.status === 'ended') {
        await tg.envoie(chatId, t('passerelle.sessionFinie'));
        defait(chatId, false);
      }
      return;
    }

    case 'permission-request': {
      const demande = upsert.request;
      const quoi = demande.title || demande.displayName || demande.toolName;
      await tg.envoie(
        chatId,
        t('passerelle.permission', { outil: quoi }),
        boutons([
          { texte: t('passerelle.autoriser'), donnee: `p:${demande.id}:a` },
          { texte: t('passerelle.refuser'), donnee: `p:${demande.id}:d` },
        ]),
      );
      return;
    }

    case 'ask-request': {
      const demande = upsert.request;
      const premiere = demande.questions[0];
      // Un formulaire à plusieurs questions ne se rend pas en boutons sans
      // inventer un dialogue à étapes. On le dit plutôt que d'y répondre à
      // moitié : l'écran de l'Atelier, lui, sait le poser en entier.
      if (demande.questions.length !== 1 || !premiere) {
        await tg.envoie(chatId, t('passerelle.questionTropRiche'));
        return;
      }
      fil.asks.set(demande.id, demande.questions);
      await tg.envoie(
        chatId,
        tronque(`${premiere.header}\n\n${premiere.question}`),
        boutons(
          premiere.options
            .slice(0, 4)
            .map((o, i) => ({ texte: tronqueBouton(o.label), donnee: `q:${demande.id}:${i}` })),
        ),
      );
      return;
    }

    case 'ask-settled':
      fil.asks.delete(upsert.id);
      return;

    default:
      return;
  }
}

/**
 * La session de cette conversation, si elle vit encore.
 *
 * Le registre a pu la ramasser, ou le serveur redémarrer : le fil ne désigne
 * alors plus rien, et il vaut mieux l'oublier que de parler dans le vide.
 */
function courant(chatId: number): SessionRunner | undefined {
  const fil = fils.get(chatId);
  if (!fil) return undefined;
  const runner = getRunner(fil.runId);
  if (!runner) {
    defait(chatId, false);
    return undefined;
  }
  return runner;
}

/** Exécute ce qu'un message voulait dire. */
async function traite(chatId: number, brut: string): Promise<void> {
  const tg = telegram;
  if (!tg) return;
  const intention = parseIntention(brut);

  switch (intention.kind) {
    case 'ignorer':
      // Un message vide ne mérite pas de réponse ; une commande inconnue, si —
      // sans quoi une faute de frappe passerait pour une panne.
      if (intention.raison === 'commande-inconnue') {
        await tg.envoie(
          chatId,
          t('passerelle.commandeInconnue', { commande: intention.commande ?? '' }),
        );
      }
      return;

    case 'aide':
      await tg.envoie(chatId, t('passerelle.aide'));
      return;

    case 'sessions': {
      const sessions = listSessions();
      if (!sessions.length) {
        await tg.envoie(chatId, t('passerelle.aucuneSession'));
        return;
      }
      await tg.envoie(chatId, tronque(sessions.map((s) => `• ${s.cwd} — ${s.status}`).join('\n')));
      return;
    }

    case 'ouvrir': {
      // Une conversation ne tient qu'une session : ouvrir en referme une.
      defait(chatId, true);
      if (atCapacity()) {
        await tg.envoie(chatId, t('errors.tooManySessions', { max: MAX_SESSIONS }));
        return;
      }
      try {
        const runner = createRunner({ cwd: intention.cwd, permissionMode: mode() });
        attache(chatId, runner);
        await tg.envoie(chatId, t('passerelle.sessionOuverte', { cwd: runner.session.cwd }));
      } catch (e) {
        await tg.envoie(chatId, publicMessage(e));
      }
      return;
    }

    case 'fin': {
      if (!fils.has(chatId)) {
        await tg.envoie(chatId, t('passerelle.aucunFil'));
        return;
      }
      defait(chatId, true);
      await tg.envoie(chatId, t('agent.sessionStopped'));
      return;
    }

    case 'stop': {
      const runner = courant(chatId);
      if (!runner) {
        await tg.envoie(chatId, t('passerelle.aucunFil'));
        return;
      }
      await runner.interrupt();
      return;
    }

    case 'parler': {
      const runner = courant(chatId);
      if (!runner) {
        await tg.envoie(chatId, t('passerelle.aucunFil'));
        return;
      }
      runner.send(intention.texte);
      return;
    }
  }
}

/**
 * Un bouton pressé : une permission tranchée, ou une question répondue.
 *
 * Rien à attendre ici — les deux réponses dénouent une promesse tenue côté
 * runner et rendent la main aussitôt. C'est le tour suspendu qui repart, pas
 * cet appel.
 */
function tranche(chatId: number, donnee: string): void {
  const runner = courant(chatId);
  const fil = fils.get(chatId);
  if (!runner || !fil) return;

  const [type, id, suffixe] = donnee.split(':');
  if (!id || !suffixe) return;

  if (type === 'p') {
    const reponse: PermissionAnswer = suffixe === 'a' ? 'allow' : 'deny';
    runner.answerPermission(
      id,
      reponse,
      reponse === 'deny' ? t('passerelle.refuseDeLoin') : undefined,
    );
    return;
  }

  if (type === 'q') {
    const question = fil.asks.get(id)?.[0];
    const option = question?.options[Number(suffixe)];
    if (!question || !option) return;
    fil.asks.delete(id);
    runner.answerAsk(id, { [question.question]: option.label });
  }
}

/**
 * Démarre la Passerelle, si elle est configurée.
 *
 * Trois refus, volontairement stricts : sans jeton elle n'existe pas, sans liste
 * blanche elle ne démarre pas — l'omission ne doit pas ouvrir la machine au
 * premier venu — et un jeton que Telegram rejette est signalé plutôt que retenté
 * indéfiniment.
 */
export function demarrePasserelle(journal: Journal): void {
  const token = (process.env.AURA_TELEGRAM_TOKEN ?? '').trim();
  if (!token) return;

  const chats = lireChats(process.env.AURA_TELEGRAM_CHATS);
  if (chats.size === 0) {
    journal.warn(
      "Passerelle : un jeton est configuré mais aucune conversation n'est autorisée " +
        '(AURA_TELEGRAM_CHATS). Je ne démarre pas.',
    );
    return;
  }

  const tg = new Telegram(token);
  telegram = tg;
  void boucle(tg, chats, journal);
}

/** Le long-polling, jusqu'à l'extinction du serveur. */
async function boucle(tg: Telegram, chats: Set<number>, journal: Journal): Promise<void> {
  const nom = await tg.identite();
  if (!nom) {
    journal.warn('Passerelle : Telegram refuse ce jeton. Je ne démarre pas.');
    telegram = null;
    return;
  }
  journal.info(`Passerelle ouverte sur @${nom} — ${chats.size} conversation(s) autorisée(s).`);

  // Les échecs consécutifs, et rien d'autre, décident du délai d'attente : une
  // messagerie injoignable ne doit pas faire tourner une boucle serrée sur le
  // réseau pendant des heures.
  let echecs = 0;
  while (!tg.arrete) {
    const mises = await tg.mises();
    if (tg.arrete) break;

    if (mises === null) {
      echecs += 1;
      await pause(tg.attente(echecs));
      continue;
    }
    echecs = 0;

    for (const message of mises.messages) {
      // Le silence est la réponse à un inconnu : répondre confirmerait que ce
      // bot existe et à quoi il sert.
      if (!autorise(chats, message.chatId)) continue;
      try {
        await traite(message.chatId, message.texte);
      } catch (e) {
        journal.warn(`Passerelle : ${publicMessage(e)}`);
      }
    }

    for (const bouton of mises.boutons) {
      if (!autorise(chats, bouton.chatId)) continue;
      // Accuser d'abord : sans cela le bouton tourne pendant tout le traitement.
      await tg.accuse(bouton.callbackId);
      try {
        tranche(bouton.chatId, bouton.donnee);
      } catch (e) {
        journal.warn(`Passerelle : ${publicMessage(e)}`);
      }
    }
  }
}

/** Une attente qui ne retient pas le process à elle seule. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}

/**
 * Coupe la Passerelle. Appelée à l'extinction du serveur.
 *
 * Les sessions ne sont pas fermées ici : `stopAll` s'en charge déjà, et une
 * session ouverte depuis une conversation n'appartient pas plus à la Passerelle
 * qu'à l'onglet qui la regardait.
 */
export function arretePasserelle(): void {
  for (const chatId of [...fils.keys()]) defait(chatId, false);
  telegram?.stop();
  telegram = null;
}
