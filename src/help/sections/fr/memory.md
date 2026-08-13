---
id: memory
title: Mémoire
icon: psychology
order: 45
routes: [memory]
---

Ce que Claude sait de vous et de vos projets d'une conversation à l'autre. **Trois objets différents** cohabitent sur cet écran, et les confondre est la principale source d'erreur.

| Objet              | Fichier                            | Chargé quand                                           | Édition        |
| ------------------ | ---------------------------------- | ------------------------------------------------------ | -------------- |
| Mémoire globale    | `~/.claude/CLAUDE.md`              | Au début de **chaque** session, tous projets confondus | Texte brut     |
| Index d'un projet  | `projects/<slug>/memory/MEMORY.md` | À chaque session **de ce projet**                      | Texte brut     |
| Mémoire structurée | `projects/<slug>/memory/<nom>.md`  | À la demande, quand elle paraît pertinente             | Champs + corps |

## Ce que la page lit

Je parcours `projects/`, et pour chaque projet je cherche un sous-dossier `memory/`. **Un projet sans dossier `memory/`, ou dont le dossier ne contient aucun `.md`, n'apparaît pas dans la liste** — il n'est pas vide, il est absent.

Dans ce dossier, `MEMORY.md` est traité à part : c'est l'index, pas une mémoire. Tous les autres `.md` sont des mémoires structurées, dont je lis dans le frontmatter le `name` (à défaut le nom du fichier), la `description`, et le `type`.

Les noms de projet affichés sont **raccourcis pour être lisibles** : le slug réel encode le chemin complet (`C--Users-…-devl-aura`) et est coupé après un repère de racine connu (`Documents`, `devl`, `repos`…). Le chemin exact reste visible dans l'infobulle du fil, en haut de l'éditeur.

## Les quatre types

Le type est une étiquette de nature, pas une catégorie de rangement. Il est stocké sous `metadata.type`.

- **user** — qui vous êtes : rôle, expertise, préférences durables.
- **feedback** — une consigne sur la façon de travailler, correction comme approche validée. Doit expliquer le **pourquoi**.
- **project** — un travail en cours, un objectif ou une contrainte que ni le code ni l'historique git ne révèlent. Dates en absolu.
- **reference** — un pointeur vers une ressource externe : URL, dashboard, ticket.

Une mémoire ne doit pas redire ce que le dépôt raconte déjà. Les mémoires se lient entre elles par `[[nom-de-la-mémoire]]`.

## L'éditeur

Le fil d'en-tête indique la portée puis le fichier ; l'infobulle donne le chemin réel. La pastille `non enregistré` apparaît dès que le texte diverge du disque, et **changer de sélection avec des modifications en attente demande confirmation** avant de les abandonner.

Une mémoire structurée s'édite en deux étages :

- **les champs** — `name`, `description`, et le `type` en pastilles cliquables. Ils patchent la clé correspondante du frontmatter **en place** : l'ordre des clés, les clés que je ne modélise pas et le corps restent intacts. Une valeur qui l'exige est automatiquement mise entre guillemets pour rester du YAML valide.
- **le corps** — le reste du fichier, en Markdown.

Le `CLAUDE.md` global et un `MEMORY.md` s'éditent d'un bloc, frontmatter compris s'il y en a un : ce ne sont pas des mémoires structurées.

### Éditer / Aperçu

Le sélecteur bascule le contenu entre saisie et rendu. Une mémoire **s'ouvre en aperçu** — on la lit bien plus souvent qu'on ne la modifie ; une mémoire qu'on vient de créer s'ouvre en édition, sur son gabarit.

En aperçu, les **liens relatifs sont interceptés** : cliquer une ligne de l'index ouvre la mémoire visée dans l'éditeur au lieu de faire naviguer le navigateur. C'est ce qui rend `MEMORY.md` utilisable comme sommaire. Un lien dont la cible n'existe pas le dit explicitement. Les URL absolues, elles, gardent leur comportement normal.

## Créer une mémoire

Le `+` en tête d'un projet demande un nom. Il est **mis en kebab-case automatiquement** — accents retirés, minuscules, tout le reste devenant des tirets — et sert de nom de fichier. Un nom déjà pris est refusé.

Le fichier est pré-rempli avec le gabarit attendu : `name`, `description`, `metadata.type` à `project`, et une invite de corps. Rien n'est encore sur le disque : le badge `nouveau` reste jusqu'à ce que vous ayez proposé, puis appliqué l'écriture.

## L'index se tient à jour tout seul

`MEMORY.md` est le sommaire chargé à chaque session : **une ligne par mémoire, jamais son contenu**. Je le tiens à jour sans que vous ayez à l'ouvrir :

- à la **création** d'une mémoire, la ligne `- [Titre](fichier.md) — accroche` est ajoutée, le titre venant du champ `name` et l'accroche de `description` ;
- à la **suppression**, la ligne correspondante est retirée ;
- une ligne déjà présente est **remplacée à sa place**, sans être déplacée en fin de liste, et les lignes voisines ne bougent pas ;
- si l'index n'existait pas, il est créé avec un titre `# Memory Index`.

La reconnaissance se fait sur la **cible du lien** (`](fichier.md)`), pas sur le texte : renommer le libellé à la main ne casse rien. Cette maintenance est au mieux-effort — si elle échoue, l'enregistrement de la mémoire, lui, a bien eu lieu.

## Écriture et suppression

Toute écriture suit le contrat commun : **Proposer…** affiche le diff, **Appliquer** sauvegarde la version précédente puis écrit, et refuse si le fichier a changé sur le disque entre-temps.

`Supprimer` n'est proposé que pour une mémoire structurée — ni le `CLAUDE.md` global, ni un index ne se suppriment ici. La version supprimée est sauvegardée avant, et sa ligne quitte l'index.
