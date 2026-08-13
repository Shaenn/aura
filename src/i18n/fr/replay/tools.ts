// Les cartes d'appel d'outil : l'en-tête commun, les primitives partagées, puis
// ce que chaque vue dit en propre. Les noms d'outils (`Read`, `Bash`, `Agent`)
// sont des identifiants : ils ne se traduisent nulle part.

export default {
  call: {
    status: {
      ok: 'succès',
      error: 'erreur',
      running: 'en cours',
      none: 'sans résultat',
    },
    tokensTip:
      'Environ {n} tokens ajoutés au contexte (estimation à partir du nombre de caractères).',
    tokensTipImages:
      'Environ {n} tokens ajoutés au contexte (estimation à partir du nombre de caractères, et des dimensions pour l’image). | Environ {n} tokens ajoutés au contexte (estimation à partir du nombre de caractères, et des dimensions pour les images).',
  },

  /** Le pavé de sortie, partagé par toutes les vues qui montrent du brut. */
  output: {
    error: 'Erreur',
    result: 'Résultat',
    lines: '{n} ligne | {n} lignes',
    loadFull: 'Charger la sortie complète',
    seeAll: 'Voir tout ({n} lignes)',
    reduce: 'Réduire',
    copy: 'Copier le résultat',
    status: {
      ok: 'succès',
      error: 'échec',
      empty: 'vide',
    },
    noReload: 'Le fichier ne peut pas être relu depuis cette vue.',
    tooBig: 'Fichier trop volumineux : seul le début est affiché.',
    unreadable: "Je n'ai pas pu lire ce fichier.",
  },

  code: {
    copy: 'Copier {what}',
    theCode: 'le code',
  },

  diff: {
    caption: 'Différences pour {file} :',
    identical: 'identique',
    perOccurrence: 'par occurrence',
    replaceAll: 'tout remplacer',
    copyNew: 'Copier le nouveau texte',
    editedFile: 'le fichier édité',
  },

  params: {
    empty: '— aucun paramètre —',
  },

  paths: {
    count: '{n} fichier | {n} fichiers',
    overflow:
      '{n} fichier supplémentaire non affiché. | {n} fichiers supplémentaires non affichés.',
  },

  /** Les lignes que le CLI adresse au modèle, ramenées à ce qu'elles apprennent. */
  service: {
    identicalTo:
      'Résultat identique à un appel `{tool}` précédent — le CLI ne l’a pas renvoyé une seconde fois.',
    dontAsk: 'la session tournait sans demander de confirmation',
  },

  /** Le résumé qu'un appel affiche sur sa ligne d'en-tête, repliée. */
  summary: {
    lineRange: 'l. {from}-{to}',
    lineFrom: 'l. {from}…',
    everywhere: 'partout',
    planSubmitted: 'Plan soumis à validation',
    planMode: 'Passage en mode plan',
    shutdownAsk: "demande d'arrêt",
    shutdownYes: 'arrêt approuvé',
    shutdownNo: 'arrêt refusé',
  },

  /** Les clés des puces de paramètres, à gauche de leur valeur. */
  chips: {
    pattern: 'motif',
    in: 'dans',
    glob: 'glob',
    type: 'type',
    mode: 'mode',
    caseInsensitive: 'insensible',
    yes: 'oui',
    symbol: 'symbole',
    agent: 'agent',
    model: 'modèle',
    isolation: 'isolation',
    to: 'à',
    team: 'équipe',
    request: 'demande',
    task: 'tâche',
    background: 'arrière-plan',
    delay: 'délai',
    stop: 'arrêt',
    seconds: '{n} s',
    allowedDomains: 'domaines autorisés',
    blockedDomains: 'domaines exclus',
  },

  views: {
    agent: {
      state: {
        running: 'au travail',
        completed: 'terminé',
        failed: 'en échec',
        unknown: 'sans nouvelles',
      },
      turns: '{n} tour | {n} tours',
      files: '{n} fichier | {n} fichiers',
      follow: 'Suivre la piste de l’agent',
      open: 'Ouvrir la piste de l’agent',
      prompt: "Consigne envoyée à l'agent",
      report: "Rapport de l'agent",
      async:
        "Agent lancé en arrière-plan. Sa réponse n'arrive pas ici : elle revient plus tard, dans un tour à part.",
    },

    enterPlan: {
      what: "Le modèle passe en lecture seule : il explore et propose un plan, il n'écrit pas.",
    },

    glob: {
      sameAsBefore: 'Même résultat qu’un appel {tool} précédent.',
      empty: 'Aucun fichier ne correspond.',
      order: 'du plus ancien au plus récent',
      cutSome:
        '{rest} autres ne sont pas listés, sur {total} en tout : la liste garde les plus anciens, les modifications récentes manquent.',
      cutAll:
        'La liste est tronquée : elle garde les plus anciens, les modifications récentes manquent.',
    },

    grep: {
      empty: '— aucune correspondance —',
      modes: {
        files_with_matches: 'fichiers seulement',
        count: 'comptage',
      },
      overflow:
        '{n} correspondance supplémentaire non affichée. | {n} correspondances supplémentaires non affichées.',
      paged: 'Recherche paginée : {parts} — il y en a peut-être d’autres.',
      pagedOffset: 'les {n} premiers sont passés',
      pagedLimit: 'au plus {n} sont affichés',
    },

    lsp: {
      failed: "Le serveur de langage n'a pas répondu.",
      refused: "Appel refusé par l'utilisateur.",
      noResult: 'Aucun résultat.',
      indexing:
        'Un serveur de langage qui n’a pas fini d’indexer le projet répond de la même façon.',
      line: 'l.',
      callAt: 'appel en {at}',
      countIn: '{n} {what} dans {files} fichiers',
      count: '{n} {what}',
      /** Les `SymbolKind` du protocole, dans la langue du reste de l'interface. */
      kinds: {
        Property: 'propriété',
        Method: 'méthode',
        Constant: 'constante',
        Variable: 'variable',
        Class: 'classe',
        Function: 'fonction',
        File: 'fichier',
        Namespace: 'espace de noms',
        Module: 'module',
        Field: 'champ',
        Interface: 'interface',
        Enum: 'énumération',
        Struct: 'structure',
        Constructor: 'constructeur',
      },
      /** Ce qui manque, dit par l'opération plutôt que par le texte anglais du CLI. */
      empty: {
        findReferences: 'Aucune référence à ce symbole.',
        hover: 'Aucune information disponible à cette position.',
        documentSymbol: 'Aucun symbole dans ce fichier.',
        workspaceSymbol: 'Aucun symbole de ce nom dans le projet.',
        goToDefinition: 'Aucune définition trouvée.',
        goToImplementation: 'Aucune implémentation trouvée.',
        prepareCallHierarchy: 'Aucune hiérarchie d’appels à cette position.',
        incomingCalls: 'Aucun appel entrant.',
        outgoingCalls: 'Aucun appel sortant.',
      },
      /** Le mot que le CLI emploie dans son en-tête, et le nôtre. */
      what: {
        reference: 'référence | références',
        symbol: 'symbole | symboles',
        definition: 'définition | définitions',
        implementation: 'implémentation | implémentations',
        incomingCall: 'appel entrant | appels entrants',
        outgoingCall: 'appel sortant | appels sortants',
      },
    },

    plan: {
      allowed: 'Commandes pré-autorisées',
      edited: "Modifications apportées par l'utilisateur",
      approved: 'Plan approuvé.',
    },

    read: {
      display: 'Affichage du fichier lu',
      preview: 'Aperçu',
      trailer: 'Notes ajoutées au résultat',
    },

    write: {
      display: 'Affichage du fichier écrit',
    },

    search: {
      query: 'Recherche',
      found: 'Outils trouvés',
      loaded: 'Outils chargés',
      noMatch: 'Aucun outil différé ne correspond à cette recherche.',
      noSuchName:
        'Aucun outil différé ne porte ce nom — rien n’a été chargé. | Aucun outil différé ne porte ces noms — rien n’a été chargé.',
      asked: 'Chargement demandé',
      notKept: "Le transcript n'a pas gardé le résultat de cette recherche.",
      reserve: '{n} outil encore en réserve. | {n} outils encore en réserve.',
    },

    sendMessage: {
      kind: {
        shutdown_request: "demande d'arrêt",
        shutdown_response: "réponse à une demande d'arrêt",
      },
      askStop: "Demande de s'arrêter.",
      askStopWhy: "Demande de s'arrêter — {reason}.",
      approved: 'Arrêt approuvé.',
      refused: 'Arrêt refusé.',
      unreachable: 'Aucun agent nommé « {name} » n’est joignable.',
      delivered: 'Déposé dans la boîte {who}.',
      queued: 'Mis en file : {who} le recevra à son prochain tour d’outil.',
      noTask: "n'avait pas de tâche en cours",
      wasStopped: 'était arrêté ({why})',
      resumed: 'L’agent {state} : relancé en arrière-plan depuis son transcript, avec ce message.',
      stopSent: "Demande d'arrêt transmise à {who}.",
      stopDone: 'Arrêt approuvé : {who} en est informé, et l’agent {agent} se termine.',
    },

    shell: {
      unsandboxed: 'hors bac à sable',
      silent: "La commande n'a rien écrit.",
      launched:
        'Lancée en arrière-plan, identifiant {id}. Sa sortie s’écrit dans un fichier, hors du transcript.',
      touched:
        '{n} fichier déjà lu que la commande a modifié : | {n} fichiers déjà lus que la commande a modifiés :',
      exit: 'code de sortie {code}',
      exitMeaning: 'code de sortie {code} · {meaning}',
      meaning: {
        '1': 'échec',
        '2': 'usage ou syntaxe',
        '126': 'non exécutable',
        '127': 'commande introuvable',
        '130': 'interrompue',
      },
      refused: 'Commande non exécutée : la permission a été refusée.',
      declined: "Commande non exécutée : l'appel a été refusé.",
      cancelled: "Commande non exécutée : l'appel a été annulé.",
    },

    skill: {
      allowed: 'Outils autorisés le temps du skill',
    },

    task: {
      stopAgent: "Arrêt d'un sous-agent lancé en arrière-plan.",
      stopCommand: "Arrêt d'une commande lancée en arrière-plan.",
    },

    web: {
      failed: "La page n'a pas répondu — son contenu n'a pas été lu.",
      redirected: 'Redirigée vers un autre hôte — le contenu n’a pas été lu.',
      weight: '{size} parcouru',
    },

    webSearch: {
      denied: "La recherche n'a pas été autorisée — {why}.",
      results: '{n} résultat | {n} résultats',
    },
  },
};
