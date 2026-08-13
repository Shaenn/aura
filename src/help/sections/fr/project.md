---
id: project
title: Détail d'un projet
icon: account_tree
order: 92
routes: [project]
---

Tout ce que je sais d'un projet, réuni sur un écran. Plusieurs magasins y cohabitent, et ils **ne vivent pas au même endroit** — c'est la clé pour comprendre ce qui est modifiable et ce qui ne l'est pas.

| Bloc                 | Emplacement réel                                       | Régime        |
| -------------------- | ------------------------------------------------------ | ------------- |
| Ressources `.claude` | `<sources>/.claude/`                                   | Lecture seule |
| Mémoire du projet    | Les `CLAUDE.md` et leurs équivalents, dans les sources | Lecture seule |
| Documents du dépôt   | `README`, `CONTRIBUTING`… à la racine des sources      | Lecture seule |
| Dossiers inclus      | Les dossiers des sources que vous avez demandé à voir  | Lecture seule |
| Plans                | `~/.claude/plans/`                                     | Supprimables  |
| Sessions             | `~/.claude/projects/<slug>/`                           | Rejouables    |

Le bandeau `.claude en lecture seule` en tête vaut promesse : **je n'écris jamais dans le dossier de sources d'un projet.** Inclure un dossier n'y change rien — c'est une préférence d'affichage, rangée chez moi.

## Les indicateurs

Quatre tuiles : le nombre de **ressources `.claude`**, le nombre de sessions enregistrées, le nombre de hooks déclarés par le projet, et le **poids du `.claude`** — la somme des tailles des ressources inventoriées, pas la taille des transcripts.

La première tuile et la dernière parlent du même ensemble, et de lui seul : ni la mémoire, ni les documents du dépôt, ni vos dossiers inclus n'y entrent, puisqu'ils ne sont pas dans `.claude`. Le compteur en tête du navigateur, lui, annonce autre chose : **tout ce que l'arbre montre**, plans et dossiers inclus compris.

## Le navigateur de ressources

À gauche, l'inventaire ; à droite, le contenu du fichier sélectionné. Les groupes arrivent **repliés** : un projet installé en aligne assez pour que le bas de l'arbre demande de faire défiler, alors que repliés ils tiennent tous à l'écran et disent d'un coup ce que le projet porte.

Les ressources sont rangées par catégorie, déduite du **premier segment** de leur chemin dans `.claude` :

**Agents**, **Skills**, **Commandes**, **Règles**, **Docs**, **Outils**, puis **Réglages** (`settings.json` / `settings.local.json`), **Mémoire** (tout `CLAUDE.md`), et **Autres** pour le reste. Seules les catégories non vides apparaissent.

Deux mises en forme méritent d'être signalées :

- **Un skill est présenté comme un dossier** — son `SKILL.md` en tête, ses fichiers de référence en dessous, et ses sous-dossiers repliables. C'est la forme réelle « un skill = un dossier + ses références », pas une liste de fichiers à plat.
- **Les règles et les docs retrouvent leur arborescence.** La liste est reconstruite en arbre repliable, chaque dossier affichant le nombre de fichiers qu'il contient.

Pour la **mémoire**, l'ordre est volontairement inversé : le `CLAUDE.md` d'un niveau est montré **avant** les sous-dossiers qui le surchargent — l'ordre dans lequel Claude Code les empile.

Les fichiers dont le nom évoque un secret (`credential`, `.env`, `secret`, `.key`, `.pem`) sont **exclus de l'inventaire**, même en lecture.

### La visionneuse

Un `.md` est affiché avec sa **carte de frontmatter** puis son corps rendu. La carte utilise le vocabulaire de la catégorie : celui des agents pour un agent, des skills pour un skill, et pour une règle le seul `paths`. Pour les autres catégories, **aucun vocabulaire n'est supposé** : les clés sont affichées telles quelles, sans être jugées « ignorées » au nom d'une référence inventée.

Tout fichier qui n'est pas du Markdown est affiché en bloc de code coloré selon son extension.

Le balisage HTML d'un document est **rendu, pas affiché**. Un README écrit à la main centre ses badges dans un `<div align="center">`, replie une section dans un `<details>` et commente un bloc qu'il ne publie pas encore : montrer ces balises en toutes lettres rendait le fichier illisible. Le HTML est assaini avant affichage — la mise en page passe, rien d'exécutable ne passe. Une image en chemin relatif ne peut pas être servie depuis les sources : j'affiche son texte alternatif dans un cadre en pointillés plutôt qu'une icône d'image cassée.

### La mémoire du projet

Ce balayage sort de `.claude` — c'est là que je parcours l'arborescence des sources. Il est donc **borné trois fois** : les dossiers lourds ou générés sont sautés (`node_modules`, `.git`, `dist`, `.venv`, les caches d'outils…), la profondeur est limitée à 6 niveaux, et le parcours s'arrête à 4 000 dossiers. Un monorepo pathologique donne une liste partielle, jamais une page qui ne répond plus. Les liens symboliques de dossier ne sont pas suivis.

Le groupe **Mémoire projet** réunit les fichiers d'instructions que les agents empilent par niveau : `CLAUDE.md`, mais aussi `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules` et `.github/copilot-instructions.md`. Ils sont cherchés **à toute profondeur**, parce que c'est ainsi qu'ils s'appliquent : le fichier le plus proche du code l'emporte sur celui de la racine.

Un projet peut porter un de ces fichiers **sans** dossier `.claude` : ce bloc est calculé indépendamment.

### Les documents du dépôt

Le groupe **Documents du dépôt** montre ce qu'un dépôt publie : `README`, `CONTRIBUTING`, `CHANGELOG`, `LICENSE`, `SECURITY`, `CODE_OF_CONDUCT`, `ARCHITECTURE` et quelques autres, avec ou sans extension. Le `README` vient en tête — c'est la porte d'entrée, l'ordre alphabétique le reléguerait derrière un `ARCHITECTURE.md`. Les gabarits de `.github/` ferment la liste.

Ceux-là sont pris **à la racine seulement**. Un `README.md` de sous-dossier n'a pas le statut d'un `CLAUDE.md` : dans un monorepo, la liste n'aurait pas de fin.

### Les dossiers inclus

Un dépôt met souvent sa matière la plus utile hors de `.claude` : un `docs/`, un `specs/`, un dossier de comptes rendus. **Inclure un dossier** l'ajoute à l'arbre, avec ses documents (`.md`, `.markdown`, `.txt`, `.rst`) en profondeur.

Je mesure, je ne tranche pas. Le sélecteur propose l'arborescence du projet avec, pour chaque dossier, le nombre de documents qu'il porte — mais ce nombre ne dit pas lesquels vous servent : un dossier de gabarits que le programme consomme ressemble trait pour trait à un dossier de documentation. C'est la seule chose que je ne peux pas décider à votre place.

On y compose une sélection entière, puis on l'applique d'un coup. Cocher un dossier emporte son sous-arbre : ses sous-dossiers apparaissent cochés mais figés, les inclure en propre ferait deux groupes pour les mêmes fichiers.

La liste est une **préférence**, rangée avec les autres dans mon dossier d'installation — rien n'est écrit dans votre dépôt. Mais elle a un second rôle : **je la relis sur le disque avant chaque lecture**, et je n'ouvre que ce qu'elle couvre. C'est ce qui fait qu'un chemin demandé ne suffit jamais. Sans inclusion, cette porte n'ouvre rien.

Retirer un dossier de l'arbre ne touche pas au dossier lui-même.

### Les plans

Les plans ne sont pas dans le projet : ils vivent dans `~/.claude/plans`. Ils sont rattachés à ce projet parce que l'un de ses transcripts porte leur chemin (`planFilePath`). Ils apparaissent donc dans le navigateur mais **pas** dans le compte des ressources ni dans le poids du `.claude`.

Un plan est la **seule chose supprimable** depuis cet écran ; la suppression n'est pas sauvegardée.

## Hooks

La liste, en lecture seule, des hooks déclarés par le projet — lus dans son `settings.json` **et** dans son `settings.local.json`, à plat : l'événement, le matcher s'il y en a un, et la commande. Une action sans commande (un hook `prompt`, `http`…) affiche son type à la place. Ce sont les hooks qui s'ajouteront aux vôtres quand Claude Code travaillera ici.

## Sessions

Le tableau des transcripts, filtrable, triable sur chaque colonne.

**Session** — le titre réel de la session : celui que vous avez tapé, ou celui que Claude Code a généré et tient à jour. Une session jamais nommée retombe sur **son premier message**, et l'infobulle le dit pour que la colonne ne mélange pas silencieusement deux natures de texte. Deux insignes possibles : titre défini manuellement, et présence de sous-agents.

**Tours** — les tours **de l'humain** : ni les échos de résultats d'outil, ni les injections du harness. C'est le même chiffre que celui du module Diagnostic.

**Tokens** — entrée, sortie, lecture et écriture de cache additionnées.

**Coût** — au prix catalogue de l'API, comme partout ailleurs dans AURA. Un `≥` devant le montant signale qu'un modèle de cette session **n'a pas de tarif connu** : le total est alors un plancher, pas une estimation.

**Durée** — l'écart entre le premier et le dernier horodatage du transcript.

Puis la **branche git**, la **taille** du fichier et sa date de **modification**. Sur un écran étroit, branche et taille sont les premières colonnes retirées : ce sont celles qu'on retrouve dans la session ouverte.

Un tiret `—` dans une colonne de relevé n'est pas un zéro : c'est une session dont rien n'a été mesuré (jamais lancée, ou transcript sans réponse). Au tri, ces lignes sont regroupées à une extrémité plutôt que mêlées aux sessions réellement mesurées à zéro.

Cliquer une ligne ouvre le **rejeu** de la session.
