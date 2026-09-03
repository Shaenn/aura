// Tout ce que le BFF donne à lire à l'utilisateur, en français.
//
// La charte de voix (`docs/voix.md`) vaut ici comme à l'écran : une erreur dit
// ce qu'AURA voulait faire, ce qui a échoué, et ce qui reste possible.

import diagnostics from './fr-diagnostics.ts'

export default {
  diagnostics,
  /** Refus de requête : le client a mal formé sa demande, ou vise l'absent. */
  errors: {
    notFound: 'Introuvable.',
    fileNotFound: 'Fichier introuvable.',
    entryNotFound: 'Élément introuvable.',
    backupNotFound: 'Backup introuvable.',
    planNotFound: 'Plan introuvable.',
    unknownSession: 'Session inconnue.',
    /** Le processus visé n'est plus là, ou n'a jamais été un processus Claude. */
    processNotFound: "Je ne trouve pas ce processus parmi ceux de Claude. Il vient peut-être de s'arrêter — rechargez la liste.",
    cannotKillSelf: "Je ne me termine pas moi-même. Utilisez l'extinction : elle coupe d'abord les sessions de l'Atelier.",
    paramRequired: 'Paramètre "{name}" requis.',
    paramsRequired: 'Paramètres "{first}" et "{second}" requis.',
    bodyExpected: 'Corps attendu : {shape}.',
    dateFormat: 'Dates attendues au format AAAA-MM-JJ.',
    dateOrder: '"from" doit précéder "to".',
    projectAndIdRequired: '`project` et `id` sont requis.',
    unknownRules: 'Règle inconnue : {names}.',
    invalidPreferences: 'Préférences invalides.',
    serverNameRequired: 'Nom de serveur requis.',
    workdirRequired: 'Dossier de travail requis.',
    /** Le plafond du parc : un refus qu'un geste de l'utilisateur lève aussitôt. */
    tooManySessions: "Je n'ouvre pas de session de plus : {max} tournent déjà, et chacune tient un processus. Fermez-en une et j'ouvre celle-ci.",
    emptyMessage: 'Message vide.',
    /** Les images jointes à un tour : refusées avant l'envoi, jamais après. */
    attachmentsShape: "Je n'ai pas reconnu les images jointes. Le tour n'a pas été envoyé.",
    attachmentType: "Je ne sais pas joindre une image de type {type}. Le tour n'a pas été envoyé — PNG, JPEG, GIF et WebP passent.",
    attachmentTooBig: "Cette image dépasse 5 Mo, ce que l'API refuse. Le tour n'a pas été envoyé ; une capture réduite passera.",
    unknownAttachment: "Cette image n'est plus en mémoire. Elle reste dans le transcript.",
    /** La sortie d'un shell de fond : le fichier est temporaire, il s'efface. */
    unknownShell: "Je ne retrouve pas la sortie de ce shell. Le fichier temporaire n'est plus là.",
    permissionModeRequired: 'Mode de permission requis.',
    purgeTargetRequired: "Je n'efface pas de sauvegarde sans savoir laquelle.",
    /** Le détail reste au journal du serveur : il porte des chemins du poste. */
    unexpected: "Je n'ai pas pu mener cette opération à son terme. Le détail est dans mon journal.",
    permissionModeUnknown: "Je n'ouvre pas de session en mode {mode}.",
    decisionExpected: 'Réponse attendue : allow, allow-always ou deny.',
    answersExpected: 'Réponses attendues, par question.',
    alreadyDecided: 'Demande déjà tranchée.',
    questionAlreadyDecided: 'Question déjà tranchée.',
    accessDenied: 'Accès refusé.',
  },

  /** Garde de chemins et écriture : les refus qui protègent `~/.claude`. */
  guard: {
    outsideRoot: 'Chemin hors du dossier géré : {path}',
    notWritable: "Je n'écris pas hors des ressources éditables : {path}",
    fileChanged: 'Le fichier a changé sur le disque depuis la prévisualisation.',
    claudeJsonChanged: '~/.claude.json a changé sur le disque depuis la prévisualisation.',
    badHost: "Je ne réponds qu'à une requête adressée à cette machine.",
    crossSite: "Je ne réponds pas à une requête venue d'un autre site.",
  },

  mcp: {
    argsMustBeStrings: 'args doit être une liste de chaînes.',
    unknownTransport: 'Transport inconnu : préciser une commande (stdio) ou une URL (http).',
  },

  /** L'Atelier : ce qu'AURA écrit dans le fil d'une session qu'elle possède. */
  agent: {
    permissionTimeout: "Personne n'a répondu à cette demande d'autorisation dans le quart d'heure ; je la refuse par défaut.",
    sessionStopped: 'Session arrêtée.',
    deniedFromAtelier: "Refusé depuis l'Atelier.",
    sessionEnded: "La session s'est arrêtée : {message}",
    /**
     * Une fin sans exception : le CLI a refermé son flux de lui-même.
     *
     * C'était jusqu'ici le seul chemin de fin qui n'écrivait rien — la session
     * s'arrêtait sans un mot, et l'écran ne distinguait pas cette fin-là d'un
     * plantage. Elle ne dit pas de cause parce qu'il n'y en a pas à dire : le
     * flux s'est refermé, la reprise reste possible.
     */
    streamClosed: "Le flux s'est refermé de lui-même. Je n'ai plus de session en cours ; vous pouvez la reprendre.",
    /**
     * La boucle repart après une mort, et il faut dire dans quel état.
     *
     * Une reprise silencieuse serait pire que la panne : rien ne distinguerait
     * à l'écran un contexte retrouvé d'un contexte perdu, et le fil affiché
     * laisserait croire au second que l'agent se souvient du premier.
     */
    relaunched: "J'ai relancé la session sur l'échange précédent.",
    relaunchedFresh: "J'ai relancé la session, mais sans son contexte : elle n'avait pas encore d'identifiant à reprendre.",
    /** Le fil vient d'être vidé : ces deux lignes sont tout ce qui reste à l'écran. */
    cleared: "J'ouvre une nouvelle session. Le contexte est vide ; l'échange précédent reste sur disque.",
    clearedByCommand: "J'ouvre une nouvelle session : /clear a vidé le contexte. L'échange précédent reste sur disque.",
    pickerUnavailable: 'Sélecteur de dossier indisponible sur {platform}.',
    noPowerShell: 'Aucun hôte PowerShell trouvé.',
  },

  /**
   * Ce qu'AURA dit dans une messagerie.
   *
   * Même charte qu'à l'écran, avec une contrainte de plus : l'interlocuteur ne
   * voit pas l'Atelier. Un message doit donc porter son propre contexte — dire
   * quelle session, quel dossier — là où l'écran le montrait déjà.
   */
  passerelle: {
    /**
     * L'aide se compose à partir de `passerelle/commandes.ts` : ces morceaux
     * sont les seuls à écrire, et la liste des commandes n'est plus recopiée.
     */
    /**
     * L'accueil, et il constate plutôt qu'il ne se présente.
     *
     * `docs/voix.md` range l'accueil parmi les surfaces où AURA parle d'elle :
     * le « je » doit y porter une information que la formulation impersonnelle
     * ne portait pas. D'où l'état du parc et de la conversation, plutôt qu'un
     * sommaire de ce que les boutons montrent déjà.
     */
    accueil: 'Je pilote l’Atelier de Claude Code depuis cette conversation.',
    accueilProjets: 'Je connais {n} projets.',
    accueilUnProjet: 'Je connais un projet.',
    accueilAucunProjet: 'Claude Code n’a encore travaillé sur aucun projet ici.',
    accueilSession: 'Une session est déjà ouverte ici, sur {cwd}.',
    accueilTravaux: '{n} sessions tournent en ce moment.',
    accueilUnTravail: 'Une session tourne en ce moment.',
    menuProjets: 'Projets',
    menuSessions: 'Sessions',
    menuAide: 'Aide',
    aideEntete: 'Je pilote l’Atelier depuis cette conversation.',
    aidePied: 'Tout autre message part à la session comme un tour.',
    aideConsulter: 'Consulter, sans rien lancer :',
    aideTravailler: 'Travailler :',
    /** L'argument d'une commande qui en prend un, tel qu'il s'écrit dans l'aide. */
    aideArgument: '<n>',
    /**
     * Ce que fait chaque commande — une ligne, à la première personne.
     *
     * Elles servent deux fois : dans l'aide, et dans la liste que Telegram
     * propose sous le `/`. La seconde les affiche seules, sans le reste du
     * message : elles doivent donc se suffire à elles-mêmes.
     */
    commandes: {
      projets: 'Les projets que Claude Code connaît, numérotés.',
      projet: 'L’arborescence d’un projet : on descend dossier par dossier.',
      voir: 'Le contenu d’un fichier de la dernière liste.',
      atelier: 'J’ouvre une session sur ce projet.',
      etat: 'Où en est la session d’ici, et sa fenêtre de contexte.',
      compacter: 'Je compacte la conversation sans attendre que la fenêtre déborde.',
      sessions: 'Ce qui tourne en ce moment.',
      stop: 'J’interromps le tour en cours.',
      fin: 'Je ferme la session de cette conversation.',
      aide: 'Je répète ce que je sais faire.',
    },
    sessionOuverte: 'Session ouverte sur {cwd}. Écrivez-moi ce qu’il y a à faire.',
    projets: 'Les projets que je connais. Le numéro sert à /projet et à /atelier.',
    aucunProjet: 'Claude Code n’a encore travaillé sur aucun projet ici.',
    /** La garde de l'Atelier à distance : on n'ouvre que ce qui est déjà connu. */
    projetInconnu: 'Je ne reconnais pas ce projet. /projets donne ceux que j’ouvre, avec leur numéro.',
    dossier: '{ou} — {total} fichiers.',
    ouvrirIci: '▶ Ouvrir l’Atelier ici',
    retourProjets: '◀ Projets',
    remonter: '◀ Dossier parent',
    /** L'état de navigation vit en mémoire : un redémarrage l'efface. */
    navigationPerimee: 'Cette liste date d’avant mon redémarrage. Refaites /projets.',
    projetVide: 'Je ne trouve rien à lire dans {nom}.',
    aucuneListe: 'Choisissez d’abord un projet avec /projet <n>.',
    fichierInconnu: 'Ce numéro ne désigne aucun fichier de la dernière liste.',
    /** L'en-tête d'un document trop long pour un seul message. */
    pageDe: '{fichier} — page {page} sur {total}',
    precedent: '◀ Précédent',
    suivant: 'Suivant ▶',
    /** Le cas le plus fréquent après un redémarrage du serveur : le fil est rompu. */
    aucunFil: 'Aucune session n’est ouverte ici. Ouvrez-en une avec /atelier <dossier>.',
    aucuneSession: 'Rien ne tourne en ce moment.',
    /** Deux origines, et seule la première se pilote d'ici. */
    sessionsAtelier: 'Ouvertes par AURA — je peux leur parler :',
    sessionsAilleurs: 'Ouvertes ailleurs — je les vois, je ne les pilote pas :',
    sessionFinie: 'La session s’est terminée.',
    sessionEchouee: 'La session s’est arrêtée : {message}',
    /**
     * L'état de la session, et d'abord sa fenêtre.
     *
     * L'en-tête reste **nominal** : ce sont des étiquettes de données, et le
     * modèle y figure parce que la limite en dépend — un pourcentage sans son
     * dénominateur ne se vérifie pas.
     *
     * `etatSansReleve` n'est pas une excuse mais un fait : rien n'a encore été
     * demandé au modèle, donc il n'y a pas de fenêtre à annoncer. Montrer un
     * zéro se lirait comme une mesure, alors que c'est l'absence de mesure.
     */
    etatEntete: '{cwd} — {modele}, mode {mode}',
    /** Avant `init`, le SDK n'a pas encore dit quel modèle il emploie. */
    etatModeleInconnu: 'modèle inconnu',
    etatFenetre: 'Fenêtre : {tokens} / {limite} tokens — {pourcent} %',
    etatSansReleve: 'Aucun tour n’a encore répondu : je n’ai pas de relevé de la fenêtre.',
    /**
     * Une compaction, dite avec ses chiffres.
     *
     * C'est le seul moment où la fenêtre change sans que vous ayez rien fait :
     * le « je » y porte une information que rien d'autre ne donne. Les chiffres
     * ne sont pas du zèle — sans eux, « j'ai compacté » ne dit pas si l'on est
     * reparti de dix mille tokens ou de cent mille.
     */
    compaction: 'J’ai compacté la conversation : {avant} tokens ramenés à {apres}.',
    /**
     * Le titre du résumé, et la raison d'un second message.
     *
     * Le résumé est un document — la conversation entière réécrite —, pas une
     * phrase. Il part donc comme les autres documents, et Telegram le replie de
     * lui-même derrière un « Afficher plus ». C'est ce qui reste dans la fenêtre
     * après la compaction : le lire, c'est savoir ce que l'agent a gardé.
     */
    compactionResume: 'Ce que j’ai gardé de la conversation',
    /**
     * Le franchissement du seuil, dit une fois et pas davantage.
     *
     * `docs/voix.md` range la recommandation parmi les surfaces où AURA parle
     * d'elle : elle conseille, elle ne se contente pas de mesurer.
     */
    fenetrePleine: 'Je vous signale que la fenêtre est occupée à {pourcent} % — une compaction approche.',
    permission: 'Je voudrais utiliser {outil}.',
    autoriser: 'Autoriser',
    /**
     * L'en-tête d'un plan soumis. Il dit ce que les boutons engagent : sans
     * cela, « Approuver » sous un long document ne dit pas ce qui suit.
     */
    plan: 'Je vous propose ce plan. Je n’écris rien avant votre accord.',
    approuver: 'Approuver',
    refuser: 'Refuser',
    /** Le motif transmis au modèle, et non à l'utilisateur : il reste bref. */
    refuseDeLoin: 'Refusé depuis la messagerie.',
    /**
     * Le formulaire de l'Atelier, posé une question par écran.
     *
     * `questionLibre` porte la seule chose qu'aucun bouton ne dit : qu'on peut
     * répondre autre chose que ce qui est offert. Sans elle, la possibilité
     * existe sans que personne ne la découvre.
     */
    questionEtape: '{header} — question {n} sur {total}',
    questionMultiple: 'Plusieurs réponses possibles.',
    questionLibre: 'Pressez une option, ou écrivez votre réponse.',
    questionValider: 'Valider',
    questionExpiree: 'Personne n’a répondu à cette question dans le quart d’heure ; je l’ai laissée passer.',
    commandeInconnue: 'Je ne connais pas {commande}. /aide donne ce que je sais faire.',
    /**
     * La bulle éphémère montrée pendant qu'un tour travaille.
     *
     * Les mêmes libellés qu'à l'écran (`src/i18n/fr/agent.ts`) : une session
     * lue de deux endroits ne doit pas raconter deux histoires. Ils sont
     * recopiés plutôt que partagés — le serveur ne connaît pas `src/`, et une
     * dépendance dans ce sens serait pire que ce doublon.
     */
    activite: {
      ligne: '{quoi} — {duree}',
      requesting: 'Requête en cours',
      thinking: 'Réflexion',
      writing: 'Rédaction',
      compacting: 'Compactage du contexte',
      retrying: 'Nouvelle tentative {attempt}/{max}',
      /** La phase `tool` n'a pas de libellé : elle se nomme de ses outils. */
      toolUnnamed: 'Outil en cours',
      secondes: '{n} s',
      minutes: '{min} min {s} s',
    },
  },

  hooks: {
    failed: 'Le hook a échoué (code {code}).',
    blocked: 'Le hook a empêché la poursuite du tour.',
  },

  /** Ce qui a rempli la fenêtre de contexte, tel que le rejeu le nomme. */
  context: {
    preamble: '(préambule)',
    skillNamed: 'Skill {names}',
    skillInvoked: 'Skill invoqué',
    deferredTools: 'Outils différés ({count})',
    hookBlocked: 'Hook {name} — bloqué',
    todoReminder: 'Rappel de tâches ({count})',
    turnReasoning: 'Tour {turn} — raisonnement et réponse',
  },

  /** Les zones de `~/.claude` que la page Maintenance mesure et purge. */
  storage: {
    projects: 'Transcripts de conversations',
    'file-history': 'Historique des fichiers édités',
    telemetry: 'Télémétrie en attente',
    'paste-cache': 'Cache des collages',
    'shell-snapshots': 'Snapshots de shell',
    plans: 'Plans générés',
  },
}
