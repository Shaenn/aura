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

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, t, withLocale } from '../i18n/index.ts';
import { publicMessage } from '../errors.ts';
import type { AgentUpsert, PermissionAnswer } from '../../shared/agent.ts';
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
import {
  getProjectResources,
  listProjects,
  readProjectIncludedFile,
  readProjectMemory,
  readProjectResource,
} from '../projects.ts';
import { listSessions as sessionsActives } from '../maintenance.ts';
import type { ProjectSummary } from '../../shared/projects.ts';
import { autorise, lireChats, parseIntention } from './routage.ts';
import {
  aplatir,
  arborescence,
  compte,
  descendre,
  resoudreProjet,
  type Entree,
  type Noeud,
} from './projets.ts';
import { paginer } from './markdown.ts';
import { enBlocs, MAX_RICHE, type InputRichBlock } from './riche.ts';
import { boutons, elargi, grille, Telegram } from './telegram.ts';
import {
  ecran as ecranQuestion,
  formulaire,
  presse,
  repondLibre,
  reponses,
  type Formulaire,
} from './questions.ts';
import { alerte, lignes as lignesEtat, nombre, part, type Fenetre } from './etat.ts';
import { planPropose } from './plan.ts';
import { contextLimitFor } from '../context.ts';
import { configuredLongWindow } from '../claude/model.ts';
import { Battement } from './activite.ts';
import { aide, pourTelegram } from './commandes.ts';
import type { InlineKeyboardMarkup } from 'node-telegram-bot-api';

/**
 * Ce qu'une page prend au document source.
 *
 * Sous la borne du message riche, avec de la marge : la traduction en blocs
 * ajoute du JSON autour de chaque morceau de texte, et c'est le total qui est
 * mesuré côté Telegram.
 */
const PAGE_RICHE = Math.floor(MAX_RICHE * 0.7);

/** Ce que le journal du BFF sait faire, et tout ce que la Passerelle lui demande. */
interface Journal {
  info: (message: string) => void;
  warn: (message: string) => void;
}

/** Ce que la Passerelle garde d'une conversation. */
interface Fil {
  runId: string;
  /** Se désabonner du runner quand le fil se défait. */
  detache: () => void;
  /**
   * L'abonnement a-t-il déjà rendu son premier `snapshot` ?
   *
   * `subscribe` émet le sien **avant** d'enregistrer l'abonné : le premier reçu
   * est donc celui de l'abonnement par construction, et non par ressemblance.
   * C'est ce qui permet de distinguer les deux sites d'émission sans deviner.
   */
  abonne: boolean;
  /** Les textes de l'assistant du tour en cours, par uuid. */
  tour: Map<string, string>;
  /** Les formulaires en vol, pour retrouver ce qu'un bouton désigne. */
  asks: Map<string, Formulaire>;
  /**
   * Le formulaire qui capte le prochain message écrit, s'il y en a un.
   *
   * C'est ce qui rend possible la réponse hors menu — le « Other » du harnais.
   * Il ne capte que ce qui serait parti comme un tour : les commandes restent
   * des commandes sous une question.
   */
  attente: string | null;
  /**
   * Le remplissage de la fenêtre a-t-il déjà été signalé ?
   *
   * Une fois suffit : redire à chaque tour qu'on est au-dessus du seuil
   * n'apprendrait rien et ferait d'un avertissement un bruit de fond. Une
   * compaction le remet à faux — la fenêtre a le droit de se remplir à nouveau,
   * et de le dire à nouveau.
   */
  alerte: boolean;
  /** La bulle éphémère qui dit que ça travaille, et à quoi. */
  battement: Battement;
}

/**
 * L'identifiant du brouillon d'une conversation.
 *
 * Il doit être non nul, et rester le même pour que Telegram anime la bulle au
 * lieu d'en empiler une par changement. Un compteur suffit : rien ne le relie à
 * la session, et un brouillon ne survit pas trente secondes à son émission.
 */
let prochainBrouillon = 1;

/**
 * Ce qu'une conversation a sous les yeux, hors session.
 *
 * Séparé du `Fil` à dessein : on consulte un projet sans en ouvrir la session,
 * et fermer une session ne doit pas faire perdre la liste qu'on était en train
 * de parcourir. Les deux états ne vivent pas au même rythme.
 */
interface Vue {
  /** La dernière liste de projets montrée — ce que les rangs désignent. */
  projets: ProjectSummary[];
  /** Le projet choisi, s'il y en a un. */
  slug: string;
  /** Les fichiers de ce projet, dans l'ordre où ils ont été numérotés. */
  entrees: Entree[];
  /** Les mêmes, en arborescence : ce que la navigation parcourt. */
  racine: Noeud;
  /**
   * Où l'on est dans cet arbre, segment par segment.
   *
   * Le chemin plutôt que le nœud : un bouton ne peut porter que 64 octets, et
   * un chemin profond les dépasserait. On empile donc des noms, et l'on
   * redescend depuis la racine à chaque pas — l'arbre tient en mémoire, le
   * parcours ne coûte rien.
   */
  chemin: string[];
  /**
   * Le message qui porte la navigation, et qu'on réécrit à chaque pas.
   *
   * Un seul message pour tout le parcours : sans cela, chaque clic laisserait
   * derrière lui une liste périmée, et la conversation deviendrait un empilement
   * d'états morts.
   */
  messageId: number | null;
}

let telegram: Telegram | null = null;
const fils = new Map<number, Fil>();
const vues = new Map<number, Vue>();

function vue(chatId: number): Vue {
  const existante = vues.get(chatId);
  if (existante) return existante;
  const neuve: Vue = {
    projets: [],
    slug: '',
    entrees: [],
    racine: { nom: '', enfants: [] },
    chemin: [],
    messageId: null,
  };
  vues.set(chatId, neuve);
  return neuve;
}

/**
 * Affiche un écran de navigation : on réécrit celui qui est là, sinon on en
 * ouvre un.
 *
 * La réécriture échoue pour de bonnes raisons — message trop vieux, supprimé,
 * ou contenu identique. On repart alors sur un envoi neuf plutôt que de laisser
 * un clic sans effet visible.
 */
async function ecran(chatId: number, texte: string, clavier: InlineKeyboardMarkup): Promise<void> {
  const tg = telegram;
  if (!tg) return;
  const v = vue(chatId);

  // Le clavier prend la largeur de la bulle, donc du texte : un en-tête court
  // donnerait des boutons trop étroits pour être lus. Voir `elargi`.
  const large = elargi(texte);

  if (v.messageId !== null && (await tg.reecrit(chatId, v.messageId, large, clavier))) return;
  v.messageId = await tg.envoieSuivi(chatId, large, clavier);
}

/**
 * L'écran d'un dossier — la racine d'un projet en est un.
 *
 * Un seul écran pour tous les étages : c'est ce que permet l'arbre, là où des
 * catégories auraient demandé un écran de tête et un écran de liste. Un dossier
 * porte le compte de ce qu'il contient, à toute profondeur ; un fichier ouvre
 * son contenu.
 */
async function ecranDossier(chatId: number, projet: ProjectSummary): Promise<void> {
  const v = vue(chatId);
  const dossier = descendre(v.racine, v.chemin);
  if (!dossier) {
    // Le chemin ne mène plus nulle part — l'inventaire a changé sous nos pieds.
    // On remonte à la racine plutôt que de laisser un écran vide.
    v.chemin = [];
    await ecranDossier(chatId, projet);
    return;
  }

  const cases = dossier.enfants.map((n, i) =>
    n.fichier
      ? // Le rang de la liste plate voyage dans le bouton : c'est lui que
        // `/voir` emploie, et les deux chemins doivent désigner le même fichier.
        { texte: nomCourt(n.nom), donnee: `n:f:${n.fichier.rang}` }
      : { texte: `${nomCourt(n.nom)}/ ${compte(n)}`, donnee: `n:d:${i}` },
  );

  // À la racine, il n'y a pas de dossier parent : on remonte aux projets, et
  // c'est là que l'action d'ouverture a sa place.
  const solo = v.chemin.length
    ? [{ texte: t('passerelle.remonter'), donnee: 'n:u' }]
    : [
        { texte: t('passerelle.ouvrirIci'), donnee: 'n:a' },
        { texte: t('passerelle.retourProjets'), donnee: 'n:r' },
      ];

  const ou = v.chemin.length ? v.chemin.join('/') : projet.name;
  await ecran(chatId, t('passerelle.dossier', { ou, total: compte(dossier) }), grille(cases, solo));
}

/** Le nom d'un fichier, sans son chemin — la place manque sur un bouton. */
function nomCourt(label: string): string {
  const nom = label.slice(label.lastIndexOf('/') + 1);
  return nom.length > 40 ? `${nom.slice(0, 39)}…` : nom;
}

/**
 * L'écran des projets. `neuf` ouvre un message plutôt que d'en réécrire un —
 * ce qu'une commande tapée mérite, et qu'un clic ne mérite pas.
 */
async function ecranProjets(chatId: number, neuf: boolean): Promise<void> {
  const tg = telegram;
  if (!tg) return;
  const v = vue(chatId);
  // La liste devient la référence des rangs : on la garde telle qu'elle a été
  // montrée, sans quoi un `/atelier 3` désignerait autre chose que la troisième
  // ligne lue.
  v.projets = await listProjects();
  if (neuf) v.messageId = null;

  if (!v.projets.length) {
    await tg.envoie(chatId, t('passerelle.aucunProjet'));
    return;
  }
  const cases = v.projets.map((p, i) => ({ texte: nomCourt(p.name), donnee: `n:p:${i}` }));
  await ecran(chatId, t('passerelle.projets'), grille(cases));
}

/**
 * Ce qui tourne, des deux sources qui ne se recouvrent pas.
 *
 * Le registre ne connaît que les sessions qu'AURA possède ; celles qu'on a
 * lancées dans un terminal n'y figurent pas et n'y figureront jamais — elles
 * n'existent que par leur fichier d'état sous `~/.claude/sessions`. N'en montrer
 * qu'une des deux faisait répondre « rien ne tourne » à quelqu'un qui regardait
 * une session tourner.
 */
async function etatDesSessions(): Promise<string> {
  const atelier = listSessions();
  const systeme = await sessionsActives();
  // Une session de l'Atelier a aussi son fichier d'état : sans ce filtre, elle
  // se compterait deux fois.
  const runIds = new Set(atelier.map((s) => s.sessionId).filter(Boolean));
  const ailleurs = systeme.filter((s) => !runIds.has(s.sessionId));

  if (!atelier.length && !ailleurs.length) return t('passerelle.aucuneSession');

  const lignes: string[] = [];
  if (atelier.length) {
    lignes.push(t('passerelle.sessionsAtelier'));
    for (const s of atelier) lignes.push(`• ${s.cwd} — ${s.status}`);
  }
  if (ailleurs.length) {
    if (lignes.length) lignes.push('');
    lignes.push(t('passerelle.sessionsAilleurs'));
    for (const s of ailleurs) {
      const etat = s.status ?? '?';
      lignes.push(`• ${s.cwd || '?'} — ${etat}${s.waitingFor ? ` (${s.waitingFor})` : ''}`);
    }
  }
  return lignes.join('\n');
}

/**
 * La fenêtre d'une session, rapportée à la limite de son modèle.
 *
 * `contextLimitFor` fait le travail délicat, et il vaut de rappeler pourquoi il
 * existe : un modèle à fenêtre longue s'enregistre **sans** son suffixe `[1m]`,
 * si bien que l'identifiant ne suffit pas à trancher. Deux preuves le
 * remplacent, et la session les porte toutes deux — le plus grand contexte
 * observé (`max`), et le modèle tel qu'il a été choisi dans les réglages.
 */
async function fenetreDe(runner: SessionRunner): Promise<Fenetre> {
  const releve = runner.contextWindow;
  const { cwd, model, resolvedModel } = runner.session;
  return {
    tokens: releve.tokens,
    limite: contextLimitFor([resolvedModel ?? model], releve.max, await configuredLongWindow(cwd)),
  };
}

/**
 * Dit une fois que la fenêtre se remplit, puis se tait.
 *
 * C'est la seule chose qu'AURA avance d'elle-même à propos du contexte, et la
 * règle de silence de `docs/voix.md` la justifie : le « je » porte ici une
 * information que rien à l'écran ne donne — de loin, on ne voit pas la fenêtre.
 * Répéter à chaque tour, en revanche, n'apprendrait plus rien.
 */
async function signaleFenetre(chatId: number, fil: Fil): Promise<void> {
  const tg = telegram;
  const runner = getRunner(fil.runId);
  if (!tg || !runner) return;

  const ratio = part(await fenetreDe(runner));
  if (!alerte(fil.alerte, ratio)) return;
  fil.alerte = true;
  await tg.envoie(chatId, t('passerelle.fenetrePleine', { pourcent: Math.round(ratio * 100) }));
}

/**
 * Où en est la session de cette conversation.
 *
 * La fenêtre est ce qu'une conversation ne montre jamais d'elle-même : on voit
 * ce que l'agent répond, jamais la place qu'il lui reste. De près, l'Atelier
 * l'affiche ; de loin, il n'y avait rien.
 */
async function ecranEtat(chatId: number): Promise<void> {
  const tg = telegram;
  if (!tg) return;

  const runner = courant(chatId);
  if (!runner) {
    await tg.envoie(chatId, t('passerelle.aucunFil'));
    return;
  }

  const { cwd, model, resolvedModel } = runner.session;
  const fenetre = await fenetreDe(runner);
  await tg.envoie(
    chatId,
    lignesEtat(
      fenetre,
      cwd,
      resolvedModel || model || t('passerelle.etatModeleInconnu'),
      mode(),
    ).join('\n'),
  );
}

/**
 * L'accueil : ce que je suis, ce que je vois, et par où entrer.
 *
 * Il **constate** au lieu de se présenter, parce que `docs/voix.md` le range
 * parmi les surfaces où le « je » doit porter une information que la
 * formulation impersonnelle ne portait pas. Le nombre de projets et l'état de
 * la conversation sont cette information ; « voici le menu » ne l'aurait pas
 * été, les boutons étant déjà à l'écran.
 *
 * Il prend la place du message de navigation, si bien qu'un clic sur « Les
 * projets » le **réécrit** au lieu d'empiler : l'accueil devient la première
 * marche du même parcours que l'arborescence, pas un écran à part.
 */
async function ecranAccueil(chatId: number): Promise<void> {
  const v = vue(chatId);
  v.projets = await listProjects();

  const lignes = [t('passerelle.accueil')];
  if (!v.projets.length) lignes.push(t('passerelle.accueilAucunProjet'));
  else if (v.projets.length === 1) lignes.push(t('passerelle.accueilUnProjet'));
  else lignes.push(t('passerelle.accueilProjets', { n: v.projets.length }));

  // Ce que cette conversation tient déjà passe avant le parc : c'est la seule
  // ligne qui parle de vous plutôt que de la machine.
  const sien = courant(chatId);
  const parc = listSessions().length;
  if (sien) lignes.push(t('passerelle.accueilSession', { cwd: sien.session.cwd }));
  else if (parc === 1) lignes.push(t('passerelle.accueilUnTravail'));
  else if (parc > 1) lignes.push(t('passerelle.accueilTravaux', { n: parc }));

  // Une commande tapée mérite son message, à sa date — comme `/projet`.
  v.messageId = null;
  await ecran(
    chatId,
    lignes.join('\n'),
    // En rangée et non en `solo` : `solo` sert à détacher une action d'une
    // liste, et ici il n'y a pas de liste — les trois sont du même rang.
    grille([
      { texte: t('passerelle.menuProjets'), donnee: 'n:r' },
      { texte: t('passerelle.menuSessions'), donnee: 'n:s' },
      { texte: t('passerelle.menuAide'), donnee: 'n:h' },
    ]),
  );
}

/** Charge l'inventaire d'un projet et montre sa fiche. */
async function ouvreProjet(chatId: number, projet: ProjectSummary): Promise<void> {
  const tg = telegram;
  if (!tg) return;
  const v = vue(chatId);
  try {
    // Le même inventaire que la page Détail : la conversation ne montre ni plus
    // ni moins que l'écran.
    v.entrees = aplatir(await getProjectResources(projet.slug));
    v.racine = arborescence(v.entrees);
    v.chemin = [];
    v.slug = projet.slug;
  } catch (e) {
    await tg.envoie(chatId, publicMessage(e));
    return;
  }
  if (!v.entrees.length) {
    await ecran(
      chatId,
      t('passerelle.projetVide', { nom: projet.name }),
      grille([], [{ texte: t('passerelle.retourProjets'), donnee: 'n:r' }]),
    );
    return;
  }
  await ecranDossier(chatId, projet);
}

/**
 * Ouvre une session sur un projet. Même chemin depuis la commande et le bouton.
 *
 * Le projet a déjà été résolu par l'appelant : c'est là qu'est la garde, et
 * elle n'a pas à être refaite ici.
 */
async function ouvreAtelier(chatId: number, projet: ProjectSummary): Promise<void> {
  const tg = telegram;
  if (!tg) return;
  // Une conversation ne tient qu'une session : ouvrir en referme une.
  defait(chatId, true);
  if (atCapacity()) {
    await tg.envoie(chatId, t('errors.tooManySessions', { max: MAX_SESSIONS }));
    return;
  }
  try {
    const runner = createRunner({ cwd: projet.path, permissionMode: mode() });
    attache(chatId, runner);
    await tg.envoie(chatId, t('passerelle.sessionOuverte', { cwd: runner.session.cwd }));
  } catch (e) {
    await tg.envoie(chatId, publicMessage(e));
  }
}

/** Le projet dont la fiche est ouverte, si elle l'est encore. */
function projetCourant(chatId: number): ProjectSummary | undefined {
  const v = vue(chatId);
  return v.projets.find((p) => p.slug === v.slug);
}

/**
 * Un pas de navigation.
 *
 * L'état vit en mémoire : un redémarrage du serveur le perd, et les boutons
 * d'un message plus ancien ne désignent alors plus rien. On le dit plutôt que
 * de ne rien faire — un bouton sans effet passe pour une panne.
 */
async function navigue(chatId: number, ordre: string, argument: string): Promise<void> {
  const tg = telegram;
  if (!tg) return;
  const v = vue(chatId);

  if (ordre === 'r') {
    await ecranProjets(chatId, false);
    return;
  }

  // Les deux sorties de l'accueil. Elles produisent du **contenu**, pas un pas
  // de navigation : elles partent donc dans leur propre message et laissent
  // l'accueil en place, là où « Les projets » le réécrit. C'est la même règle
  // que `/voir`, qui n'écrase jamais l'arborescence qu'on parcourait.
  if (ordre === 's') {
    await tg.envoie(chatId, await etatDesSessions());
    return;
  }
  if (ordre === 'h') {
    await tg.envoie(chatId, aide());
    return;
  }

  if (ordre === 'p') {
    if (!v.projets.length) v.projets = await listProjects();
    const projet = v.projets[Number(argument)];
    if (!projet) {
      await tg.envoie(chatId, t('passerelle.navigationPerimee'));
      return;
    }
    await ouvreProjet(chatId, projet);
    return;
  }

  const projet = projetCourant(chatId);
  if (!projet) {
    await tg.envoie(chatId, t('passerelle.navigationPerimee'));
    return;
  }

  if (ordre === 'u') {
    v.chemin.pop();
    await ecranDossier(chatId, projet);
    return;
  }
  if (ordre === 'd') {
    const dossier = descendre(v.racine, v.chemin);
    const enfant = dossier?.enfants[Number(argument)];
    // L'arbre a changé sous le message : le rang ne désigne plus le dossier
    // qu'on a montré, ou plus un dossier du tout. On le dit, comme partout
    // ailleurs — un bouton sans effet passe pour une panne.
    if (!enfant || enfant.fichier) {
      await tg.envoie(chatId, t('passerelle.navigationPerimee'));
      return;
    }
    v.chemin.push(enfant.nom);
    await ecranDossier(chatId, projet);
    return;
  }
  if (ordre === 'f') {
    // Le contenu part dans un message à lui : il est long, il se pagine, et il
    // doit rester lisible après qu'on a continué à naviguer au-dessus.
    await page(chatId, Number(argument), 1);
    return;
  }
  if (ordre === 'a') {
    await ouvreAtelier(chatId, projet);
  }
}

/**
 * Le projet qu'une référence désigne.
 *
 * La liste se charge d'elle-même si elle n'a jamais été demandée : `/atelier
 * <chemin>` en première commande doit marcher sans avoir à faire `/projets`
 * d'abord. Un rang, lui, n'a de sens que par rapport à une liste déjà montrée —
 * et c'est celle-là qu'on garde, pas une plus fraîche qui renumérerait sous les
 * yeux de qui vient de lire.
 */
async function trouve(chatId: number, ref: string): Promise<ProjectSummary | undefined> {
  const v = vue(chatId);
  if (!v.projets.length) v.projets = await listProjects();
  return resoudreProjet(v.projets, ref);
}

/** Le lecteur d'une origine. Chacun a son bac à sable ; aucun ne couvre l'autre. */
function lecteur(
  source: Entree['source'],
): (slug: string, rel: string) => Promise<{ rel: string; content: string }> {
  if (source === 'claude') return readProjectResource;
  if (source === 'inclus') return readProjectIncludedFile;
  return readProjectMemory;
}

/**
 * Une page d'un fichier, mise en forme, avec de quoi tourner la page.
 *
 * Le fichier est relu à chaque page plutôt que gardé en mémoire : il tient sur
 * le disque, il peut changer entre deux pages, et garder le contenu de tous les
 * documents consultés par toutes les conversations reviendrait à un cache dont
 * personne n'a demandé les ennuis.
 */
async function page(chatId: number, rang: number, numero: number): Promise<void> {
  const tg = telegram;
  const v = vue(chatId);
  const entree = v.entrees[rang - 1];
  if (!tg || !entree) return;

  let contenu: string;
  try {
    contenu = (await lecteur(entree.source)(v.slug, entree.rel)).content;
  } catch (e) {
    await tg.envoie(chatId, publicMessage(e));
    return;
  }

  // La borne est celle du message riche, huit fois celle d'un message ordinaire.
  // Un document qui tenait en sept pages en tient désormais en une.
  const pages = paginer(contenu, PAGE_RICHE);
  const index = Math.min(Math.max(numero, 1), pages.length);
  const source = pages[index - 1] ?? '';
  const entete =
    pages.length > 1
      ? t('passerelle.pageDe', { fichier: entree.label, page: index, total: pages.length })
      : entree.label;

  // Le rendu ne vaut que pour du Markdown : appliquer la traduction à un JSON ou
  // à un fichier de réglages y verrait des puces et des emphases qui n'existent
  // pas. Les autres partent en chasse fixe, qui est leur forme lisible.
  const markdown = estMarkdown(entree.rel);
  const blocs: InputRichBlock[] = [
    { type: 'heading', text: entete, size: 3 },
    ...(markdown ? enBlocs(source) : [{ type: 'pre' as const, text: source }]),
  ];

  await tg.envoieRendu(
    chatId,
    blocs,
    `${entete}\n\n${source}`,
    navigation(rang, index, pages.length),
  );
}

/**
 * La réponse de l'agent, rendue comme un document.
 *
 * Elle en est un : un agent écrit du Markdown — titres, listes, tableaux,
 * chemins entre accents graves. L'envoyer en texte nu affichait ses barres
 * verticales et ses dièses, et c'était le rendu le plus souvent lu de toute la
 * Passerelle, plus souvent qu'aucun fichier.
 *
 * Deux différences avec `envoieFichier`, et elles tiennent à ce qu'une réponse
 * n'est pas un fichier : pas d'en-tête — on sait qui parle —, et pas de
 * pagination. Une réponse trop longue est **coupée**, comme avant : tourner la
 * page suppose de pouvoir relire la source, or celle-ci ne vit que dans la
 * session.
 */
async function repond(chatId: number, texte: string): Promise<void> {
  const tg = telegram;
  if (!tg) return;
  // La borne du riche est huit fois celle d'un message ordinaire : ce qui était
  // coupé à 4 000 caractères passe désormais entier dans presque tous les cas.
  const source = texte.length > PAGE_RICHE ? `${texte.slice(0, PAGE_RICHE)}…` : texte;
  await tg.envoieRendu(chatId, enBlocs(source), source);
}

/**
 * Pose l'étape courante d'un formulaire, et se met en attente d'une réponse.
 *
 * Un message neuf par étape, et non une réécriture : un message riche ne se
 * réécrit pas — la bibliothèque n'expose aucun `editMessageRichText`. Ce n'est
 * pas une perte ici, une question posée ayant sa place dans le fil à sa date.
 */
async function poseQuestion(chatId: number, fil: Fil, f: Formulaire): Promise<void> {
  const tg = telegram;
  if (!tg) return;
  await desarme(chatId, f);
  const vue = ecranQuestion(f);
  const rendu = await tg.envoieRendu(chatId, vue.blocs, vue.brut, vue.clavier);
  f.messageId = rendu.messageId;
  fil.attente = f.id;
}

/**
 * Retire le clavier de l'écran qu'on quitte.
 *
 * Sans cela, les boutons d'une étape déjà répondue restent pressables — et,
 * comme ils ne portent qu'un rang, ils s'appliqueraient à la question suivante.
 * Un clic destiné à la première question cocherait une option de la deuxième.
 */
async function desarme(chatId: number, f: Formulaire): Promise<void> {
  if (f.messageId === null) return;
  await telegram?.reecritClavier(chatId, f.messageId, { inline_keyboard: [] });
  f.messageId = null;
}

/**
 * Ce qu'une réponse partielle entraîne : cocher, passer à la suite, ou conclure.
 *
 * `questions.ts` décide, ce qui suit ne fait qu'émettre. Cocher ne réécrit que
 * le clavier — la question au-dessus n'a aucune raison de bouger.
 */
async function avanceQuestion(
  chatId: number,
  fil: Fil,
  f: Formulaire,
  quoi: ReturnType<typeof presse>,
): Promise<void> {
  const tg = telegram;
  if (!tg) return;

  if (quoi === 'coche') {
    if (f.messageId !== null)
      await tg.reecritClavier(chatId, f.messageId, ecranQuestion(f).clavier);
    return;
  }
  if (quoi === 'suivant') {
    await poseQuestion(chatId, fil, f);
    return;
  }
  if (quoi !== 'fini') return;

  await desarme(chatId, f);
  fil.asks.delete(f.id);
  fil.attente = null;
  // Le tour suspendu repart ici : `answerAsk` dénoue la promesse que l'outil
  // MCP tient depuis `ask.ts`. Rien à attendre, la main revient aussitôt.
  courant(chatId)?.answerAsk(f.id, reponses(f));
}

/** Ce fichier se lit-il comme du Markdown ? */
function estMarkdown(rel: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(rel);
}

/**
 * Les boutons qui tournent la page.
 *
 * Rien sur un document d'une seule page : un clavier qui ne mène nulle part
 * occupe l'écran et invite à un geste sans effet.
 */
function navigation(rang: number, index: number, total: number): InlineKeyboardMarkup | undefined {
  if (total <= 1) return undefined;
  const paires: { texte: string; donnee: string }[] = [];
  if (index > 1)
    paires.push({ texte: t('passerelle.precedent'), donnee: `v:${rang}:${index - 1}` });
  if (index < total)
    paires.push({ texte: t('passerelle.suivant'), donnee: `v:${rang}:${index + 1}` });
  return boutons(paires);
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
  const tg = telegram;
  const fil: Fil = {
    runId: runner.session.runId,
    detache: () => {},
    abonne: false,
    tour: new Map(),
    asks: new Map(),
    attente: null,
    alerte: false,
    battement: new Battement(
      {
        brouillon: async (id, draft, texte) => {
          await tg?.brouillon(id, draft, texte);
        },
        saisie: async (id) => {
          await tg?.saisie(id);
        },
      },
      chatId,
      prochainBrouillon++,
    ),
  };
  /**
   * Les événements se traitent **à la file**, jamais de front.
   *
   * Chaque `applique` fait des appels réseau, et deux envois lancés en parallèle
   * arrivent dans l'ordre où Telegram les sert, pas dans celui où la session les
   * a produits. Mesuré : le résumé d'une compaction — un gros message riche —
   * doublait l'annonce qui le précédait, si bien que la conversation expliquait
   * après coup ce qu'elle venait de montrer.
   *
   * Une promesse chaînée suffit, et rien ne s'y perd : `applique` avale déjà ses
   * propres erreurs, le `catch` n'est là que pour qu'une exception inattendue ne
   * casse pas la file elle-même.
   */
  let file: Promise<void> = Promise.resolve();
  fil.detache = runner.subscribe((upsert) => {
    file = file.then(() => applique(chatId, fil, upsert)).catch(() => {});
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
  fil.battement.arrete();
  fils.delete(chatId);
  if (ferme) removeRunner(fil.runId);
}

/**
 * Ce qu'une conversation reçoit d'une session.
 *
 * Volontairement peu : le texte de fin de tour, les demandes qui attendent un
 * humain, et la fin de la session. Ni les `text-delta`, ni les entrées d'outils
 * — une messagerie n'est pas une timeline, et un flux de tokens y serait
 * illisible.
 *
 * L'activité fait exception, et une seule : elle ne devient pas un message mais
 * une bulle éphémère, qui s'efface sans rien laisser dans le fil. Voir
 * `activite.ts`.
 */
async function applique(chatId: number, fil: Fil, upsert: AgentUpsert): Promise<void> {
  const tg = telegram;
  if (!tg) return;

  switch (upsert.kind) {
    /**
     * `snapshot` a **deux** sites d'émission, et ils n'appellent pas la même
     * réponse.
     *
     * Le premier est l'abonnement (`runner.ts`, `subscribe`) : il rejoue tout
     * l'historique, et le renvoyer inonderait la conversation d'un travail déjà
     * lu. Le second est `resetConversation` : le contexte vient d'être vidé, le
     * CLI a ouvert un transcript neuf, et l'agent n'a plus aucun souvenir. Se
     * taire là-dessus laisse parler à quelqu'un qui a tout oublié.
     *
     * La conversation ne peut pas le provoquer elle-même — `/clear` n'est pas
     * une commande que `routage.ts` sert. Cela vient donc toujours d'ailleurs :
     * de l'onglet de l'Atelier, ou du SDK lui-même. Raison de plus de le dire.
     */
    case 'snapshot': {
      if (!fil.abonne) {
        fil.abonne = true;
        return;
      }
      fil.battement.arrete();
      // Les textes du tour en cours parlent d'une conversation qui n'existe
      // plus : les envoyer maintenant serait citer un souvenir effacé.
      fil.tour.clear();
      // Le contexte est vide : la fenêtre a de nouveau le droit de se remplir,
      // et de le signaler. Même raison qu'après une compaction.
      fil.alerte = false;
      const dit = upsert.events
        .filter((e) => e.kind === 'system')
        .flatMap((e) => e.blocks)
        .map((b) => b.text ?? '')
        .join('\n')
        .trim();
      // Les mêmes mots qu'à l'écran (`agent.cleared`), et non une phrase de
      // plus : une session lue de deux endroits ne raconte pas deux histoires.
      if (dit) await tg.envoie(chatId, dit);
      return;
    }

    case 'append-event':
    case 'replace-event': {
      const event = upsert.event;

      /**
       * La compaction : le seul moment où la fenêtre change sans qu'on ait
       * touché à rien.
       *
       * L'événement porte ses chiffres mais **pas de texte** — ses `blocks` sont
       * vides. Il n'y a donc rien à relayer : la phrase se compose ici, avec les
       * deux nombres qui la rendent utile. « J'ai compacté » sans eux ne dirait
       * pas si l'on repart de dix mille tokens ou de cent mille.
       */
      if (event.kind === 'compaction' && event.compaction) {
        /**
         * Le résumé n'arrive pas avec la frontière : il la complète, une
         * fraction de seconde plus tard, par un `replace-event` sur le même
         * événement. D'où ces deux messages plutôt qu'un — et c'est aussi bien,
         * car ce sont deux choses. Le fait tient en une ligne ; le résumé est un
         * document, et il se replie de lui-même comme n'importe quel document
         * long.
         */
        if (upsert.kind === 'replace-event') {
          const resume = event.blocks
            .filter((b) => b.kind === 'text')
            .map((b) => b.text ?? '')
            .join('\n\n')
            .trim();
          if (!resume) return;
          const titre = t('passerelle.compactionResume');
          const source = resume.length > PAGE_RICHE ? `${resume.slice(0, PAGE_RICHE)}…` : resume;
          // Le repli refusé, on préfère un document déplié à un document perdu :
          // c'est la même règle que la cascade de `envoieRendu`.
          if (!(await tg.envoieReplie(chatId, titre, enBlocs(source)))) {
            await repond(chatId, `${titre}\n\n${source}`);
          }
          return;
        }

        // La fenêtre repart de bas : elle a de nouveau le droit de se remplir,
        // et de le signaler.
        fil.alerte = false;
        await tg.envoie(
          chatId,
          t('passerelle.compaction', {
            // Le même format que `/etat`, sans quoi la conversation dirait
            // « 31 k » ici et « 30549 » deux lignes plus bas pour la même
            // fenêtre.
            avant: nombre(event.compaction.preTokens),
            apres: nombre(event.compaction.postTokens),
          }),
        );
        return;
      }

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

    // Le seul flux qu'on relaie, et il ne devient pas un message : la bulle
    // éphémère qui dit que ça travaille. Voir `activite.ts`.
    case 'activity':
      fil.battement.montre(upsert.activity);
      return;

    case 'status': {
      if (upsert.status === 'working') {
        fil.tour.clear();
        return;
      }
      // Tout ce qui n'est plus `working` vide le tour, `waiting` compris — et
      // c'est voulu. `waiting`, c'est l'agent qui s'arrête pour vous demander
      // quelque chose : ce qu'il a écrit avant part **maintenant**, et la
      // demande suit avec ses boutons. On voit ce qu'il veut faire avant d'avoir
      // à le trancher, au lieu de choisir à l'aveugle puis de lire pourquoi.
      fil.battement.arrete();
      const dit = [...fil.tour.values()].join('\n\n').trim();
      fil.tour.clear();
      if (dit) await repond(chatId, dit);

      if (upsert.status === 'failed') {
        await tg.envoie(chatId, t('passerelle.sessionEchouee', { message: upsert.error ?? '' }));
        defait(chatId, false);
      } else if (upsert.status === 'ended') {
        await tg.envoie(chatId, t('passerelle.sessionFinie'));
        defait(chatId, false);
      } else {
        // Après la réponse, jamais avant : ce qu'on attendait passe d'abord, et
        // l'avertissement ne s'interpose pas entre la question et sa réponse.
        await signaleFenetre(chatId, fil);
      }
      return;
    }

    case 'permission-request': {
      // La balle est dans votre camp : ce n'est plus AURA qui travaille, et
      // laisser battre la bulle ferait croire le contraire.
      fil.battement.arrete();
      const demande = upsert.request;
      const plan = planPropose(demande);
      if (plan) {
        // Le plan est le seul appel dont l'argument *est* la décision : le nom
        // de l'outil n'apprend rien, et deux boutons sans le texte reviennent à
        // faire approuver ce qu'on n'a pas lu.
        const source = `${t('passerelle.plan')}\n\n${plan}`;
        const coupe = source.length > PAGE_RICHE ? `${source.slice(0, PAGE_RICHE)}…` : source;
        await tg.envoieRendu(
          chatId,
          enBlocs(coupe),
          coupe,
          boutons([
            { texte: t('passerelle.approuver'), donnee: `p:${demande.id}:a` },
            { texte: t('passerelle.refuser'), donnee: `p:${demande.id}:d` },
          ]),
        );
        return;
      }
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
      // La balle est dans votre camp : laisser battre la bulle ferait croire
      // qu'AURA travaille encore.
      fil.battement.arrete();
      const demande = upsert.request;
      if (!demande.questions.length) return;
      const f = formulaire(demande.id, demande.questions);
      fil.asks.set(demande.id, f);
      await poseQuestion(chatId, fil, f);
      return;
    }

    /**
     * Reçu pour un formulaire **encore présent** : personne n'a répondu, et le
     * garde-fou du quart d'heure (`runner.ts`) a tranché à notre place. Quand
     * c'est nous qui répondons, l'entrée est déjà partie.
     */
    case 'ask-settled': {
      const perime = fil.asks.get(upsert.id);
      fil.asks.delete(upsert.id);
      if (fil.attente === upsert.id) fil.attente = null;
      if (!perime) return;
      // Sans cela, des boutons morts resteraient pressables sous une question
      // que plus rien n'attend.
      if (perime.messageId !== null) {
        await tg.reecritClavier(chatId, perime.messageId, { inline_keyboard: [] });
      }
      await tg.envoie(chatId, t('passerelle.questionExpiree'));
      return;
    }

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
      await tg.envoie(chatId, aide());
      return;

    case 'etat':
      await ecranEtat(chatId);
      return;

    case 'compacter': {
      const runner = courant(chatId);
      if (!runner) {
        await tg.envoie(chatId, t('passerelle.aucunFil'));
        return;
      }
      // La seule commande de Claude Code qu'on relaie, et elle passe par la file
      // d'entrée comme un tour : c'est le CLI qui compacte, pas nous. Rien à
      // annoncer ici — la frontière de compaction s'annoncera d'elle-même, avec
      // ses chiffres, quand elle arrivera.
      runner.send('/compact');
      return;
    }

    case 'sessions':
      await tg.envoie(chatId, await etatDesSessions());
      return;

    case 'accueil':
      await ecranAccueil(chatId);
      return;

    case 'projets':
      await ecranProjets(chatId, true);
      return;

    case 'projet': {
      const projet = await trouve(chatId, intention.ref);
      if (!projet) {
        await tg.envoie(chatId, t('passerelle.projetInconnu'));
        return;
      }
      // Un nouvel écran, et non une réécriture : la commande a été tapée, donc
      // elle a sa place dans le fil, à sa date.
      vue(chatId).messageId = null;
      await ouvreProjet(chatId, projet);
      return;
    }

    case 'voir': {
      const v = vue(chatId);
      if (!v.entrees.length) {
        await tg.envoie(chatId, t('passerelle.aucuneListe'));
        return;
      }
      const rang = Number(intention.ref);
      if (!/^\d+$/.test(intention.ref.trim()) || !v.entrees[rang - 1]) {
        await tg.envoie(chatId, t('passerelle.fichierInconnu'));
        return;
      }
      await page(chatId, rang, 1);
      return;
    }

    case 'ouvrir': {
      const projet = await trouve(chatId, intention.ref);
      // La garde de l'Atelier à distance : on n'ouvre que sur un projet que
      // Claude Code connaît déjà. Un chemin quelconque de la machine ne tombe
      // sur rien — il n'y a donc pas de règle à contourner, seulement une liste
      // dans laquelle être.
      if (!projet) {
        await tg.envoie(chatId, t('passerelle.projetInconnu'));
        return;
      }
      await ouvreAtelier(chatId, projet);
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
      // Une question qui attend capte ce qui serait parti comme un tour : c'est
      // le « Other » du harnais, et la seule façon de répondre ce qu'aucun
      // bouton ne dit. L'interception vit **ici**, après `parseIntention` : sous
      // une question, `/stop` et `/fin` restent des commandes.
      const fil = fils.get(chatId);
      const f = fil?.attente ? fil.asks.get(fil.attente) : undefined;
      if (fil && f) {
        await avanceQuestion(chatId, fil, f, repondLibre(f, intention.texte));
        return;
      }
      runner.send(intention.texte);
      return;
    }
  }
}

/**
 * Un bouton pressé : un pas de navigation, une page tournée, une permission
 * tranchée, une question répondue.
 *
 * Tout est attendu, y compris ce qui n'a rien à rendre. Détacher une promesse
 * ici la sortirait du `try` de l'appelant **et** du crochet d'erreur de la
 * bibliothèque : un disque qui répond mal pendant une navigation deviendrait un
 * rejet non traité, et Node termine le process là-dessus. Un clic emporterait
 * le serveur et les sessions de l'Atelier avec lui.
 *
 * Trancher une permission ou une question, en revanche, rend bien la main
 * aussitôt : les deux dénouent une promesse tenue côté runner. C'est le tour
 * suspendu qui repart, pas cet appel.
 */
async function tranche(chatId: number, donnee: string): Promise<void> {
  const [type, id, suffixe] = donnee.split(':');
  if (!type || !id) return;

  // Naviguer et tourner une page ne tranchent rien et ne demandent aucune
  // session : ces cas passent donc **avant** la garde ci-dessous, qui refuserait
  // de parcourir un projet simplement parce qu'aucun agent ne tourne.
  //
  // La navigation seule admet un ordre sans argument — « retour », « ouvrir
  // ici » n'ont rien à désigner.
  if (type === 'n') {
    await navigue(chatId, id, suffixe ?? '');
    return;
  }
  if (!suffixe) return;
  if (type === 'v') {
    await page(chatId, Number(id), Number(suffixe));
    return;
  }

  const runner = courant(chatId);
  const fil = fils.get(chatId);
  if (!runner || !fil) return;

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
    const f = fil.asks.get(id);
    if (!f) return;
    await avanceQuestion(chatId, fil, f, presse(f, suffixe));
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

/**
 * Pose la liste des commandes chez Telegram, une fois par langue.
 *
 * Elle y était saisie à la main dans `@BotFather`, donc hors du dépôt : rien
 * n'empêchait d'y annoncer une commande retirée depuis. Elle vient désormais de
 * la même table que le routage et l'aide.
 *
 * Chaque langue reçoit la sienne, **la référence comprise**, et le défaut la
 * double. Cette redondance apparente est mesurée, pas décorative : n'ayant posé
 * que le défaut pour le français, un client réglé en français demandait `fr`,
 * ne trouvait rien, et n'affichait aucune commande — là où le client web
 * retombait bien sur le défaut. Plutôt que de départager les deux, on ne laisse
 * plus de repli à prendre.
 *
 * Rien de bloquant : un échec ne coûte que l'autocomplétion, et la Passerelle
 * marche sans. On le journalise plutôt que d'y renoncer en silence.
 */
async function declareCommandes(tg: Telegram, journal: Journal): Promise<void> {
  const rate = (quoi: string): void =>
    journal.warn(`Passerelle : Telegram a refusé la liste des commandes (${quoi}).`);

  // Le défaut : ce que voit un client dont la langue n'est pas des nôtres.
  if (!(await tg.declare(withLocale(DEFAULT_LOCALE, pourTelegram)))) rate('défaut');

  for (const langue of SUPPORTED_LOCALES) {
    if (!(await tg.declare(withLocale(langue, pourTelegram), langue))) rate(langue);
  }
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
  await declareCommandes(tg, journal);

  tg.ecoute(
    // La garde passe avant tout traitement, et le silence est la réponse à un
    // inconnu : répondre confirmerait que ce bot existe et à quoi il sert.
    (chatId) => autorise(chats, chatId),
    async (message) => {
      try {
        await traite(message.chatId, message.texte);
      } catch (e) {
        journal.warn(`Passerelle : ${publicMessage(e)}`);
      }
    },
    async (bouton) => {
      try {
        await tranche(bouton.chatId, bouton.donnee);
      } catch (e) {
        journal.warn(`Passerelle : ${publicMessage(e)}`);
      }
    },
    (message) => journal.warn(`Passerelle : ${message}`),
  );
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
  vues.clear();
  telegram?.stop();
  telegram = null;
}
