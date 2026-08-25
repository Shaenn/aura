// Le diagnostic, en français.
//
// Les signaux — leur nom, ce qu'ils mesurent, et sur quoi repose leur garde-fou —
// puis les règles et les recommandations. La mesure elle-même reste dans
// `server/diagnostics/` : elle ne dépend pas de la langue. Ici, seulement les mots.
//
// Ce catalogue est à part de `fr.ts` parce qu'il pèse à lui seul plus que tout le
// reste des textes du serveur.

const frDiagnostics = {
  metrics: {
    sessionCost: {
      label: 'Coût de la session',
      help: 'Ce que la session a coûté en tout, aux tarifs API — tours du fil principal et sous-agents compris. Porté par toute session dont le coût est connu et non nul.',
      guardBasis:
        "Quelques dollars : en dessous, aucune action d'optimisation ne rembourse le temps passé à la lire. Sans effet dès que votre P90 passe au-dessus.",
    },
    cacheReadCost: {
      label: "Relecture d'historique",
      help: "Ce que coûtent les tokens relus depuis le cache. À chaque tour, tout l'historique repasse au modèle : c'est le premier poste de dépense du parc, et il grandit avec la longueur de la conversation, pas avec le travail fait.",
      guardBasis:
        'Trois dollars de seule relecture : la moitié du plancher de coût total, puisque ce poste ne peut jamais représenter la session entière.',
    },
    toolTokens: {
      label: 'Contexte consommé par les outils',
      help: "Les tokens que les résultats d'outils ont mis dans la fenêtre — les Read en tête. Estimation : ce que ces résultats pèsent, pas ce qu'on a facturé pour eux.",
      guardBasis:
        "Une fenêtre standard entière : les résultats d'outils ont, à eux seuls, rempli l'équivalent d'un contexte complet. Plancher haut, et c'est voulu — nourrir la fenêtre est le métier d'un outil, pas un gâchis.",
    },
    toolErrorRate: {
      label: "Appels d'outil en erreur",
      help: "Part des appels d'outil revenus en erreur : des tokens dépensés sans résultat, plus la reprise qu'ils déclenchent. Mesuré sur les sessions d'au moins 20 appels — en dessous, un taux n'est qu'un accident d'arrondi.",
      guardBasis:
        "Un appel sur sept en erreur : en dessous, l'essai-erreur fait partie du travail normal. Ce signal vaut pour la friction qu'il révèle, non pour son enjeu monétaire, qui est petit.",
    },
    compactionWaste: {
      label: 'Tokens jetés par les compactions',
      help: "Ce que les compactions ont retiré de la fenêtre, sur les seules sessions qui en ont eu. Jeter du contexte est le but d'une compaction : seule une ampleur inhabituelle interroge, d'où un garde-fou volontairement haut.",
      guardBasis:
        "Deux fois et demie une fenêtre standard. Haut, délibérément : jeter du contexte est le but d'une compaction, et un plancher bas désignerait le fonctionnement normal — une compaction ordinaire en jette déjà l'équivalent de plusieurs fenêtres.",
    },
    subagentCost: {
      label: 'Coût des sous-agents',
      help: 'Ce que les délégations ont coûté, sur les seules sessions qui délèguent. En dollars et non en part du coût : une session dont le fil principal ne fait que lancer des agents leur doit 100 % de sa dépense, et un ratio qui sature ne désigne plus personne.',
      guardBasis: "Trois dollars de délégation : le prix en dessous duquel relancer autrement coûterait plus cher que ce qu'on économiserait.",
    },
    injectedContext: {
      label: 'Contexte injecté par le harness',
      help: "Mémoires, CLAUDE.md, catalogue des skills et machinerie du harness : ce qui entre dans la fenêtre avant que vous n'ayez rien demandé. Payé à chaque tour, puisque tout l'historique est relu. Estimation.",
      guardBasis:
        "Un vingtième d'une fenêtre standard, chargé avant votre première question et relu à chaque tour. Bas volontairement : contrairement à un outil, le socle ne produit rien en échange de la place qu'il prend.",
    },
    shortSessionBaseline: {
      label: 'Socle des sessions courtes',
      help: "Le contexte du premier tour des sessions de trois tours ou moins : ce qu'une session paie avant d'avoir rien fait. Restreint aux sessions courtes, parce que sur cent tours le socle est amorti et ne dit plus rien.",
      guardBasis:
        "Un dixième d'une fenêtre standard payé pour trois tours ou moins. Inactif sur ce parc : le socle y dépasse déjà ce plancher en médiane, et c'est le percentile qui décide. Ce signal ne pèse rien session par session — il vaut par son cumul.",
    },
    explorationRatio: {
      label: 'Explorations par modification',
      help: 'Combien de lectures et de recherches pour une écriture. Il décrit une manière de travailler, il ne la note pas : traquer deux heures un bug et le corriger en une ligne donne un ratio énorme et un excellent travail. Sur les sessions qui ont modifié quelque chose, et fait au moins 20 appels.',
      guardBasis:
        'Deux explorations pour une modification : en deçà, le rapport décrit un travail ordinaire. Sans effet dès que votre P90 passe au-dessus.',
    },
    turnsPerPrompt: {
      label: 'Tours par prompt',
      help: "Combien de réponses un de vos messages déclenche — le seul signal où plus bas est pire, et le seuil un P10. Là où on l'a mesuré, les sessions les plus productives font nettement plus de tours par prompt : un brief complet qu'on laisse courir bat dix relances courtes. Sur les sessions d'au moins 3 prompts et 10 tours.",
      guardBasis:
        "Trois réponses par prompt. En dessous, on est dans la relance courte, pas dans une manière de travailler. Sur un signal inversé, le plancher est un plafond : il n'agit que s'il tombe sous le P10.",
    },
    interruptions: {
      label: 'Interruptions',
      help: "Les fois où vous avez coupé la parole (Échap). Leur coût direct est négligeable ; ce qu'elles signalent ne l'est pas : à chaque fois, le travail partait ailleurs qu'attendu. Sur les sessions qui en portent au moins une.",
      guardBasis: 'Le seuil est franchi au-delà de deux, soit à la troisième interruption : une arrive, deux se discutent, trois dessinent un motif.',
    },
    rereadTokens: {
      label: 'Relectures de fichiers',
      help: 'Les tokens remis dans la fenêtre par un fichier déjà lu dans la même session. Un fichier relu trois fois y tient trois fois — et se paie ensuite à chaque tour. Estimation, sur les sessions qui ont au moins une relecture.',
      guardBasis:
        "Un dixième d'une fenêtre standard, remis dedans par des fichiers déjà lus. Bas, parce qu'une relecture n'apporte rien de neuf : ce sont les mêmes octets, payés une fois de plus, puis relus à chaque tour suivant.",
    },
    contextFill: {
      label: 'Remplissage de la fenêtre',
      help: 'Le pic de contexte atteint, rapporté à la limite du modèle. Approcher la limite annonce une compaction, donc du contexte perdu et un tour cher. Sur les sessions où le pic et la limite sont connus.',
      guardBasis:
        "Quatre cinquièmes de la fenêtre : le point où la compaction devient probable. Ce plancher-là n'est pas un jugement mais un fait mécanique, et il n'a donc pas à suivre le parc.",
    },
    cacheHitRatio: {
      label: 'Taux de cache',
      help: "La part de l'historique relue depuis le cache plutôt que réécrite au plein tarif. Plus bas est pire — c'est le second signal inversé, et son seuil un P10. Un taux faible trahit un contexte remanié en cours de route. Sur les sessions d'au moins 5 tours.",
      guardBasis:
        "Sept dixièmes : en dessous, la fenêtre est reconstruite plus qu'elle n'est relue. Ne porte que sur les sessions qui coûtent au moins un dollar — ailleurs, il n'y a rien à perdre.",
    },
    paceWindow: {
      label: 'Fenêtre de 5 h',
      help: "Ce qu'ont coûté cinq heures glissantes, toutes sessions confondues. C'est la grandeur que compte une limite d'usage : elle ne connaît pas les sessions, et une session à cheval sur deux fenêtres compte dans les deux.",
      guardBasis:
        "Trente dollars sur cinq heures : en dessous, aucune limite d'usage ne se rappelle à vous. Sans effet dès que le P90 de vos fenêtres passe au-dessus.",
    },
  },
  /**
   * Les constats, par règle. Trois choses chacun : le titre, la phrase qui
   * rapporte les chiffres, et la base de calcul de l'impact.
   *
   * Les paramètres sont posés en `{nom}` et arrivent déjà mis en forme —
   * `diagnostics/format.ts` les rend dans la ponctuation du pays. Les variantes
   * d'une même phrase sont des clés voisines, et non des fragments recollés :
   * une phrase se traduit entière ou pas du tout.
   */
  rules: {
    'historique-relu': {
      title: "Relecture d'historique",
      message:
        "Session {id} : {cost} passés à relire l'historique, soit {share} de ses {total}, sur {turns} tours et une fenêtre montée à {peak} tokens.",
      basis: 'Tokens de cache relus × tarif du modèle, jour par jour. Coût constaté, pas économie promise.',
    },
    'cache-faible': {
      title: 'Cache mal exploité',
      message:
        "Session {id} : {ratio} de cache seulement sur {turns} tours (le parc est à {median}). {tokens} tokens sont entrés au tarif plein plutôt qu'au dixième",
      unpriced: ', sur un modèle sans tarif connu.',
      priced: ', soit {cost}.',
      basis:
        "Entrée non mise en cache, plus le cache écrit (1,25 fois le tarif d'entrée). Une part était inévitable — le premier passage se paie toujours.",
    },
    'sous-agents-couteux': {
      title: 'Sous-agents coûteux',
      message: 'Session {id} : {count} sous-agent(s) ({types}) pour {cost}, soit {share} du coût de la session, en {turns} tours délégués.',
      unknownType: 'type inconnu',
      basis:
        'Coût relevé des fichiers de sous-agents de la session, au tarif de leur modèle. Dépense constatée, pas gaspillage : déléguer a souvent été le bon choix.',
    },
    'outils-gourmands': {
      title: 'Outils gourmands en contexte',
      message: "Session {id} : ~{tokens} tokens d'outils, {share} de ce qu'on sait nommer de sa fenêtre. ",
      top: '{name} en concentre ~{tokens} sur {calls} appels ({inputShare} en entrée).',
      basis: 'Texte des appels et des résultats, estimé à 4 caractères par token ; images chiffrées en pavés de 28 px.',
    },
    'outils-en-echec': {
      title: "Appels d'outil en échec",
      message: 'Session {id} : {errors} appels en erreur sur {calls} ({rate}, parc à {median})',
      worst: ', surtout {name} ({errors}).',
      noWorst: '.',
      wasted: ' ~{tokens} tokens dépensés sans résultat.',
      basis: 'Poids de chaque outil au prorata de ses échecs — le transcript ne chiffre pas un appel raté à part.',
    },
    'compaction-lourde': {
      title: 'Compactions lourdes',
      message: 'Session {id} : {count} compaction(s) ({kind}) ont jeté {tokens} tokens de contexte, sur une fenêtre montée à {peak}.',
      auto: '{count} subie(s)',
      manual: 'toutes déclenchées à la main',
      basis: '`preTokens − postTokens` de chaque compaction, deux chiffres écrits par le harness.',
    },
    'contexte-injecte': {
      title: 'Contexte injecté par le harness',
      message: 'Session {id} : ~{tokens} tokens de mémoires, catalogues et hooks',
      top: ' — surtout {list}.',
      noTop: '.',
      basis:
        'Texte des pièces jointes du harness, estimé à 4 caractères par token. Payé une fois par fenêtre, et de nouveau après chaque compaction.',
    },
    'exploration-sans-fin': {
      title: 'Beaucoup cherché, peu construit',
      message:
        'Session {id} : {explorations} lectures ou recherches pour {edits} modifications, soit {ratio} par modification (le parc est à {median}). ~{tokens} tokens sont entrés dans la fenêtre par ce chemin.',
      basis:
        "Texte des appels de Read, Grep, Glob et des recherches web, et de leurs résultats, estimé à 4 caractères par token. C'est ce que chercher a mis dans la fenêtre — pas ce qu'on aurait économisé.",
    },
    'brief-morcele': {
      title: 'Tâche donnée en morceaux',
      message:
        "Session {id} : {prompts} prompts pour {turns} réponses, soit {ratio} tours par prompt quand le parc en fait {median}. Un brief complet qu'on laisse courir va plus loin que dix relances courtes.",
      basis:
        'Prompts réellement tapés (hors injections du harness et échos d’outils) rapportés aux réponses du modèle. Aucun coût ne s’en déduit : c’est une manière de travailler, pas une dépense.',
    },
    reorientations: {
      title: 'Réorientations en cours de route',
      message:
        "Session {id} : {count} interruptions sur {turns} tours. Ce qu'elles coûtent est négligeable ; ce qu'elles marquent l'est moins — à chaque fois, le travail partait ailleurs que prévu.",
      basis:
        'Marqueurs « [Request interrupted by user] » comptés dans le transcript. Le travail déjà produit reste facturé, mais l’essentiel n’est pas là : une interruption dit qu’on n’allait pas où l’on voulait.',
    },
    relectures: {
      title: 'Fichiers relus',
      message: 'Session {id} : {calls} lectures portaient sur un fichier déjà lu, ~{tokens} tokens réinjectés',
      share: ' — {share} de ce que Read a rapporté.',
      noShare: '.',
      basis:
        "Résultats des Read dont le chemin avait déjà été lu, estimés à 4 caractères par token. Une relecture après compaction est inévitable — le fichier n'était plus dans la fenêtre.",
    },
    'fenetre-proche-limite': {
      title: 'Fenêtre proche de la limite',
      message: 'Session {id} : la fenêtre a atteint {peak} tokens, soit {fill} de la limite de {limit}',
      auto: ', et {count} compaction(s) ont été subies.',
      noAuto: '.',
      basis:
        'Plus grande fenêtre relevée sur les réponses de la session, rapportée à la limite du modèle telle que son usage la révèle (voir `contextLimitFor`).',
    },
    'socle-gaspille': {
      title: 'Sessions ouvertes pour rien',
      message:
        '{sessions} sessions de 3 tours ou moins ont chacune payé plus de {threshold} tokens de socle avant de dire quoi que ce soit : {tokens} tokens au total pour {turns} tours, soit {cost}.',
      basis:
        "Coût relevé de ces sessions, et taille exacte de la fenêtre de leur première réponse — prompt système, schémas d'outils et mémoires compris.",
    },
    'rythme-5h': {
      title: 'Fenêtre de 5 h chargée',
      message:
        'Les 5 dernières heures ont coûté {cost} sur {sessions} session(s), quand vos fenêtres valent {median} en médiane et {p90} au neuvième décile. Votre plus chargée a atteint {peak}.',
      basis:
        'Somme des réponses API des cinq dernières heures, chacune au tarif de son modèle. C’est la grandeur que compte une limite d’usage glissante — pas un gaspillage.',
    },
    'sessions-paralleles': {
      title: 'Sessions menées de front',
      message:
        "{hours} h ont été passées avec au moins deux sessions ouvertes en même temps ({share} du temps où vous en aviez une), jusqu'à {max} à la fois. Deux sessions de front consomment la fenêtre de 5 h deux fois plus vite.",
      basis:
        'Recouvrement des bornes de vos sessions, première et dernière ligne de chacune. Ces heures ne coûtent rien de plus en soi : elles disent à quelle vitesse la fenêtre glissante se remplit.',
    },
  },
  /**
   * Les recommandations : le titre du problème, le corps qui le chiffre sur
   * votre parc, et l'action conseillée.
   *
   * Les corps sont en voix neutre — ce sont des mesures, et une mesure
   * n'appartient à personne. Les actions, elles, sont à la première personne :
   * un conseil engage celle qui le donne. Voir `docs/voix.md`.
   */
  recommendations: {
    oneSession: '1 session',
    manySessions: '{n} sessions',
    wholeFleet: 'tout le parc',
    estimated: ' (estimé)',
    problem: '{where} — {amount}{estimated}.',
    titles: {
      'historique-relu': 'Les longues sessions repaient leur historique à chaque tour',
      'cache-faible': 'Des sessions qui ne profitent pas du cache',
      'sous-agents-couteux': 'Des délégations qui pèsent lourd',
      'outils-gourmands': 'Les sorties d’outils remplissent la fenêtre',
      'outils-en-echec': 'Des appels d’outil qui échouent en série',
      'compaction-lourde': 'Des compactions qui jettent beaucoup',
      'contexte-injecte': 'Mémoires, catalogues et hooks chargés à chaque fenêtre',
      'socle-gaspille': 'Des sessions ouvertes pour presque rien',
      'exploration-sans-fin': 'Des sessions qui cherchent plus qu’elles ne construisent',
      'brief-morcele': 'Des tâches données en morceaux',
      reorientations: 'Du travail réorienté en cours de route',
      relectures: 'Les mêmes fichiers relus plusieurs fois',
      'fenetre-proche-limite': 'Des fenêtres poussées jusqu’à la limite',
      'rythme-5h': 'Votre fenêtre de 5 h',
      'sessions-paralleles': 'Plusieurs sessions menées de front',
    },
    actions: {
      'historique-relu':
        'Je vous conseille de couper ces sessions : /compact à la fin de chaque sous-objectif, ou une nouvelle session avec un brief court qui pointe les fichiers utiles. Chaque tour supplémentaire repaie toute la conversation.',
      'cache-faible':
        "Cherchez ce qui invalide le cache en cours de route — édition d'un CLAUDE.md, changement de modèle, hook qui varie à chaque appel. Je ne peux pas le voir d'ici, mais c'est toujours l'une de ces trois causes.",
      'sous-agents-couteux':
        "Je vous conseille de réserver la délégation aux explorations vraiment indépendantes : chaque sous-agent repart d'un préambule complet, qu'il faut repayer.",
      'outils-gourmands':
        'Bornez les lectures (`limit`, `offset`), visez les extraits plutôt que les fichiers entiers, et préférez Grep à un Read intégral quand vous cherchez.',
      'outils-en-echec':
        "Allez voir ces sessions : un outil qui échoue en série signale une commande mal formée ou un chemin qui n'existe pas, et je vous facture chaque tentative.",
      'compaction-lourde':
        'Compactez plus tôt : jeter 600 k tokens signifie que vous avez payé pour les construire, puis payé pour les relire jusque-là.',
      'contexte-injecte':
        "Je vous conseille d'alléger les mémoires et les descriptions de skills : elles entrent dans chaque fenêtre, et de nouveau après chaque compaction.",
      'socle-gaspille':
        "Regroupez les questions courtes dans une session déjà ouverte : le prompt système et les schémas d'outils se paient à chaque ouverture.",
      'exploration-sans-fin':
        "Dites d'emblée où chercher — les fichiers, le module, la piste — et laissez la modification suivre. Quand l'exploration s'étire, c'est le plus souvent que la cible n'a pas été nommée.",
      'brief-morcele':
        "Donnez la tâche entière d'un coup, avec son critère de fin, et laissez-la courir. Je ne vous dis pas de faire moins de tours : les sessions qui produisent le plus en font deux fois plus par prompt.",
      reorientations:
        "Quand une interruption s'impose, prenez-la comme le signe que le brief manquait quelque chose : complétez-le plutôt que de redresser au fil de l'eau.",
      relectures:
        "Gardez le fichier dans la fenêtre plutôt que de le relire : ciblez les extraits (`limit`, `offset`). Et rappelez-vous qu'après une compaction, tout est à relire de toute façon.",
      'fenetre-proche-limite':
        'Coupez avant la limite plutôt que de la heurter : une compaction subie arrive au pire moment, quand la fenêtre a déjà été payée en entier à chaque tour.',
      'rythme-5h':
        "Je n'ai rien à corriger ici — c'est un état, à connaître avant de lancer une longue session. Si la fenêtre est déjà chargée, la suite ira moins loin.",
      'sessions-paralleles':
        "Sachez que deux sessions de front vident la fenêtre deux fois plus vite. C'est un choix légitime quand les tâches sont vraiment indépendantes ; c'est une surprise quand on ne l'avait pas vu venir.",
    },
    bodies: {
      'historique-relu':
        "{sessions} passent {share} de leur coût (médiane) à relire ce qu'elles avaient déjà lu. Elles tournent sur {turns} tours en médiane, avec une fenêtre montée à {peak} tokens. Le cache divise ce prix par dix, il ne l'annule pas : à chaque tour, toute la conversation repasse.",
      'cache-faible':
        "{sessions} tournent à {ratio} de cache (médiane) quand le parc est à {median}. Leur fenêtre est reconstruite au lieu d'être relue.",
      'sous-agents-couteux':
        '{sessions} ont délégué à {agents} sous-agents au total, qui portent {share} du coût de leur session (médiane). Un sous-agent ne partage pas le cache de son parent : il reconstruit son propre contexte.',
      'outils-gourmands':
        "{sessions} laissent les sorties d'outils occuper l'essentiel de ce qu'on sait nommer de leur fenêtre. Sur tout le parc : {top}. Ce qui entre au tour 3 est relu à chaque tour suivant.",
      'outils-en-echec':
        '{sessions} cumulent {errors} appels en erreur, soit {rate} de leurs appels (médiane). Un appel raté est facturé comme un autre, et sa sortie reste dans la fenêtre.',
      'compaction-lourde':
        '{sessions} ont jeté {tokens} tokens par compaction (médiane){auto} Ce contexte avait été payé à la construction, puis relu à chaque tour jusque-là.',
      compactionAuto: ', dont {n} subie(s) faute de place.',
      compactionManual: ', toutes déclenchées à la main.',
      'contexte-injecte':
        '{sessions} chargent plus que le reste du parc en mémoires, catalogues de skills et sorties de hooks. {top}Ces tokens entrent dans chaque fenêtre, et de nouveau après chaque compaction.',
      injectedTop: "Les plus lourds sur l'ensemble : {list}. ",
      'socle-gaspille':
        "{sessions} sessions se sont ouvertes pour {turns} tours en tout. Chacune a payé le prompt système, les schémas d'outils et les mémoires avant de rien faire — un coût fixe qui ne s'amortit que sur la durée.",
      'exploration-sans-fin':
        "{sessions} font {ratio} lectures ou recherches par modification (médiane), quand le parc en fait {median}. C'est le signal qui sépare le mieux deux manières de travailler — et il décrit, il ne note pas : traquer longuement un bug pour le corriger en une ligne ressemble exactement à ceci.",
      'brief-morcele':
        "{sessions} tournent à {ratio} réponses par prompt (médiane), contre {median} sur le parc. Le sens de ce chiffre est l'inverse de l'intuition : plus de tours par prompt va avec plus de travail abouti, pas moins. Un brief complet qu'on laisse courir bat dix relances courtes.",
      reorientations:
        "{sessions} cumulent {total} interruptions. Leur coût direct est négligeable ; ce qu'elles marquent l'est moins — à chaque fois, le travail partait ailleurs qu'attendu, et il a fallu le redresser en route.",
      relectures:
        "{sessions} ont relu {calls} fois un fichier déjà lu, ~{tokens} tokens réinjectés. Une part est inévitable : après une compaction, le fichier n'est plus dans la fenêtre. Le reste est de la place occupée deux fois.",
      'fenetre-proche-limite':
        '{sessions} ont poussé leur fenêtre à {fill} de la limite du modèle (médiane){auto} Tout ce qui est dans la fenêtre est relu à chaque tour : près de la limite, chaque réponse coûte son maximum.',
      windowAuto: ', et {n} compaction(s) ont été subies faute de place.',
      windowNoAuto: '.',
    },
    crossings: {
      reluOutils:
        "À noter : {n} de ces sessions ont aussi une fenêtre remplie par les sorties d'outils — c'est ce volume qu'elles relisent. Borner les lectures agit sur les deux fronts.",
      compactRelu:
        'À noter : {n} de ces sessions figurent aussi parmi les plus coûteuses en relecture — la compaction est arrivée après que la facture a été payée.',
      agentsRelu: "À noter : {n} de ces sessions relisent aussi beaucoup leur propre historique ; la délégation n'a pas allégé le fil principal.",
    },
    caveats: {
      throughput:
        'Le rendement qui sépare les deux quarts est un nombre d’éditions par heure : je mesure une activité, pas une valeur. Une session qui traque deux heures un bug subtil et le corrige en une ligne figure tout en bas de mon classement, et elle a pourtant bien travaillé.',
      listPrices:
        'Je compte aux tarifs API publics. Un abonnement Pro ou Max est facturé au forfait : mes montants disent ce que cet usage aurait coûté à l’API, pas ce que vous avez payé.',
      unpriced: "Je ne connais pas le tarif de {count} modèle(s) ({models}) : j'ai compté leurs tokens, mais leur coût manque à mes montants.",
      uncalibrated: "Je n'ai pas assez de cas pour calibrer le seuil de {rules} : ces constats reposent sur une valeur de repli, pas sur votre parc.",
      estimates:
        'Les chiffres en tokens marqués « ~ », je les estime à 4 caractères par token : ce sont des indications, jamais un décompte. Les montants en dollars, eux, viennent de compteurs écrits par le harness.',
    },
  },
}

/** La forme du catalogue de diagnostic — l'anglais s'y conforme. */
export type DiagnosticsCatalog = typeof frDiagnostics

export default frDiagnostics
