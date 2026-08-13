---
id: mcp
title: MCP
icon: cable
order: 55
routes: [mcp]
---

L'inventaire des serveurs MCP — les connecteurs qui donnent à Claude des outils extérieurs : Figma, Gmail, une base de données, un service interne.

Trois sources différentes alimentent cet écran, et chacune a son régime d'écriture. C'est la clé de lecture de la page.

## 1. Connectés · claude.ai

Lus dans `~/.claude/mcp-needs-auth-cache.json`, le cache que Claude Code tient pour les serveurs authentifiés via votre compte. Je montre leur nom et leur identifiant, **rien de plus** : leur connexion se gère dans claude.ai et dans Claude Code, jamais ici. Cache absent ou illisible ⇒ liste vide, sans erreur.

## 2. Configurés · fichier

Lus dans `~/.claude.json`, et il y en a **deux origines dans ce même fichier** :

- portée **global** — le bloc `mcpServers` racine. Ce sont les seuls que je modifie.
- portée **projet · `<nom>`** — le bloc `mcpServers` d'une entrée de `projects`, c'est-à-dire les serveurs qu'un dossier de travail déclare. **Lecture seule.**

Chaque ligne indique le **transport** — la clé `type` si elle est posée, sinon déduit : une `command` donne `stdio`, une `url` donne `http` — et le détail utile : la commande complète avec ses arguments, ou l'URL.

### Ajouter, éditer, supprimer un serveur global

Le formulaire demande un nom, un transport, puis la commande et ses arguments (un par ligne) ou l'URL. En édition, le nom est verrouillé — renommer, c'est supprimer puis recréer.

Deux garanties valent d'être connues :

- **Les clés que le formulaire n'affiche pas sont conservées.** Un serveur qui porte un bloc `env`, par exemple, le garde intact après édition : le formulaire repart de la configuration existante et n'écrase que ce qu'il gère.
- **Changer de transport nettoie l'autre.** Passer en `stdio` retire `url` ; passer en `http` retire `command` et `args`. Aucun résidu contradictoire ne subsiste.

## Écrire dans `~/.claude.json`

Ce fichier vit **hors** du dossier `~/.claude` et contient bien plus que vos serveurs MCP. Je m'y prends donc avec des précautions particulières, différentes du reste de l'application :

1. **Le diff est réduit au bloc concerné.** La prévisualisation compare l'ancien et le nouveau `mcpServers`, pas les milliers de lignes du fichier — sinon le changement serait invisible.
2. **Seule la clé `mcpServers` est réécrite.** Toutes les autres clés sont recopiées telles quelles.
3. **La concurrence est gardée par une empreinte du fichier entier.** Si `~/.claude.json` a changé — même ailleurs que dans `mcpServers` — entre la prévisualisation et la confirmation, l'écriture est **refusée**. Rechargez et recommencez.
4. **Le fichier complet est sauvegardé** avant réécriture, dans mon arborescence de sauvegardes.

## 3. Réglages MCP

Ces trois clés-là vivent dans `settings.json` et se modifient dans la dernière section, avec le contrat d'écriture habituel (diff, sauvegarde, refus si le fichier a bougé).

- **`enableAllProjectMcpServers`** — `Auto-approuvés` / `À confirmer`. « À confirmer » étant le comportement par défaut, il est écrit par **l'absence de la clé** ; seul « auto-approuvés » pose `true`.
- **`enabledMcpjsonServers`** — la liste de ceux qu'on approuve nommément.
- **`disabledMcpjsonServers`** — la liste de ceux qu'on refuse.

Ces trois clés portent sur les serveurs déclarés par un **`.mcp.json` de dépôt**, que Claude Code propose d'approuver à l'ouverture du projet.

## Diagnostic

- Un serveur absent de tout l'écran n'est **pas configuré**.
- Un serveur présent mais dont aucun outil n'apparaît dans une session **n'a pas fini de s'authentifier** : la session vous le dira au premier appel.
- Un serveur de projet qu'on voudrait modifier ne se modifie pas ici : il appartient à la déclaration de son dossier de travail.
