---
id: sessions
title: Sessions actives
icon: sensors
order: 94
routes: [sessions]
---

Le suivi **en direct** des sessions Claude Code en cours sur cette machine : la liste à gauche, le flux de la session choisie au centre, et — si l'écran est assez large — son suivi et sa fenêtre de contexte à droite.

## Comment je sais qu'une session existe

Claude Code écrit un fichier d'état par session dans `~/.claude/sessions`. Je les lis, mais je ne m'y fie pas aveuglément : **le CLI n'efface ce fichier que lorsqu'il sort de lui-même**. Un processus tué, ou coupé en plein tour, laisse le sien derrière.

J'interroge donc le système d'exploitation sur chaque PID, et j'**écarte les sessions dont le processus n'existe plus**. Sans PID, je garde l'entrée : mieux vaut un doute qu'un effacement. Angle mort assumé : Windows réattribue les PID, donc un fichier très ancien peut désigner un processus sans rapport.

Le rafraîchissement n'est **pas** un sondage rapide : le service surveille le dossier et **pousse** les changements. Un filet lent de 30 secondes rattrape les événements fusionnés ou perdus, et le cas où le flux poussé n'est pas disponible.

## Statuts

- **busy** — la session travaille : Claude produit une réponse ou exécute un outil. Point vert qui respire.
- **waiting** — la session est **bloquée sur vous** : une permission est demandée, ou une question posée. Point ambre qui respire — c'est le seul état qui attend quelque chose de vous, le laisser figé serait le pire cas.
- **idle** — la session est ouverte mais n'attend rien. Point gris fixe.

Un statut `waiting` qui dure est le signal utile de cet écran.

## La liste

Les sessions sont groupées par **projet** — un seul niveau, jamais un arbre : le projet est la seule coupure qui existe côté Claude Code, et des dossiers parents intermédiaires ne désigneraient rien qu'on puisse ouvrir. Chaque groupe se replie, et affiche un point s'il s'y passe quelque chose plus son nombre de sessions.

L'ordre des groupes suit l'ordre du service — **les sessions actives d'abord** — ce qui fait remonter du même coup les projets qui travaillent. Un champ de filtre apparaît au-delà de cinq sessions ; il porte sur le nom du projet, son chemin et le nom de la session.

Le nom affiché est débarrassé de sa queue d'identifiant : Claude Code nomme ses sessions `<projet>-<début d'identifiant>`, et dans une colonne déjà rangée par projet ce suffixe hexadécimal ne fait que pousser le nom utile hors du cadre. Une session qui n'a que son identifiant pour nom le garde.

## Le flux

L'en-tête donne le titre réel de la session — celui du transcript, pas la poignée technique —, l'état (`LIVE`, `AUTORISATION`, `idle`), et le nom du projet. **Cliquer le nom du projet copie son chemin complet** en présentation Windows, celle qu'on colle dans un explorateur ou un terminal.

Le flux lui-même est la même timeline que le rejeu : mêmes tours, mêmes cartes d'outil, mêmes jalons. Deux réglages le pilotent :

- **Auto-défilement** — colle le flux au bas. Il dit la vérité : remonter lire un message l'éteint tout seul, redescendre au bas le rallume. Le rallumer à la main ramène immédiatement en bas. Le suivi tient pendant que le contenu grandit — la coloration syntaxique, les images, un diagramme Mermaid font tous bouger la hauteur bien après le premier rendu.
- **Suivre le direct** — le tour en cours déplie ses outils et son raisonnement, les tours passés replient les leurs. C'est indépendant du défilement : on peut vouloir le détail sans courir après la fin.

Ouvrir une session ouvre toujours **sur sa fin**, même si l'on avait cessé de suivre la précédente.

### Les pistes d'agents

Si la session a lancé des sous-agents, une barre de pistes apparaît : le fil principal, puis un onglet par run. Chaque piste a son propre flux ; le fil principal montre alors ce qui lui reste une fois les agents sortis.

Le comportement à l'ouverture d'une piste suit ce qu'elle est : une piste **vivante** s'ouvre en bas, sur la suite qu'on attend ; une piste **terminée** s'ouvre en haut, parce qu'un run se lit du début.

Une session dont le fichier principal a disparu garde ses pistes de sous-agents : le fil principal est alors vide, et l'écran le dit explicitement plutôt que d'afficher « aucun message ».

## La colonne de droite

Au-delà de 1 280 px de large, une troisième colonne apparaît ; en dessous, le contexte se replie dans un tiroir — c'est un repli assumé, pas un vestige : la liste occupe déjà 300 px, et rogner davantage rendrait les sorties d'outil illisibles.

**Tâches** — le plan de travail reconstitué à partir des appels `TaskCreate` / `TaskUpdate` du transcript. Dans le flux, chaque mise à jour est un mouvement isolé ; ici la suite est recollée. Le compteur suit **le plan en cours**, jamais le cumul de la session : une session qui a mené un plan à son terme puis en a rouvert un autre afficherait sinon un chiffre qui mélange deux histoires. La carte est absente si la session ne tient pas de liste.

**Fenêtre de contexte / Ressources** — deux lectures d'un même projet dans une seule carte, parce qu'on regarde l'une _ou_ l'autre. Le contexte s'ouvre sur la **vue par tour, du plus récent au plus ancien** : devant un direct, le dernier tour est ce qu'on cherche. L'inventaire des ressources du projet, lui, n'est demandé qu'une fois son onglet ouvert.

Contrairement au rejeu, cette colonne n'affiche **pas** le coût : situer une session dans le parc demande de tout relire, ce qui n'a pas sa place dans un écran qu'on regarde en continu. Le diagnostic d'une session se lit au rejeu.

Tout lien du contexte ou du plan saute au tour visé, **en rebasculant si besoin sur la piste qui le contient**.

## Ce que je peux, et ne peux pas

J'**observe** les sessions, je ne les pilote pas. Envoyer un message, ou répondre à la demande de permission en cours, se fait dans le terminal qui a lancé `claude`. (Pour travailler _depuis_ AURA, c'est l'**Atelier**, qui possède ses propres sessions.)

Quand une session est en attente, un bandeau l'annonce. J'y montre l'action demandée **quand elle est identifiable** — le dernier appel d'outil resté sans résultat — avec sa commande ou son chemin. Une demande d'accès à un dossier, elle, est posée avant tout appel d'outil : elle n'apparaît pas côté fichiers, et le bandeau le dit plutôt que d'inventer.

### Toujours autoriser

La seule prise sur le futur. Le bouton propose une règle **déduite de l'action en attente** — pour une commande shell, les deux premiers mots avant la première option, par exemple `Bash(npm test:*)` — que vous pouvez corriger avant d'aller plus loin.

La règle est ajoutée à `permissions.allow` de `settings.json`, en repartant du contenu du disque pour que le diff reste minimal. Une règle déjà présente est refusée plutôt que dupliquée. L'écriture suit le contrat habituel : diff prévisualisé, puis application.

**Cela ne débloque pas la demande affichée** — elle attend toujours votre réponse dans le terminal. Ce sont les suivantes qui passeront sans question.

## Après coup

Une session terminée quitte cette liste. On la retrouve dans son projet, où son **rejeu** reste consultable — la même timeline, sans le direct.
