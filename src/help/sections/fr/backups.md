---
id: backups
title: Sauvegardes
icon: restore
order: 65
routes: [backups]
---

L'historique des versions que j'ai remplacées. Chaque écriture et chaque suppression y dépose d'abord la version précédente — dans le dossier `.local/backups` **de l'application**, et non dans `~/.claude`, qui reste exactement tel que Claude Code l'attend.

L'en-tête donne le total : nombre de versions conservées et poids sur le disque.

## Comment une sauvegarde est créée

Avant toute écriture dans une zone modifiable, le service copie le fichier existant vers `.local/backups/<horodatage>/<chemin d'origine>`. La copie **reproduit l'arborescence** du dossier géré, ce qui rend chaque version identifiable sans métadonnée annexe.

Un fichier créé de zéro ne produit **aucune** sauvegarde : il n'y avait rien à préserver.

Une suppression, elle, copie **récursivement** — supprimer un skill archive tout son dossier, fichiers de référence compris, sous un seul horodatage.

## Lire la liste

Les versions sont groupées par fichier d'origine, à gauche, avec le nombre de versions conservées. À droite, les versions du fichier sélectionné, **la plus récente en tête**, avec leur date et leur poids.

Un fichier absent de cette liste, je ne l'ai jamais remplacé. Et seules les écritures faites **depuis AURA** sont couvertes : une modification à la main dans un éditeur, ou par Claude Code lui-même, ne laisse aucune trace ici.

## Restaurer

Restaurer ne réécrit rien en douce. Le contenu de la version choisie est relu, puis **soumis comme une proposition ordinaire**, avec son diff face au fichier actuel. Vous voyez donc précisément ce que le retour en arrière va changer avant qu'il n'arrive — y compris « aucune modification », si le fichier est déjà dans cet état.

Et comme toute écriture, la restauration **sauvegarde à son tour** le contenu qu'elle remplace. Se tromper de version n'est jamais définitif : la version d'avant la restauration devient la sauvegarde la plus récente.

Une restauration reste soumise aux mêmes règles que n'importe quelle écriture. Elle **échoue** donc pour un fichier situé hors des zones modifiables : c'est le cas de la sauvegarde de `~/.claude.json` prise par le module **MCP**, qui apparaît bien dans la liste mais ne peut pas être réappliquée depuis cet écran — ce fichier vit en dehors du dossier géré.

## Purger

Deux niveaux, tous deux **sans retour** :

- la corbeille d'une version supprime **l'instantané entier** qui la contient. Pour l'archive d'un dossier supprimé, c'est donc l'ensemble des fichiers de cet instantané qui part, pas seulement la ligne cliquée ;
- **Tout purger** vide l'intégralité de `.local/backups`, après confirmation.

Dans les deux cas la purge ne touche **que les sauvegardes** : les fichiers de `~/.claude`, eux, ne bougent pas.

## Ce que les sauvegardes ne couvrent pas

- les zones que je ne m'autorise pas à écrire (`plugins/`, les caches, les secrets) ;
- les transcripts de `projects/` purgés depuis le module **Maintenance** — cette purge-là est définitive ;
- tout ce qui a été modifié en dehors d'AURA.
