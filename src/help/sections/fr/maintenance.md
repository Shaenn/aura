---
id: maintenance
title: Maintenance
icon: storage
order: 85
routes: [maintenance]
---

Ce que `~/.claude` occupe sur le disque, ce qu'on peut y reprendre, et les plans que plus aucun projet ne réclame.

## Le stockage

Une barre par zone, avec son poids réel — la taille est recalculée par parcours récursif à chaque chargement, ce qui explique le court délai sur un dossier volumineux.

| Zone                           | Contenu                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| Transcripts de conversations   | `projects/` — l'enregistrement complet de toutes vos sessions |
| Historique des fichiers édités | `file-history/`                                               |
| Télémétrie en attente          | `telemetry/`                                                  |
| Cache des collages             | `paste-cache/`                                                |
| Snapshots de shell             | `shell-snapshots/`                                            |
| Plans générés                  | `plans/`                                                      |
| Sauvegardes AURA               | `.local/backups` — hors de `~/.claude`                        |

**La longueur d'une barre est relative à la zone la plus lourde**, pas au total : elle sert à repérer d'un coup d'œil ce qui pèse, pas à lire une part de gâteau. Le chiffre en tête de section, lui, est bien la somme des zones listées.

Les caches et l'historique grossissent indéfiniment ; ce sont eux qui expliquent presque toujours un dossier devenu volumineux.

## Purger

Chaque zone se purge indépendamment, et la purge **supprime le dossier entier**. La plupart ne contiennent que du reconstructible ou du déjà-consommé — historique, télémétrie, cache de collage, snapshots de shell.

**`projects/` fait exception.** Il est purgeable comme les autres, mais il contient les transcripts de toutes vos conversations : c'est la **seule copie qui existe**. Tous les rejeux disparaissent avec lui, ainsi que la matière du **Diagnostic** et de l'**Usage**, qui n'ont pas d'autre source. Je demande une confirmation renforcée, distincte des autres, et **mes sauvegardes ne couvrent pas cette purge** : il n'y a pas de retour en arrière.

Purger `plans/` supprime tous les plans, y compris ceux rattachés à un projet. Purger les **sauvegardes AURA** revient à vider le module **Sauvegardes**.

Le service refuse toute zone qui ne figure pas dans cette liste : la purge est une liste blanche, pas un chemin libre.

## Avant de purger

Une session Claude Code en cours peut être en train de lire un cache. Purger ne la corrompt pas, mais peut la faire échouer sur une lecture. L'écran **Sessions actives** dit ce qui tourne à cet instant.

## Plans sans projet

Un plan est rattaché au projet qui l'a produit **par un seul chemin** : la session en mode plan inscrit dans son transcript le champ `planFilePath`, et je m'en sers pour relier chaque fichier de `plans/` à son projet. Les plans ainsi rattachés se consultent depuis la page de leur projet.

Restent ceux que ce balayage n'a pas réclamés — plans antérieurs à ce champ, ou dont le transcript a été purgé. **Cette section est le seul endroit d'où on peut les lire et les supprimer** ; sans elle, ils seraient inatteignables.

La liste montre le titre — la première ligne non vide du fichier, `#` retiré —, la date et le poids. Sélectionner un plan l'affiche en entier, rendu comme du Markdown. La suppression, confirmée, retire le fichier et n'est pas sauvegardée : `plans/` n'est pas une zone couverte.

## Processus Claude

Les autres écrans lisent `~/.claude/sessions` : ils montrent les sessions qui **se déclarent**. Cette section-ci interroge le système, et montre ce qui **s'exécute** — ce n'est pas la même liste.

L'écart n'a rien de théorique. Un daemon, un hôte de pseudo-terminal et le pont de l'extension Chrome n'écrivent aucun fichier de session : sur neuf processus Claude relevés un soir, quatre n'apparaissaient nulle part. Ce sont ceux qui survivent à ce qui les a lancés, donc exactement ceux qu'on cherche quand quelque chose tourne sans qu'on sache pourquoi.

| Rôle             | Ce que c'est                                                           |
| ---------------- | ---------------------------------------------------------------------- |
| AURA             | Moi. Je ne me termine pas d'ici — voir l'extinction.                   |
| Atelier          | Une session que j'ai lancée : je suis son processus parent.            |
| Terminal         | Une session ouverte à la main, dans un shell.                          |
| Job              | Un travail lancé en arrière-plan depuis une session.                   |
| Hôte de terminal | Le porteur d'un job. C'est lui qui le relance si on coupe le job seul. |
| Daemon           | L'hébergeur des jobs. Il **survit** à la session qui l'a lancé.        |
| Pont Chrome      | La liaison avec l'extension. Chrome le relance de lui-même au besoin.  |

**Orphelin** signale que ce qui a lancé ce processus n'existe plus. Pour un daemon, la marque se lit sur le lanceur qu'il inscrit dans sa propre ligne de commande, et non sur son parent : un daemon est rattaché ailleurs dès que sa session disparaît.

## Terminer un processus

La croix coupe le processus **et toute sa descendance**, toujours, et de haut en bas. Ce n'est pas un excès de zèle : couper un job sans son hôte de pseudo-terminal le voit renaître dans la seconde, avec la même session sous un nouveau numéro. La confirmation annonce combien de processus tomberont.

Un processus terminé de force ne nettoie pas son fichier de `~/.claude/sessions`. Les autres écrans n'en sont pas trompés — ils vérifient que le numéro vit encore — mais le fichier reste sur le disque jusqu'à ce que Claude Code le réécrive.

Deux refus, tous deux volontaires : je ne me termine pas moi-même, et je ne touche qu'à des processus Claude que je viens de voir tourner. Un numéro relu d'un écran périmé ne désigne plus rien.

## Recharger

Le bouton en tête recalcule les tailles, relit la liste des plans — qui exige de parcourir les transcripts — **et** réinterroge les processus. La liste des processus n'est pas rafraîchie toute seule : elle date de son dernier chargement.
