---
id: replay
title: Rejeu de session
icon: play_circle
order: 96
routes: [session]
---

La relecture intégrale d'une session Claude Code, reconstruite depuis son transcript. Cet écran est un **observateur** : il ne reprend pas la conversation et ne modifie rien.

Deux colonnes : la conversation à gauche, ce qu'elle a coûté et rempli à droite.

## L'en-tête

Le titre de la session — celui qu'elle porte, ou son premier message à défaut. L'insigne `nommée` distingue un titre **tapé par vous** d'un titre généré. En dessous : la branche git, les modèles utilisés, la date de début, et la mention de sous-agents s'il y en a.

Six indicateurs, chacun avec son infobulle :

| Indicateur | Ce qu'il compte                                |
| ---------- | ---------------------------------------------- |
| Tours      | Vos messages **/** les réponses de Claude      |
| Outils     | Le total des appels d'outils sur la session    |
| Tokens ↓   | Le contexte envoyé au modèle, hors cache       |
| Tokens ↑   | Le texte généré                                |
| Cache      | Les tokens relus depuis le cache de contexte   |
| Durée      | L'écart entre le premier et le dernier message |

## Les pistes

Si la session a lancé des sous-agents, une barre de pistes coiffe le flux : le fil principal, puis un onglet par run. Ce découpage n'est pas cosmétique — **un run de deux cents tours inséré à l'endroit de son appel noie le travail du fil principal**, et une session relue est justement celle qu'on lit d'un bout à l'autre sans avoir vécu le direct.

Le fil principal montre alors ce qui lui reste une fois les agents sortis, et **la carte de l'appel `Agent`** devient l'endroit où se lit ce que le sous-agent a fait, avec un lien vers sa piste.

La piste est inscrite dans l'URL : c'est une adresse, celle qu'on partage pour montrer ce qu'un agent a fait. Une piste inconnue retombe sur le fil principal plutôt que d'ouvrir un flux vide.

La barre suit le défilement d'un seul tenant : changer de piste au milieu d'une session de trois cents tours ne demande pas de remonter.

## La timeline

Les tours s'enchaînent dans l'ordre. Chaque réponse de Claude est une carte repliable dont l'en-tête donne le modèle, le résumé de son contenu, les tokens générés, la durée et l'heure — plus **deux chiffres de contexte** : la taille de la fenêtre à la fin de la carte, et ce que la carte y a ajouté.

`Tout déplier` / `Tout replier` atteignent **tous les plis** d'un coup : tours, appels d'outil, résultats, raisonnement, rapports.

### Les appels d'outil

Chaque appel est **replié par défaut** — et son corps n'est pas seulement caché, il n'est **pas monté** : la coloration syntaxique et le rendu Markdown sont tout le coût de la timeline, et une longue session compte des centaines d'appels que personne n'ouvrira.

L'en-tête replié porte une icône propre à l'outil, un résumé qui dit _ce qui_ a été fait (quel fichier, combien de lignes, quelle commande), une estimation des tokens ajoutés au contexte, et un état doublé d'un mot — la couleur ne porte jamais l'information seule.

Le corps utilise une vue **spécifique à l'outil** : un diff pour une édition, une liste de chemins pour une recherche de fichiers, les résultats d'un `Grep`, la réponse d'un serveur de langage, le rapport d'un sous-agent, une recherche web lue comme une recherche… Un outil jamais rencontré retombe sur une vue générique, qui affiche honnêtement ce qu'elle a plutôt que rien. Quand un outil a produit une **image**, elle passe avant le texte : c'est elle, le résultat.

### Le raisonnement

Claude Code n'écrit pas le raisonnement de Claude sur le disque : le bloc arrive dans le transcript avec sa seule signature, texte retiré. Je le montre pour ce qu'il est — `Raisonnement — non conservé dans le transcript`, sans repli, puisqu'il n'y a rien à déplier. Le bloc garde sa valeur : il dit **où** Claude a réfléchi, et le panneau de contexte compte ce que cette réflexion a coûté.

Un modèle servi par un backend local — Claude Code redirigé par `ANTHROPIC_BASE_URL` — n'émet pas ce bloc du tout. Les modèles des familles MiniMax, Qwen ou DeepSeek ouvrent leur réponse par leur raisonnement, entre `<think>` et `</think>`. Je l'en sépare à la lecture et le présente comme celui de Claude : replié, ses premiers mots en aperçu, le Markdown rendu au dépliage. À une différence près, qui compte — ici le texte est là.

Une balise restée ouverte, sur un tour coupé en route, ne se découpe pas : je laisse le texte entier plutôt que de le trancher au mauvais endroit.

### Ce qui apparaît entre les tours

Ces éléments ne se replient jamais dans une carte : **leur place dans le flux est ce qui les explique.**

- les **déclenchements de hooks**, autour de l'appel d'outil concerné — affichés même carte repliée, puisqu'un hook qui injecte du contexte ou bloque un tour explique ce qui suit ;
- les **compactions**, avec ce qu'elles ont emporté ;
- les **entrées et sorties du mode plan**, et le plan refusé qui dit qu'il l'a été et pourquoi ;
- les **questions posées** à l'utilisateur et l'option retenue ;
- les **messages reçus d'un équipier**, rendus comme des messages reçus et non attribués à l'humain ;
- les **commandes tapées** et le manuel qu'un skill verse dans la fenêtre.

Les hooks qui se sont exécutés **sans rien renvoyer ni signaler d'erreur** ne méritent pas une ligne chacun : ils sont comptés et regroupés en fin de flux, par commande.

### Les jalons de tour

Au début de chaque réponse, un jalon `Tour N` avec la croissance exacte de la fenêtre à ce tour. Il sert d'ancre aux liens `@N` du panneau de contexte — c'est ce qui rend le tour 148 trouvable dans une carte qui en compte des dizaines.

Quand quelque chose est entré **en silence** dans ce tour — un fichier réinjecté, une règle chargée — le jalon se déplie dessus.

### Rendu

Le Markdown des messages est rendu : code coloré (une trentaine de langages, PowerShell compris) et diagrammes **Mermaid** dessinés, qui se redessinent au changement de thème. Les liens externes s'ouvrent dans un nouvel onglet ; les liens relatifs restent dans le document.

## La colonne de droite

Trois panneaux, dont **un seul est déplié à la fois** — ou aucun. Ce n'est pas une économie de place gratuite : ouverts ensemble, ils recevaient 90, 250 et 170 pixels, soit trois barres de défilement empilées et un contexte réduit à deux de ses catégories. Replié, un panneau **garde son titre et son chiffre** : on replie le détail, jamais la mesure. Tout replier rend au transcript la pleine hauteur de l'écran.

Le contexte est déplié d'entrée : c'est le plus long des trois, et la question qu'on se pose en relisant une session est le plus souvent « qu'est-ce qui remplit la fenêtre ? ».

### Tâches

Le plan de travail rejoué depuis les appels `TaskCreate` / `TaskUpdate`. Il dit en dix lignes ce que trois cents tours ont poursuivi, et chaque tâche renvoie au tour où elle a commencé. C'est ici qu'il sert le plus : devant un direct on sait ce qu'on regarde, devant un transcript d'il y a trois mois, non.

Le compteur suit **le plan en cours**, pas le cumul de la session. Une session qui ne tient pas de liste n'a pas de panneau.

### Fenêtre de contexte

Le chiffre en tête est **exact** : le contexte envoyé au modèle au dernier tour de la phase, rapporté à la limite du modèle. Une courbe montre la montée du remplissage sur toute la session, compactions comprises.

Une **phase** est un segment entre deux compactions — une compaction vide la fenêtre. Le sélecteur n'apparaît qu'à partir de la seconde.

Quatre vues du même contenu :

- **Par catégorie** — ce qui mange la fenêtre, par nature. Sept catégories : mémoire, skills, fichiers, outils, raisonnement, vos messages, et **harnais** (les listes d'outils et d'agents, les instructions MCP, les rappels de tâches, les sorties de hooks — la machinerie que Claude Code injecte lui-même). Les catégories faites de chemins — mémoires, règles — se lisent en arbre de dossiers.
- **Par taille** — le classement brut, tous types confondus.
- **À plat** — dénormalisée : un `Read` de 40 k ne se cache plus derrière son agrégat.
- **Par tour** — croissance exacte tour par tour, détail estimé.

Déplier une ligne d'outils **nomme les outils**, du plus lourd au plus léger — « 12 appels d'outil au tour 7 » ne distingue pas un `Read` de 5 k de douze `Bash` à trois sous. Déplier une réponse sépare le **raisonnement** de la **réponse** : seul le premier se raccourcit en demandant moins de réflexion.

Un point de méthode, énoncé sur le panneau lui-même : le total et la croissance sont **mesurés**, la répartition par catégorie est **estimée** (≈ 4 caractères par token, faute de tokenizer hors ligne). Les deux ne sont jamais réconciliés en mettant les estimations à l'échelle — une répartition massée pour tomber juste aurait l'air fiable et serait fausse. Ce que les catégories n'expliquent pas est nommé « non attribué » et laissé tel quel : sur ce corpus, elles rendent compte d'environ un quart de la fenêtre.

Une session sans relevé d'usage — modèle synthétique, session interrompue — n'a pas de contexte à montrer, et le panneau le dit.

### Diagnostic de la session

Le total de la session, **décomposé en quatre postes** qui se somment, avec leur part. Le panneau se charge en arrière-plan, sans retenir la conversation : situer une session demande de relire tout le parc.

Puis **où elle se situe** dans votre parc : pour chaque mesure, une règle avec deux repères — la médiane du parc et cette session. Le remplissage porte le **rang**, pas la valeur, parce que les montants s'étalent sur trois ordres de grandeur.

Enfin les **constats** que les règles du diagnostic portent sur elle, avec un lien vers le diagnostic du parc. Aucun constat est un résultat en soi, et l'écran le dit.

Le ton est délibéré : **une session chère n'est pas une faute.** La plus coûteuse d'un corpus peut afficher 99 % de cache — elle n'est pas inefficace, elle est longue. L'écran informe, il ne note pas. Comme partout, les montants sont aux tarifs API, et un `≥` signale qu'un modèle n'a pas de tarif connu.

## Fraîcheur

Le transcript est relu quand le service signale que le fichier a bougé — une session encore ouverte se complète donc sous vos yeux, sans que le squelette de chargement efface ce que vous lisez. Une empreinte évite de reconstruire la timeline à l'identique quand rien n'a changé, et deux notifications rapprochées ne se courent pas après : une seule lecture est en vol, rejouée une fois à la fin si le fichier a rebougé.
