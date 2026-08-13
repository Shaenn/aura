---
id: atelier
title: Atelier
icon: construction
order: 100
routes: [atelier]
---

Travailler avec l'agent **depuis AURA**, sans terminal. C'est le seul écran où je lance Claude moi-même : ailleurs j'observe des sessions que le CLI possède, ici **je possède la session**.

La conséquence est la promesse de l'écran : chaque outil que l'agent veut employer passe par vous, dans un bandeau, avec le chemin ou la commande visée sous les yeux.

## Ouvrir une session

### Ce qui tourne déjà

Si des sessions sont ouvertes, elles coiffent l'écran — **tous dossiers confondus**, avec leur état et leur âge. Un clic y revient : rien n'est recréé, je me rabranche sur le flux, et le premier message me rend tout l'état.

Cette liste est la seule voie de retour. Une session n'a qu'une adresse, son `run` dans l'URL : l'onglet fermé sans garder le lien, elle continuerait de tourner sans être joignable. La croix l'arrête, ce qui libère sa place — voir le plafond plus bas.

### Le dossier de travail

C'est le seul champ obligatoire, et le plus facile à rater — l'agent part de travers quand le dossier n'est pas celui qu'il croit. Trois façons de le désigner :

- **les trois derniers projets** connus de Claude Code, les plus récents d'abord. Un projet dont le chemin réel n'a pas pu être relu est écarté : proposer un dossier qui n'existe pas ferait échouer la session au premier outil ;
- **Parcourir…**, qui ouvre le sélecteur de dossiers **du système**. Le navigateur ne sait pas rendre ce service — il donne une poignée, jamais un chemin absolu — mais le service local tourne sur cette machine. Le sélecteur s'ouvre sur le dossier déjà choisi, sinon sur le **parent** du dernier projet, là où les projets se rangent côte à côte. Il peut passer derrière la fenêtre, et l'écran le signale. Le bouton disparaît définitivement si la plateforme du serveur ne sait pas l'ouvrir ;
- **le champ**, qui accepte un chemin collé, en barres obliques comme en antislashs.

### Reprendre plutôt que recommencer

Dès qu'un dossier est choisi, les **cinq dernières sessions** de ce dossier sont proposées. Un dossier porte souvent un travail entamé, et le rouvrir à vide ferait réexpliquer ce que la session précédente sait déjà.

La reprise se fait **en place** : le SDK recharge l'historique et écrit les nouveaux tours dans le **même** transcript. Il n'y a ni fichier à fusionner, ni identifiant à réconcilier — c'est la même session, qui recommence à respirer. Et comme son identifiant est connu d'avance, les panneaux latéraux se remplissent dès l'ouverture au lieu d'attendre le premier tour.

Au-delà de cinq, c'est un annuaire : la page **Projet** le tient déjà mieux.

### Modèle et permissions

Deux rangées de puces, en retrait : leurs valeurs par défaut conviennent presque toujours, et les mettre en avant ferait délibérer avant d'ouvrir. Chaque puce porte un mot — une icône pour les modes de permission — et **l'explication est dans son infobulle**.

Les deux **partent de vos réglages**. Le modèle a une puce `Réglages`, dont l'infobulle nomme le modèle qu'elle applique plutôt que de dire « hérité », ce qui obligerait à aller voir ailleurs. Le mode de permission, lui, est **pré-choisi sur celui de `settings.json`**, et son infobulle le signale : une session de l'Atelier n'a pas de raison d'être plus prudente que le reste de votre installation.

Quatre modes de permission sont proposés, **tous ceux qui laissent un humain dans la boucle** :

| Mode          | Ce qui remonte au bandeau                                 |
| ------------- | --------------------------------------------------------- |
| `Demander`    | Tout ce qui est risqué                                    |
| `Automatique` | Un classifieur tranche le tout-venant ; l'ambigu remonte  |
| `Éditions`    | Les éditions de fichiers passent seules, le reste remonte |
| `Plan`        | Rien n'est exécuté — l'agent réfléchit                    |

`bypassPermissions` et `dontAsk` sont **délibérément absents** : ils retirent l'humain de la boucle, chacun par un bout — le premier laisse tout passer, le second refuse tout ce qui n'est pas pré-autorisé, et ni l'un ni l'autre n'affiche jamais de bandeau. L'Atelier ne serait plus qu'un terminal en moins commode. Ils restent accessibles dans `settings.json`, pour qui les veut vraiment.

C'est aussi le seul cas où le pré-choix s'écarte de vos réglages : si `permissions.defaultMode` vaut l'un de ces deux modes, la session s'ouvre en `Demander`.

### Ouvrir ne lance rien

Une session s'ouvre **vide** et attend. Le service crée le runner mais **n'appelle le SDK qu'au dernier moment** : au premier message, ou au premier `/` ou `@` tapé — ces deux menus ont besoin de lui pour répondre. Une session ouverte et jamais adressée ne coûte rien.

## La session en cours

### La barre

L'état (`Prête`, `Au travail`, `En attente de vous`, `Terminée`, `Arrêtée sur erreur`), le **nom du dossier** — son chemin entier est dans l'infobulle, un chemin absolu remplirait la barre sans rien apprendre à qui l'a choisi —, l'insigne `reprise` le cas échéant, puis :

- **le modèle employé**, en lecture seule. Il se change par `/model`, comme dans le terminal : deux commandes pour un même réglage se contrediraient à l'écran dès que l'une des deux serait employée. La puce dit ce que le SDK emploie vraiment, et reste en retrait tant qu'il ne l'a pas confirmé — avant le premier tour, elle n'annonce que ce qui est _prévu_ ;
- **le mode de permission, modifiable en cours de session.** On découvre en travaillant qu'un mode plus souple ferait gagner dix allers-retours ; rouvrir une session pour cela perdrait le contexte qui a mené à ce constat. Les quatre modes sont côte à côte, celui qui s'applique se voit sans rien ouvrir. Le changement passe par le serveur, qui repousse la session à jour — l'écran n'affirme jamais un réglage qui ne s'applique pas ;
- **Auto-défilement** et **Suivre le direct**, exactement comme sur l'écran des sessions ;
- **Rejeu complet**, dès que l'identifiant du SDK est connu (c'est-à-dire après le premier tour) ;
- **Arrêter**.

### La ligne d'activité

Entre le fil et la saisie, une ligne dit **ce qui se passe à la seconde** — et c'est de l'information qu'aucun transcript ne porte : `Requête en cours`, `Réflexion` (avec les tokens de raisonnement qui défilent), `Rédaction`, `Compactage du contexte`, `Nouvelle tentative` après une erreur d'API, ou le nom des outils en vol avec leur chronomètre.

Sans elle, une session qui travaille ressemble à une session bloquée : ces moments-là ne produisent aucun événement de transcript. Le compteur court côté navigateur à partir d'un instant de départ, ce qui évite une trame réseau par seconde ; les mises à jour qui ne bougent qu'un chiffre sont regroupées par quart de seconde, un changement de phase part immédiatement.

### Autoriser un outil

Quand l'agent veut employer un outil que le mode ne laisse pas passer, une carte apparaît **au-dessus de la saisie** : c'est ce qui bloque l'agent, donc la seule chose à faire.

Elle montre **le chemin ou la commande en premier, en entier, sur autant de lignes qu'il faut** — autoriser sans voir où l'on écrit est le seul vrai danger de cet écran, et un modèle vise parfois un dossier qu'il a deviné avant de se corriger au tour suivant. Un dépliant donne l'appel complet, tel quel.

Trois réponses :

- **Autoriser** — cette fois seulement ;
- **Toujours autoriser** — applique en plus la règle que **le SDK** propose pour couvrir exactement ce cas. Elle ne se devine pas : c'est lui qui sait quelle règle correspond ;
- **Refuser** — l'agent en est informé et continue autrement.

Un compteur indique depuis combien de temps la demande attend, parce qu'elle **expire**. Sans réponse au bout d'un quart d'heure, elle est **refusée par défaut** — jamais l'inverse. Cette échéance n'existe pas pour vous presser : elle existe pour qu'un onglet fermé au mauvais moment ne laisse pas un processus suspendu pour toujours, invisible et vivant.

Répondre à une demande déjà tranchée — par un autre onglet, par l'échéance — n'est pas une erreur : le bandeau disparaît simplement.

### Répondre à une question

Quand l'agent pose une question à choix, **un dialogue s'ouvre**. Chaque option montre son libellé, son explication, et **sa maquette** quand elle en porte une — c'est souvent de l'ASCII, et c'est précisément ce qu'on est censé comparer avant de choisir.

Le dialogue plutôt que le pied de page : une question à trois maquettes fait deux écrans, et posée dans le fil elle écrasait la conversation qui l'a amenée — au moment précis où l'on a besoin de la relire pour répondre. **Il se referme** (croix ou `Échap`), ne laissant qu'un rappel d'une ligne au-dessus de la saisie ; le rappel le rouvre, et **rien n'est perdu** : ni le choix déjà fait, ni l'étape où l'on en était.

Un appel peut porter jusqu'à quatre questions. Elles sont alors présentées **une par étape**, l'en-tête de chacune faisant le titre de son étape — on avance quand la question courante a sa réponse, on revient librement, et l'envoi les transmet toutes d'un coup. Une seule question s'affiche sans étapes.

Techniquement, je **prends la place** de l'outil de question du CLI, qui a besoin d'une interface en terminal pour fonctionner. Ce détour n'est pas un raffinement : sans lui, l'agent ne reçoit pas une question sans réponse, il reçoit **« l'utilisateur n'a pas répondu »** — et poursuit sur sa propre supposition. La réponse est réinjectée dans la forme exacte que le harness produit, si bien que **le rejeu de la session la lit comme n'importe quelle autre question**.

### Parler, interrompre, arrêter

Le champ de saisie a le focus dès l'ouverture. **Interrompre** n'apparaît que pendant un tour — un bouton grisé le reste du temps occuperait la place d'une action possible. Un message envoyé pendant un tour est mis en file et traité ensuite.

**Arrêter** demande d'abord au CLI de sortir de lui-même, et ne le tue qu'après cinq secondes. Ce n'est pas de la politesse : en partant proprement, il **efface son propre fichier de session** — celui dont l'écran **Sessions actives** déduit qu'une session est en activité. Un processus tué laisse un fantôme derrière lui.

### Coller une image

Une capture d'écran se colle dans le champ, et autant qu'il en faut pour un même message. Les vignettes s'affichent au-dessus de la saisie, dans l'ordre où elles partiront — les images précèdent le texte dans le message envoyé, si bien que la consigne se lit après ce qu'elle commente.

C'est le seul endroit d'AURA où des octets voyagent en clair : le presse-papier ne donne pas de fichier sur le disque, seulement des octets, et personne d'autre que le navigateur ne les a. Une image de plus de cinq mégaoctets est **refusée à la pose**, avant l'envoi : c'est la limite de l'API, et laisser partir au-delà ferait découvrir l'échec après l'attente.

Chaque vignette porte son format et son poids. Une fois l'image envoyée, sa carte dans le fil ajoute ses **dimensions et son coût en tokens visuels** — ce sont les dimensions qui font ce coût, et une capture pleine page pèse souvent plus qu'une longue consigne écrite.

Claude Code écrit ensuite ces images dans son propre transcript : elles réapparaissent donc au **Rejeu**, comme celles qu'un outil produit.

### `@` pour désigner un fichier

Une arobase ouvre l'arborescence du dossier de travail, **n'importe où dans le message et autant de fois qu'on veut**. La recherche accepte un nom, un morceau de chemin, ou une extension seule — `ts`, `cs`, `xaml` — et les lettres d'un nom dans l'ordre au-delà de trois caractères.

Ce qui s'affiche est un arbre, un segment de dossier par ligne, trié comme un explorateur : dossiers puis fichiers, par ordre alphabétique. Chaque dossier se plie au chevron ou aux flèches ← et →, et **se choisit** comme un fichier — mentionner `@src/components/` désigne un périmètre de travail, ce qu'un fichier ne dit pas. La sélection se pose d'emblée sur la meilleure réponse, que l'ordre alphabétique ne sait pas désigner.

Ce que je propose est **borné au dossier de travail**, et il n'y a aucun moyen de m'en faire sortir : je ne reçois pas de chemin, je pars de celui de la session. Le périmètre est celui du dépôt — ce que `.gitignore` écarte n'est pas proposé, pas plus que les fichiers que je refuserais de lire ailleurs (`.env`, identifiants, clés). Un fichier hors du projet reste mentionnable : il se tape à la main, sans assistance.

### `/` pour les commandes

Une barre oblique **en tête de message** ouvre les commandes de la session : celles de Claude Code, celles du projet, les vôtres, et vos Skills. La liste vient du CLI lui-même, seule source qui les rassemble toutes, et se rafraîchit si elle change en cours de route — un Skill découvert dans un sous-dossier, par exemple.

Elles s'exécutent comme dans le terminal. Deux méritent d'être connues avant d'être tapées :

- **`/compact`** résume la conversation pour libérer du contexte. Le transcript ne change pas : une frontière s'y inscrit, et le fil la montre.
- **`/clear`** repart à vide. Ce n'est pas un compactage : Claude Code **ouvre un autre transcript**, et n'écrira plus une ligne dans le précédent. Le fil se vide donc comme dans le terminal, une ligne annonce la coupure, et l'adresse bascule sur la nouvelle session — c'est elle que le **Rejeu** ouvrira désormais. Ce qui précède n'est pas perdu pour autant : l'ancien transcript reste sur le disque, et la page **Projet** le retrouve.

## Le fil : deux sources cousues

C'est la mécanique la plus subtile de l'écran, et elle explique ce que vous voyez.

Le **flux du SDK** arrive au token près, mais il est plus maigre que le fichier que le SDK écrit : ni hooks, ni compactions, ni pièces jointes, ni sorties de slash-commandes, ni notifications de tâche, ni tours de sous-agents. Il ne porte pas non plus les identifiants sur lesquels le reste de l'écran se greffe.

Le **transcript sur le disque** porte tout cela — mais il n'est complet qu'à la fin d'un tour.

Je vous montre donc **le passé tel que le disque le porte, prolongé du tour en cours tel que le flux le donne**. La couture se pose à une frontière de tour humain, le seul repère commun aux deux sources, et elle ne se déplace **qu'entre deux actions** : la déplacer en plein tour mettrait du côté disque une réponse en cours d'écriture et ferait disparaître de l'écran ce qui est justement en train de s'y écrire.

Le fichier est tout de même relu **pendant** l'action, toutes les deux secondes et demie, pour que les panneaux dérivés — contexte, tâches, pistes — voient les réponses venir au lieu de les découvrir d'un bloc. Et si le fichier n'a pas encore rattrapé le direct à la fin d'une action, je redemande jusqu'à ce qu'il le fasse.

Les **pistes de sous-agents** n'existent que sur le disque : elles apparaissent donc à la fin du tour qui les a lancées.

## La colonne de droite

Au-delà de 1 280 px, une colonne ; en dessous, le contexte se replie dans un tiroir de la barre.

**Tâches / Arrière-plan** — une carte pour ce que la session fait faire, et un onglet par sujet qui a quelque chose à dire. L'onglet n'apparaît pas quand son sujet est vide, et la carte entière disparaît quand les deux le sont. Le chevron la replie sur sa seule barre d'onglets, pour rendre la hauteur au contexte : les compteurs y restent lisibles — l'avancement du plan, le nombre de commandes encore en vol — donc on la ferme sans perdre ce qu'on surveillait. Deux cartes séparées ne laissaient au contexte qu'un tiers de la colonne, alors qu'il est le seul des trois à porter une lecture longue.

**Tâches** — le plan de travail, lu sur le flux vivant : chaque `TaskUpdate` est un appel d'outil que le direct porte déjà, et attendre la fin du tour montrerait l'avancement en retard.

**Arrière-plan** — ce que les commandes lancées en arrière-plan sont devenues. Un `pnpm dev:all` quitte la ligne d'activité au bout de deux secondes — l'appel a rendu la main — et tient pourtant un port pendant une heure ; rien à l'écran ne le disait. La carte n'apparaît que si la session a lancé quelque chose : les commandes en cours en haut, les terminées repliées dessous, et un clic déplie la sortie, relue par tranches à partir d'où vous en étiez.

Vivante, une ligne dit surtout **le silence** : au-delà de quinze secondes sans une ligne écrite, j'affiche depuis quand. C'est le seul signe qui distingue une sentinelle qui attend sagement d'une sentinelle dont la condition n'arrivera jamais — un `until` qui boucle n'écrit pas un octet. Terminée, c'est le code de sortie qui compte, ou la mention **arrêté** si la commande a été coupée.

Un angle mort demeure : une commande tuée **hors de la session** — depuis Maintenance, ou depuis le système — ne m'est annoncée par personne. Sa ligne reste alors vivante, et c'est son silence qui grandit qui vous le dira.

**Fenêtre de contexte / Ressources** — le contexte se reconstruit en relisant le transcript : il n'existe donc **qu'après le premier tour**, et l'onglet le dit d'ici là. L'inventaire des ressources du projet n'est demandé qu'une fois son onglet ouvert.

## L'adresse, et ce qui survit

L'URL porte deux identifiants, et ce n'est pas une redondance :

- **`run`** est la session vivante côté AURA. Elle permet de revenir dedans et de continuer la conversation — mais **elle ne survit pas au redémarrage du service** : le registre vit en mémoire, délibérément, parce qu'il garde des promesses en attente qui ne se sérialisent pas.
- **`session`** est l'identifiant du SDK, écrit sur le disque avec le transcript. Il survit à tout — mais il n'est pas figé : un `/clear` ouvre un autre transcript, et l'adresse suit. Le précédent reste sur le disque, sous son propre identifiant.

Quand une adresse désigne une session qui n'est plus là, l'écran le **dit** au lieu de s'ouvrir vierge comme si le lien n'avait jamais rien désigné — et propose ce qui reste : **Reprendre** la conversation là où elle s'est arrêtée, ou ouvrir son **Rejeu**.

Une session survit à la fermeture de l'onglet : elle appartient au service, pas à la page. Deux onglets peuvent regarder le même travail, et ce que l'un répond, l'autre le voit.

### Deux bornes

Chaque session tient un processus `claude` entier. Deux limites l'encadrent, et elles ne font pas le même travail.

**Six sessions de front.** Au-delà, je refuse d'en ouvrir une de plus, et je le dis sous le bouton. Le refus se lève d'un geste : fermer une session libère sa place aussitôt. C'est la borne qui protège la machine.

**Trente minutes sans personne.** Une session que plus aucun onglet ne regarde et qui ne travaille pas est ramassée au bout d'une demi-heure sans un geste de votre part. Ce qui est ramassé n'est jamais perdu : le transcript est sur le disque, et **Reprendre** rouvre dessus.

Un onglet ouvert la protège **sans réserve**, même en arrière-plan, même une nuit entière. C'est délibéré : couper la session de quelqu'un qui revient d'un autre onglet coûterait plus cher que la place occupée — et cette place-là se voit en tête d'écran, où elle se libère d'un clic. Une session qui travaille n'est jamais ramassée non plus, si long que soit son tour.

## Où retrouver ce travail

Les sessions de l'Atelier écrivent leur transcript **au même format que le CLI**, dans le projet correspondant à leur dossier de travail. Elles apparaissent donc dans la page **Projet**, se rejouent comme les autres, et comptent dans l'**Usage** comme dans le **Diagnostic**.
