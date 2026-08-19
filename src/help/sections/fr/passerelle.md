---
id: passerelle
title: Passerelle
icon: forum
order: 105
routes: []
---

Piloter l'**Atelier** depuis une messagerie, quand vous n'êtes pas devant ce poste. Vous écrivez à un bot, j'ouvre une session ou je transmets votre message à celle qui travaille déjà, et je vous rends sa réponse.

C'est la seule partie d'AURA qui sorte de cette machine, et **elle n'existe que si vous la configurez**. Sans jeton, elle ne démarre pas, n'appelle rien, et rien ne change. C'est l'état par défaut, et il le reste.

## Ce qu'elle n'ouvre pas

Je continue de n'écouter que la boucle locale. La Passerelle **n'ouvre aucun port** : c'est moi qui vais chercher les messages chez Telegram, jamais Telegram qui vient frapper ici. Aucune porte n'est percée dans le pare-feu, aucune adresse n'est à exposer, et rien de ce qui garde l'API ne change.

C'est la raison d'être de cette forme plutôt que d'un tunnel ou d'une ouverture au réseau : une interface exposée demanderait une authentification à défendre, là où une requête sortante n'en demande aucune.

## Ce que cela vous coûte

Trois choses, et il vaut mieux les peser avant qu'après.

- **Un secret entre chez moi.** Partout ailleurs, je n'en porte aucun. Le jeton du bot vit dans `server/.env`, qui n'est pas versionné, et aucune de mes routes n'est en mesure de le renvoyer.
- **J'appelle un service externe.** Vos messages transitent par les serveurs de Telegram, comme n'importe quelle conversation qui s'y tient.
- **Le pouvoir accordé est celui d'un accès distant.** Qui écrit dans une conversation autorisée peut ouvrir une session, lui faire lancer une commande et autoriser une écriture sur ce poste. La liste des conversations autorisées n'est donc pas un confort : c'est la serrure.

Je refuse de démarrer si cette liste est absente. L'oubli ne doit pas ouvrir la machine au premier venu.

## L'activer

1. Créez un bot auprès de `@BotFather` sur Telegram, qui vous donne un jeton.
2. Récupérez l'identifiant de votre conversation — c'est un nombre ; celui d'un groupe est négatif.
3. Renseignez `server/.env` :

```
AURA_TELEGRAM_TOKEN=le-jeton-de-BotFather
AURA_TELEGRAM_CHATS=votre-identifiant
```

4. Redémarrez le service **entièrement**. Ce fichier est lu au démarrage et n'est pas relu à chaud : une variable ajoutée ne prend effet qu'au prochain lancement.

Une ligne dans mon journal confirme l'ouverture et le nombre de conversations autorisées. Si le jeton est refusé, je le dis et je m'arrête là plutôt que de réessayer indéfiniment — le reste d'AURA continue de fonctionner.

`AURA_TELEGRAM_MODE` fixe le mode de permission des sessions ouvertes de loin. Par défaut `default` : chaque outil sensible vous demande.

## Ce que vous pouvez me dire

### Consulter, sans rien lancer

`/projets` ouvre un **écran de navigation** : un bouton par projet. Un clic, et ce même message se réécrit pour montrer **l'arborescence** du projet — `.claude/ 59`, `workflow/ 15`, puis les fichiers de la racine. On descend dossier par dossier ; un fichier ouvre son contenu.

Un seul message pour tout le parcours, avec **◀ Dossier parent** à chaque étage. C'est délibéré : une conversation n'a pas de bouton précédent, et empiler une liste par clic laisserait derrière vous une file d'états morts qu'il faudrait remonter pour retrouver le fil.

Quatre-vingts fichiers d'affilée ne se lisent pas. Les ranger par catégorie aurait été une réponse — mais une réponse inventée, alors que **les chemins en portent déjà une** : les « catégories » de la page Projet _sont_ les dossiers de `.claude`. Suivre l'arbre montre donc le projet tel qu'il est rangé, plutôt qu'un classement parallèle à retenir.

Chaque dossier affiche le nombre de fichiers qu'il contient **à toute profondeur**. Et un dossier qui n'en contient qu'un autre est fondu avec lui — `rules/back/application` s'ouvre d'un seul clic, au lieu de trois écrans qui ne poseraient aucune question.

Les commandes restent disponibles quand vous savez déjà où vous allez :

| Message       | Ce que je fais                                                |
| ------------- | ------------------------------------------------------------- |
| `/projets`    | L'écran de navigation                                         |
| `/projet <n>` | La racine d'un projet, directement                            |
| `/voir <n>`   | Le contenu d'un fichier, par son rang dans la liste du projet |

C'est **le même inventaire que la page Projet** — ni plus, ni moins. Les mêmes gardes s'appliquent donc mot pour mot : un fichier que je refuse d'ouvrir à l'écran, je le refuse ici aussi, et les secrets (`.env`, identifiants, clés) ne sont proposés nulle part.

Rien de tout cela n'ouvre de session : aucun processus, aucun jeton dépensé, réponse immédiate. La racine d'un projet porte d'ailleurs un bouton **▶ Ouvrir l'Atelier ici**, qui évite d'avoir à retaper la commande.

Un dernier point, parce qu'il se remarquera : ces écrans vivent dans ma mémoire, pas sur le disque. Après un redémarrage du service, les boutons d'un message plus ancien ne désignent plus rien — je vous le dis plutôt que de rester sans réaction.

### Ce que devient un Markdown

Je le **traduis** en document structuré, et non en texte décoré : titres à leur niveau, listes, citations, blocs de code colorés selon la langue déclarée, liens cliquables, et de **vrais tableaux, avec leurs bordures et leur ligne d'en-tête**.

Un mot sur les tableaux, parce que c'est le cas qui décide de la lisibilité d'une spécification. Rendu en texte à chasse fixe, un tableau se disloque dès qu'il dépasse la largeur d'un téléphone : les colonnes passent à la ligne et l'alignement — sa seule raison d'être — disparaît. C'est pourquoi je passe par la messagerie enrichie, qui sait les dessiner pour de bon.

Deux réserves, tirées de l'observation et non de la documentation :

- une **case à cocher** (`- [ ]`, `- [x]`) n'est pas dessinée par les clients actuels, bien qu'elle existe dans le format. J'écris donc `☑︎` ou `☐︎` dans le texte : autrement, une liste de tâches perdrait l'état de chaque ligne sans que rien ne le signale ;
- ce qui n'est **pas** du Markdown — un `settings.json`, un fichier de réglages — part en chasse fixe, sans transformation. Y voir des puces et des emphases inventerait une structure qui n'existe pas.

Si un document malmène la traduction, je vous l'envoie **tel qu'il est écrit**, d'un seul tenant : je perds la mise en forme, je garde la mise en page et la longueur. Un document laid vaut mieux qu'un document disparu.

### Les documents longs

Un message reste borné, même enrichi. Un document plus long arrive donc **en pages**, avec deux boutons **◀ Précédent** et **Suivant ▶** — l'en-tête dit où vous en êtes (`page 2 sur 7`). La borne est large : la plupart des documents tiennent en une seule page.

La coupe tombe toujours sur une fin de ligne, jamais au milieu d'un mot. Et une page qui s'arrête à l'intérieur d'un bloc de code le referme, la suivante le rouvrant : sans cela, tout le reste du document s'afficherait comme du code.

Le fichier est relu à chaque page. Il peut donc avoir changé entre deux pages — c'est voulu : vous lisez le disque, pas une copie prise il y a dix minutes.

### Travailler

| Message        | Ce que je fais                             |
| -------------- | ------------------------------------------ |
| `/atelier <n>` | J'ouvre une session sur ce projet          |
| `/etat`        | Où en est la session d'ici, et sa fenêtre  |
| `/compacter`   | Je compacte la conversation, sans attendre |
| `/sessions`    | Je liste ce qui tourne, en deux groupes    |
| `/stop`        | J'interromps le tour en cours              |
| `/fin`         | Je ferme la session de cette conversation  |
| `/aide`        | Je rappelle ce qui précède                 |

Une conversation tient **une** session à la fois : en ouvrir une referme la précédente.

`/sessions` répond en deux groupes, parce que ce ne sont pas les mêmes choses. **Ouvertes par AURA** : celles que je possède, et les seules à qui je puisse parler. **Ouvertes ailleurs** : celles que vous avez lancées dans un terminal — je les vois par leur fichier d'état, je ne les pilote pas. Les confondre ferait croire qu'un message peut atteindre une session de terminal, ce qui est faux.

**Tout autre message part à la session comme un tour.** C'est le cas de loin le plus fréquent, et il ne demande aucune syntaxe.

### La fenêtre de contexte, vue de loin

De près, l'onglet **Contexte** de l'Atelier montre ce que la session a fait entrer dans sa fenêtre. De loin, on ne voyait rien : la conversation dit ce que l'agent répond, jamais la place qu'il lui reste. `/etat` comble ce trou.

```
C:\devl\tos — claude-opus-5, mode default

Fenêtre : 112 400 / 200 000 tokens — 56 %
```

Le modèle figure là parce que **la limite en dépend** : 200 000 tokens, ou un million sur une fenêtre longue. Un pourcentage sans son dénominateur ne se vérifie pas.

Le chiffre est **exact**, et c'est le même que celui de l'onglet Contexte — je le relève sur les réponses du modèle, qui portent le compte réel. Ce qui est relu du cache y est compté : cela occupe la fenêtre exactement comme le reste, seul le prix diffère.

`/compacter` n'attend pas que la fenêtre déborde. C'est la **seule** commande de Claude Code que je relaie, et la surface le justifie : de loin, on voyait la fenêtre se remplir sans pouvoir rien y faire — `/etat` disait le problème, celle-ci le règle.

Deux cas où je ne montre pas de chiffre, plutôt que d'en inventer un : quand aucune session n'est ouverte ici, et quand la session vient de naître sans qu'aucun tour ait encore répondu — il n'y a alors rien à relever.

### Je n'ouvre que des projets connus

`/atelier` n'accepte **que les projets que Claude Code connaît déjà** — ceux que `/projets` liste. Un dossier quelconque de la machine ne tombe sur rien : il n'y a pas de règle à contourner, seulement une liste dans laquelle il faut déjà figurer.

C'est délibérément plus strict que l'Atelier à l'écran, où vous parcourez le disque librement. Devant l'écran, vous voyez ce que vous choisissez ; de loin, non — et un chemin mal tapé ouvrirait une session ailleurs sans que rien ne le signale.

Le numéro, le chemin complet, le nom du projet ou son slug fonctionnent tous les quatre.

Une commande que je ne connais pas vous est signalée plutôt qu'envoyée à l'agent — sans quoi une faute de frappe passerait pour une panne.

Un message venu d'une conversation non autorisée reste **sans réponse**. C'est délibéré : répondre confirmerait que ce bot existe et à quoi il sert.

## Autoriser un outil de loin

Quand l'agent veut employer un outil que le mode ne laisse pas passer, je vous envoie un message avec deux boutons, **Autoriser** et **Refuser**. Votre réponse débloque le tour immédiatement.

Un plan fait exception, et il est le seul : quand l'agent soumet ce qu'il compte faire, le nom de l'outil n'apprend rien — c'est le texte qui se juge. Je vous envoie donc le plan entier, mis en forme, et les boutons **Approuver** et **Refuser** sous lui. Un plan très long est coupé ; il reste entier dans l'Atelier.

Une fois la demande tranchée, les boutons disparaissent du message — que la réponse soit venue d'ici, de l'Atelier, ou du délai qui a expiré. Un fil relu plus tard ne donne donc pas à croire qu'une question attend encore.

L'échéance de l'Atelier s'applique ici aussi : **sans réponse au bout d'un quart d'heure, la demande est refusée**, jamais l'inverse. Une commande lancée avant de partir ne restera donc pas suspendue indéfiniment.

## Répondre à une question

Quand l'agent vous demande de trancher, je vous pose le même formulaire que l'Atelier, **une question par message**. Chaque option arrive avec ce qui l'explique — sa description, et sa maquette quand elle en porte une. Le numéro devant le libellé est celui du bouton : Telegram rogne les boutons à trente-deux caractères, le texte au-dessus ne rogne rien.

Une question qui attend **plusieurs réponses** se coche : chaque option bascule entre ☐ et ☑, et **Valider** conclut. Seul le clavier bouge à chaque clic — la question, elle, reste où vous la lisiez.

Et si aucune option ne convient, **écrivez votre réponse** : tant qu'une question attend, un message ordinaire lui répond au lieu de partir comme un tour. Les commandes, elles, restent des commandes — `/stop` interrompt même sous une question.

Sans réponse au bout d'un quart d'heure, la question passe : je retire les boutons et je vous le dis.

## Pendant que ça travaille

Un tour peut durer dix minutes sans qu'un octet n'arrive. Je montre donc, le temps qu'il dure, une **bulle qui dit ce que je fais et depuis quand** — `Read, Grep — 1 min 12`. Les mêmes libellés qu'à l'écran : une même session lue de deux endroits ne doit pas raconter deux histoires.

Cette bulle n'est pas un message. Elle ne reste pas dans le fil, ne se relit pas, et disparaît dès que la réponse arrive. C'est ce qui la distingue d'un flux : elle occupe une place, toujours la même, au lieu de s'empiler.

Elle s'arrête dès que la balle passe dans votre camp — fin de tour, demande de permission, question. La laisser battre pendant que j'attends votre réponse ferait croire que je travaille encore.

Deux réserves, que je préfère dire : cette bulle demande une **conversation privée** et un client **mobile**. Sur le web, ou dans un groupe, elle ne s'affiche pas. Il reste alors le « en train d'écrire… » de l'en-tête, qui dit moins mais qui passe partout.

## Ce que je ne vous envoie pas

**La réponse de l'agent en fin de tour, et les demandes qui attendent une décision.** Rien d'autre — à deux exceptions près, et elles ont la même raison d'être.

Je vous préviens quand **la fenêtre a été compactée**, avec les deux chiffres qui rendent le fait utile : ce dont on part, et ce qu'il en reste. Le résumé suit dans un second message, **replié** : c'est la conversation entière réécrite, et c'est tout ce qui reste dans la fenêtre — le lire, c'est savoir ce que l'agent a gardé. Vous le dépliez si vous le voulez ; sinon il ne prend que trois lignes. Et je vous le dis **une fois** quand la fenêtre passe les 80 % — une seule, puis je me tais jusqu'à la prochaine compaction. Ces deux-là font exception parce qu'elles sont le seul cas où quelque chose change **sans que vous y soyez pour rien** : une compaction ne s'annonce pas, et de loin, rien ne la laisserait deviner. Tout le reste, vous l'avez demandé.

Ni les tokens au fil de leur écriture, ni le détail de ce qu'un outil a lu ou écrit. Une messagerie n'est pas une timeline : y déverser un flux le rendrait illisible et noierait ce qui demande une réponse. Le fil complet est dans l'Atelier, et le **Rejeu** le garde.

La réponse elle-même est un document, et je la rends comme tel — mêmes tableaux, mêmes titres, mêmes listes que pour un fichier. C'est ce que vous lisez le plus souvent ici ; ce serait le dernier endroit où laisser du Markdown brut.

Une réponse très longue est coupée plutôt que perdue — un texte tronqué se lit, un envoi échoué ne se voit pas. La coupe est large : cinq fois ce qu'un message ordinaire accepte.

## Les deux bornes, et ce qui vous protège

Le plafond de **six sessions** vaut ici comme ailleurs : je vous le dis dans la conversation plutôt que d'échouer sans un mot.

Le ramassage des **trente minutes** ne s'applique pas à une session pilotée d'ici. Tant que la conversation la tient, je la regarde — et une session regardée n'est jamais ramassée. Vous pouvez laisser un travail en plan et le reprendre le soir.

En revanche, une session **ne survit pas au redémarrage du service**. Si vous m'écrivez après un redémarrage, je vous dirai qu'aucune session n'est ouverte ; `/atelier` en rouvre une, et le travail précédent reste sur le disque.

## Ce que cela ne remplace pas

L'Atelier montre ce que la messagerie ne peut pas : le chemin exact qu'un outil vise, la fenêtre de contexte, les commandes lancées en arrière-plan. La Passerelle sert à lancer, surveiller et débloquer — pas à travailler à l'aveugle.

Les sessions ouvertes de loin sont des sessions comme les autres : elles apparaissent dans l'Atelier, se rejouent, et comptent dans l'**Usage** comme dans le **Diagnostic**.
