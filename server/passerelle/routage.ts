// Ce qu'un message venu de la messagerie veut dire, et qui a le droit de le dire.
//
// Tout ce qui décide est ici, et rien de ce qui décide n'appelle le réseau :
// c'est ce qui rend la garde vérifiable par un test sans bot ni jeton. Le
// client (`telegram.ts`) ne fait qu'apporter des chaînes ; la boucle
// (`index.ts`) ne fait qu'exécuter des intentions.

/** Ce qu'AURA a compris d'un message. Rien d'autre ne se commande d'ici. */
export type Intention =
  /**
   * Ouvrir une session d'Atelier sur un projet.
   *
   * `ref` est un numéro de la dernière liste, ou un chemin. Dans les deux cas
   * il désigne un **projet connu de Claude Code** : la boucle refuse le reste,
   * et c'est là que se joue la garde, pas ici.
   */
  | { kind: 'ouvrir'; ref: string }
  /** Les projets connus, numérotés pour les commandes suivantes. */
  | { kind: 'projets' }
  /** Choisir le projet à consulter, et lister ce qu'il porte. */
  | { kind: 'projet'; ref: string }
  /** Le contenu d'un fichier de la dernière liste. */
  | { kind: 'voir'; ref: string }
  /** Un tour de plus dans la session de cette conversation. */
  | { kind: 'parler'; texte: string }
  /** Fermer la session de cette conversation. */
  | { kind: 'fin' }
  /**
   * Où en est la session de cette conversation, et sa fenêtre de contexte.
   *
   * Distincte de `sessions`, qui compte le parc : celle-ci regarde la vôtre. De
   * loin, c'est la seule façon de savoir s'il reste de la place — la fenêtre est
   * ce qu'une conversation ne montre jamais d'elle-même.
   */
  | { kind: 'etat' }
  /**
   * Compacter la conversation sans attendre que la fenêtre déborde.
   *
   * Le seul cas où l'on relaie une commande de Claude Code, et il se justifie
   * par la surface : de loin, on voit la fenêtre se remplir sans pouvoir rien y
   * faire — `/etat` disait le problème, celle-ci le règle.
   */
  | { kind: 'compacter' }
  /** Ce qui tourne en ce moment, toutes conversations confondues. */
  | { kind: 'sessions' }
  /** Interrompre le tour en cours sans fermer la session. */
  | { kind: 'stop' }
  | { kind: 'aide' }
  /**
   * La première rencontre : ce que je suis, ce que je vois, et par où entrer.
   *
   * Distincte de l'aide, qu'elle doublait jusqu'ici. `/start` est le geste que
   * Telegram propose de lui-même à qui ouvre la conversation : il arrive avant
   * qu'on sache quoi demander, et une liste de commandes ne répond pas à ça.
   * L'aide, elle, est une référence — on y revient en sachant ce qu'on cherche.
   */
  | { kind: 'accueil' }
  /**
   * Rien à faire — un message vide, ou une commande qu'on ne sert pas.
   *
   * `raison` n'est pas une erreur à renvoyer telle quelle : elle dit à la
   * boucle s'il y a lieu de répondre. Une commande inconnue mérite un mot ; un
   * message vide n'en mérite aucun.
   */
  | { kind: 'ignorer'; raison: 'vide' | 'commande-inconnue'; commande?: string };

/**
 * Les conversations autorisées.
 *
 * Une liste blanche, jamais une liste noire : c'est la seule garde entre une
 * messagerie publique et un poste de travail. Ce qui n'est pas un entier est
 * écarté — un identifiant mal recopié ne doit pas devenir un `NaN` qui
 * ressemble à une autorisation.
 */
export function lireChats(raw: string | undefined): Set<number> {
  const chats = new Set<number>();
  for (const part of (raw ?? '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // `Number` accepterait `12 ` ou `0x10` ; on veut la forme que Telegram
    // écrit, et elle seule. Le signe est admis : un groupe a un identifiant
    // négatif.
    if (!/^-?\d+$/.test(trimmed)) continue;
    const id = Number(trimmed);
    if (Number.isSafeInteger(id)) chats.add(id);
  }
  return chats;
}

/**
 * Ce message vient-il d'une conversation autorisée ?
 *
 * Une liste vide n'autorise personne. C'est délibéré, et c'est l'inverse de la
 * convention habituelle où « vide » veut dire « tout » : ici, l'omission ne peut
 * pas ouvrir la machine au premier venu.
 */
export function autorise(chats: Set<number>, chatId: number): boolean {
  return chats.has(chatId);
}

/**
 * Ce qui suit la commande, s'il y a quelque chose.
 *
 * Tout ce qui reste après le premier espace, sans autre découpage : un chemin
 * Windows porte des espaces, et le couper en mots ferait d'un dossier deux
 * arguments dont aucun ne désignerait rien.
 */
function argument(texte: string): string {
  const i = texte.indexOf(' ');
  return i === -1 ? '' : texte.slice(i + 1).trim();
}

/**
 * Ce que veut un message.
 *
 * Une barre oblique en tête est une commande ; tout le reste est un tour à
 * envoyer. Cette asymétrie est voulue : on parle à l'agent bien plus souvent
 * qu'on ne le pilote, et le cas fréquent ne doit demander aucune syntaxe.
 */
export function parseIntention(brut: string): Intention {
  const texte = brut.trim();
  if (!texte) return { kind: 'ignorer', raison: 'vide' };
  if (!texte.startsWith('/')) return { kind: 'parler', texte };

  // Telegram suffixe les commandes du nom du bot dans un groupe : `/fin@monbot`.
  const mot = (texte.split(/\s/)[0] ?? '').split('@')[0]?.toLowerCase() ?? '';
  switch (mot) {
    case '/atelier': {
      const ref = argument(texte);
      // Sans référence, il n'y a pas de session à ouvrir : on montre les
      // projets, qui portent les numéros que cette commande attend.
      return ref ? { kind: 'ouvrir', ref } : { kind: 'projets' };
    }
    case '/projets':
      return { kind: 'projets' };
    case '/projet': {
      const ref = argument(texte);
      return ref ? { kind: 'projet', ref } : { kind: 'projets' };
    }
    case '/voir': {
      const ref = argument(texte);
      // Sans référence, il n'y a rien à ouvrir — l'aide dit la forme attendue.
      return ref ? { kind: 'voir', ref } : { kind: 'aide' };
    }
    case '/fin':
      return { kind: 'fin' };
    case '/etat':
      return { kind: 'etat' };
    case '/compacter':
      return { kind: 'compacter' };
    case '/sessions':
      return { kind: 'sessions' };
    case '/stop':
      return { kind: 'stop' };
    case '/start':
      return { kind: 'accueil' };
    case '/aide':
    case '/help':
      return { kind: 'aide' };
    default:
      return { kind: 'ignorer', raison: 'commande-inconnue', commande: mot };
  }
}
