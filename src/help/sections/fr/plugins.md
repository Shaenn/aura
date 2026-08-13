---
id: plugins
title: Plugins
icon: extension
order: 40
routes: [plugins]
---

Les plugins installés et les marketplaces d'où ils proviennent. Un plugin apporte d'un coup un lot de ressources : skills, agents, hooks, serveurs MCP.

L'écran lit deux sources et n'en écrit qu'une :

- il **lit** `plugins/installed_plugins.json` et `plugins/known_marketplaces.json`, l'inventaire tenu par Claude Code ;
- il **écrit** uniquement `settings.json` — les clés déclaratives `enabledPlugins` et `extraKnownMarketplaces`.

Le dossier `plugins/` lui-même, je ne l'écris **jamais** : il est géré par la CLI, qui y clone des dépôts et y résout des dépendances.

## Marketplaces

Une marketplace est un catalogue de plugins. La liste fusionne deux vues, ce qui explique les trois badges :

- **système** — la marketplace est dans le registre de Claude Code, sans déclaration de votre part. Le badge indique une **origine**, pas une protection : elle se retire comme les autres.
- **ajoutée** — elle est à la fois dans le registre _et_ déclarée dans votre `settings.json` (`extraKnownMarketplaces`). C'est l'état normal d'une marketplace que vous avez ajoutée vous-même.
- **en attente** — elle est déclarée dans `settings.json` mais **absente du registre** : Claude Code ne l'a pas encore matérialisée. Rien n'a été cloné.

Sous le nom figurent le type de source et sa localisation, tels que le registre les enregistre (`github`, un chemin local, une URL de dépôt…).

### Ajouter

Le champ accepte les trois formes que comprend la CLI : `owner/repo`, une URL `https://…/repo.git`, ou un chemin local. Valider **n'écrit rien** : je vous donne la commande exacte à exécuter dans Claude Code —

```
/plugin marketplace add <source>
```

— avec un bouton de copie. C'est Claude Code qui clonera ou copiera la marketplace.

Il n'existe donc pas d'action « installer un plugin » sur cet écran : on ajoute la marketplace, puis on installe **depuis Claude Code**.

### Retirer

Le comportement dépend du badge, et c'est voulu :

- une marketplace **en attente** n'existe que comme déclaration dans `settings.json` : la retirer de là est complet et correct. La suppression est donc immédiate et locale à l'écran, à confirmer par le diff comme toute autre écriture.
- une marketplace **réelle** demande la commande `/plugin marketplace remove <nom>`, parce qu'elle désinstalle aussi les plugins qui en viennent et supprime le clone local. Si elle était en plus déclarée dans votre `settings.json`, un bouton **Retirer aussi de la config** fait la moitié qui vous revient.

## Plugins installés

Chaque ligne porte l'identifiant complet `nom@marketplace`, sa version et sa portée, telles que le registre les déclare.

### Activer, désactiver

Le sélecteur écrit dans `settings.json`. Le détail compte : un plugin est **actif par défaut**, donc

- `Désactivé` écrit `enabledPlugins["nom@marketplace"] = false` ;
- `Actif` **supprime la clé** au lieu d'écrire `true` — et si c'était la dernière, l'objet `enabledPlugins` devenu vide disparaît avec elle.

Le fichier ne consigne que vos écarts au comportement par défaut. Désactiver ne désinstalle rien : les fichiers restent dans `plugins/`, et le réactiver est immédiat.

### Désinstaller

La corbeille ouvre la commande `/plugin uninstall <nom@marketplace>` : la désinstallation retire le plugin **et** nettoie son cache, ce qui relève de Claude Code.

## Enregistrer

Les changements d'activation ne partent pas au fil de l'eau. Ils s'accumulent dans l'écran — la pastille `non enregistré` le signale — et **Proposer…** ouvre le diff de `settings.json` avant écriture. `Recharger` abandonne ce qui n'a pas été appliqué et relit le fichier.

## À savoir

Un plugin peut fournir ses propres **hooks**. Ils ne figurent pas dans votre `settings.json` : le module **Hooks** les affiche à part, en lecture seule, avec l'état actif/désactivé du plugin qui les porte.
