---
id: concepts
title: Concepts
icon: hub
order: 10
routes: []
---

AURA est un poste de pilotage pour `~/.claude`, la configuration locale de Claude Code. Chaque module lit un fichier réel de ce dossier ; **rien n'est stocké ailleurs**, et rien n'est envoyé nulle part — le service qui accède au disque tourne sur cette machine, sans compte, sans clé, sans appel sortant.

Ce qui suit vaut pour tous les écrans. Le reste du manuel n'y revient pas.

## Le dossier géré

Le chemin surveillé est affiché en permanence dans la barre d'état, en haut à droite. Il vaut `~/.claude` par défaut, et suit la variable d'environnement `AURA_CLAUDE_DIR` si elle est définie — pratique pour travailler sur une copie.

Le point à gauche de la version indique l'état du service local. Éteint, je ne peux plus rien lire : aucun écran ne sera à jour. La version affichée est celle de Claude Code, relue dans le fichier que la CLI écrit après chaque mise à jour.

## Toute écriture est prévisualisée

Les modules qui modifient un fichier ne l'écrivent jamais directement. Ils travaillent en deux temps :

1. **Proposition** — je calcule le contenu résultant et j'affiche le **diff ligne à ligne**, avec le nombre de lignes ajoutées et retirées. Rien n'est écrit sur le disque, et le bouton d'application reste inactif s'il n'y a aucune modification.
2. **Confirmation** — à la validation, la version précédente est sauvegardée, puis le fichier est remplacé.

Entre les deux, je retiens le contenu que je vous ai montré. **Si le fichier a changé sur le disque entre-temps, la confirmation est refusée** plutôt que d'écraser la modification concurrente : un message vous demande de recharger. C'est ce qui rend sûr d'avoir deux écrans d'AURA ouverts sur `settings.json`, ou de travailler pendant qu'une session Claude Code tourne.

## Toute écriture est sauvegardée

Avant chaque remplacement — **y compris une suppression** — la version précédente est copiée, horodatée, dans un dossier de sauvegardes qui m'est propre (`.local/backups`, à côté de l'application, jamais dans `~/.claude`).

Le module **Sauvegardes** liste ces versions et permet de revenir en arrière. Une restauration est elle-même une écriture : elle est donc prévisualisée, et sauvegarde à son tour la version qu'elle remplace.

Un fichier créé de zéro ne produit pas de sauvegarde : il n'y avait rien à préserver.

## Ce que je peux écrire

Volontairement peu de choses. Dans `~/.claude` :

- `settings.json` et `CLAUDE.md` ;
- les dossiers `agents/`, `skills/` et `projects/`.

Tout le reste est en **lecture seule** — `plugins/` en particulier, dont l'installation coordonne plusieurs fichiers et appartient à Claude Code. Là où une action sort de ce périmètre, je vous donne la **commande CLI exacte** à exécuter plutôt que de bricoler les fichiers.

Hors de ce dossier, deux exceptions, chacune documentée sur son écran :

- le bloc `mcpServers` de `~/.claude.json`, que le module **MCP** modifie **sans toucher au reste du fichier** ;
- votre dossier de travail, où l'agent de l'**Atelier** écrit — mais c'est l'agent qui écrit, sous votre autorisation, appel d'outil par appel d'outil.

Les ressources `.claude` d'un projet, elles, je ne les écris **jamais** : la page Projet les affiche en lecture seule.

## Ce que je refuse de lire

Le secret d'authentification (`.credentials.json`) n'est jamais lu, exposé, sauvegardé ni modifié. Sont également exclus de la navigation générale les caches et les zones volatiles : historique de fichiers, télémétrie, cache de collage, instantanés de shell, statistiques, tâches, jobs, démon, et l'état interne des sessions.

Certaines de ces zones restent visibles **par des modules dédiés**, avec une lecture étroite et pour un usage précis : **Maintenance** en mesure la taille pour permettre de les purger, **Sessions actives** lit l'état des sessions en cours. Aucun de ces chemins n'est jamais ouvert par l'explorateur générique, ni écrit.

Enfin, tout chemin fourni par l'interface est normalisé et vérifié : il ne peut pas sortir du dossier géré, quel que soit le nombre de `..`.

## Les deux natures d'écran

Il est utile de savoir, en arrivant sur un module, dans quelle catégorie il tombe :

- **Ceux qui montrent** — Agents, Skills, une page Projet, un rejeu, le Diagnostic, l'Usage. Ils expliquent ce qu'un fichier déclare et ce que Claude Code en déduira. Leur seule écriture éventuelle est une suppression.
- **Ceux qui modifient** — Réglages, Hooks, MCP, Plugins, Mémoire. Ils suivent tous le contrat ci-dessus : une pastille `non enregistré` signale l'écart avec le disque, **Proposer…** ouvre le diff, **Recharger** abandonne.

Rien ne part au fil de la saisie, nulle part.

## Les chiffres et leur statut

Partout où je montre des tokens ou des dollars, deux conventions tiennent :

- **les dollars sont des tarifs API en liste.** Un abonnement Pro ou Max facture au forfait : le montant dit ce que cet usage _aurait coûté à l'API_. Un modèle sans tarif connu voit ses tokens comptés et son coût exclu, et l'écran le nomme ;
- **un `~` signale une estimation.** Les totaux de tokens lus dans un transcript sont mesurés ; la répartition par catégorie de la fenêtre de contexte est estimée (≈ 4 caractères par token). Les deux ne sont jamais réconciliés artificiellement.

## L'aide, en deux endroits

Le bouton `?` de la barre d'état ouvre **la page de manuel de l'écran courant**, dans un tiroir posé au-dessus, sans recomposer la page. Naviguer avec le tiroir ouvert change la page de manuel sous lui.

Le **Manuel complet** rassemble toutes ces pages, avec un sommaire et une recherche plein texte insensible aux accents. Chaque page a une adresse directe (`/aide?s=<id>`), celle que le tiroir ouvre.
