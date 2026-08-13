---
id: projects
title: Projets
icon: folder_open
order: 90
routes: [projects]
---

L'inventaire des projets où Claude Code a déjà travaillé. Chaque ligne correspond à un dossier de `~/.claude/projects`, dont le nom encode le chemin des sources.

## D'où viennent les colonnes

| Colonne               | Source                                                            |
| --------------------- | ----------------------------------------------------------------- |
| **Projet**            | Le dernier segment du chemin réel des sources ; à défaut, le slug |
| **Chemin**            | Le chemin réel du dossier de travail, en séparateurs Windows      |
| **Sessions**          | Le nombre de fichiers `.jsonl` à la racine du dossier             |
| **Taille**            | Le poids total du dossier de transcripts, sous-agents compris     |
| **Dernière activité** | La date de modification du transcript le plus récent              |

Le **chemin réel n'est pas déduit du slug** : le slug remplace chaque caractère non alphanumérique par un tiret, ce qui est irréversible. Je le retrouve en relisant les chemins déclarés dans `~/.claude.json` et en les ré-encodant pour les faire correspondre. Un projet dont ce fichier ne parle pas affiche donc son slug brut à la place d'un chemin — c'est le signe qu'aucune correspondance n'a pu être établie, pas que le projet est cassé.

L'insigne à côté du nom signale que le dossier de sources possède un dossier `.claude` — donc des ressources propres au projet.

Le tri par défaut place **la dernière activité en tête**. Toutes les colonnes se trient, et le filtre porte à la fois sur le nom et sur le chemin.

## Comment lire cette liste

- **La dernière activité** distingue un projet vivant d'un projet abandonné.
- **La taille** dit lequel pèse, avant d'aller voir la **Maintenance**.
- **Le nombre de sessions** est un compte de transcripts, pas de conversations distinctes au sens humain : une session reprise plus tard reste un seul fichier.

Cliquer une ligne — n'importe où — ouvre le détail du projet.

## Projets orphelins

Un projet dont les sources ont été déplacées ou supprimées **garde ses transcripts** : ils restent listés, consultables et rejouables. Seules ses ressources `.claude` deviennent introuvables, puisqu'elles vivaient dans l'arborescence des sources.
