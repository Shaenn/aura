---
id: home
title: Vue d'ensemble
icon: dashboard
order: 20
routes: [home]
---

Le centre de contrôle, mon point d'entrée. Il donne accès à tous les modules et l'état courant de l'environnement Claude Code.

La page est organisée autour d'un **cœur**, encadré de deux arcs de modules.

## Le cœur

Deux points d'entrée d'égale importance, traités à l'identique parce qu'ils forment une paire :

- **Projets** — consulter : vos projets Claude Code, leurs ressources `.claude`, et le rejeu de leurs sessions ;
- **Atelier** — agir : lancer une session et travailler avec l'agent, sans terminal.

Ce sont des **actions**, pas des ressources : c'est pourquoi elles ne sont pas répétées sur les arcs.

## L'encart des sessions

Il liste les sessions Claude Code **en cours** sur cette machine, avec leur statut, les trois premières affichées. Le point pulse dès qu'il s'y passe quelque chose. Cliquer une ligne ouvre son suivi live ; le pied de l'encart mène à l'écran complet, en indiquant combien de sessions ne sont pas affichées.

Ces sessions viennent du même relevé que la barre d'état — un seul minuteur interroge le service pour toutes les surfaces qui l'affichent, plutôt qu'un par écran.

## Les arcs

À gauche les **Ressources** — ce que Claude réutilise d'un projet à l'autre :

| Module  | Ce qu'il gère                                   |
| ------- | ----------------------------------------------- |
| Agents  | Vos sous-agents et leurs prompts                |
| Skills  | Les savoir-faire chargés à la demande           |
| Plugins | Les plugins installés et leurs marketplaces     |
| Mémoire | Instructions permanentes et mémoires par projet |
| Hooks   | Les actions automatiques aux moments-clés       |
| MCP     | Les serveurs d'outils extérieurs                |

À droite le **Système** — la plomberie :

| Module        | Ce qu'il gère                                            |
| ------------- | -------------------------------------------------------- |
| Réglages      | `settings.json` : permissions, langue, effort, interface |
| Sauvegardes   | Restaurer une version antérieure de tout fichier         |
| Usage & coûts | Tokens consommés, coût estimé, poids des sous-agents     |
| Diagnostic    | Où part l'argent, et quoi faire                          |
| Maintenance   | Stockage, purge des caches, plans orphelins              |
| Manuel        | Ce que vous lisez                                        |

## Les indicateurs des tuiles

Chaque module porte un indicateur en coin d'icône :

- un **compteur** — le nombre de ressources trouvées sur le disque (agents, skills, plugins) ou de pages du manuel. Un compteur à zéro n'est pas une erreur : le dossier existe et il est vide ;
- un **point** — la présence du fichier que le module gère (`settings.json` pour Réglages et Hooks, `CLAUDE.md` pour Mémoire). Il dit qu'un fichier existe, **pas** qu'il s'y passe quelque chose : seuls les indicateurs de session, eux, désignent une activité réelle.

Sur un écran étroit, les arcs se redressent en colonnes : la courbe n'est qu'une mise en scène de la profondeur, jamais une information.

## La barre d'état

Présente sur tous les écrans. À gauche, la marque et le fil d'Ariane. À droite :

- **l'état du service local** — connecté / hors ligne. La pastille est sondée à chaque navigation ;
- **le nombre de sessions en cours**, quand il y en a. Muet sinon : un compteur à zéro affiché en permanence n'apprend rien. Son infobulle sépare ce qui est **occupé** de ce qui **attend une action** ;
- **la version de Claude Code** installée, et le **dossier géré** ;
- **l'aide** (`?`), qui ouvre la page de manuel de l'écran courant — le libellé nomme cette page plutôt que de dire « aide » ;
- **le thème**, clair ou sombre.
