---
id: settings
title: Réglages
icon: tune
order: 60
routes: [settings]
---

L'éditeur de `~/.claude/settings.json`, le fichier qui gouverne le comportement de Claude Code sur cette machine. Quatre onglets : **Général**, **Permissions**, **Interface & MàJ**, et **JSON**.

## Le formulaire et le JSON sont le même fichier

Il n'y a **qu'une seule** source de vérité : le texte du fichier, celui que montre l'onglet JSON. Les onglets de formulaire ne sont que des vues sur ce texte — chaque contrôle affiche à côté de son libellé la **clé exacte** qu'il pilote, pour que la correspondance ne soit jamais à deviner.

Conséquences pratiques :

- **une clé que je ne connais pas reste intacte.** L'écran ne réécrit que la clé touchée ; il n'efface jamais ce qu'il ne sait pas afficher ;
- **l'ordre de vos clés est conservé** — les nouvelles s'ajoutent à la fin ;
- en revanche, la première modification par un contrôle **renormalise la mise en forme** du fichier en indentation à deux espaces. Cela apparaît dans le diff : c'est la seule chose qui change au-delà de votre modification.

Le bouton **Formater** de l'onglet JSON applique la même normalisation, sans rien modifier d'autre.

Tant que le texte n'est pas du JSON valide, un bandeau le signale, les formulaires sont grisés et l'enregistrement est bloqué : il faut corriger dans l'onglet JSON. Le message d'erreur de l'analyseur y est affiché tel quel, position comprise.

## Hérité, oui, non

Beaucoup d'options sont des interrupteurs à **trois positions**, et c'est délibéré : une clé absente n'est pas `false`, elle veut dire « Claude Code décide ».

- **Hérité** — la clé est **supprimée** du fichier. L'infobulle rappelle la valeur par défaut de Claude Code pour cette clé.
- **Oui** / **Non** — la clé est écrite explicitement.

C'est différent de vider un champ texte, qui y écrit une valeur vide : une langue effacée donne `"language": ""`, pas l'absence de clé.

## Onglet Général

| Réglage                  | Clé                      | Remarque                                |
| ------------------------ | ------------------------ | --------------------------------------- |
| Langue                   | `language`               | Langue de réponse préférée              |
| Modèle par défaut        | `model`                  | Vide = sélection automatique            |
| Niveau d'effort          | `effortLevel`            | `low`, `medium`, `high`, `xhigh`        |
| Effort par modèle        | `modelSettings`          | Lecture seule — une table, pas un champ |
| Mode rapide              | `fastMode`               | Trois positions                         |
| Réflexion étendue        | `alwaysThinkingEnabled`  | Trois positions                         |
| Éditeur                  | `editorMode`             | `normal` ou `vim`                       |
| Touches de mot           | `keybindingFlavor`       | `classic` ou `readline`                 |
| Cache de la conversation | `promptCacheTtl`         | `5m` ou `1h`                            |
| Cache des sous-agents    | `subagentPromptCacheTtl` | `5m` ou `1h`                            |

**Effort par modèle** ne s'affiche que si la clé existe, et **en lecture seule** : `modelSettings` est une table dont les clés sont des noms de modèles, pas un champ. Le taire laisserait pourtant croire que le seul effort en vigueur est le global juste au-dessus.

Les deux **caches de prompt** portent la même troisième position que les interrupteurs : `Hérité` supprime la clé, et Claude Code décide alors seul — une heure sur abonnement, cinq minutes sur clé API, cinq minutes pour tout ce qui sort du fil principal. Une écriture de cache d'une heure est facturée plus cher qu'une de cinq minutes ; en échange, le cache reste chaud sur des pauses plus longues.

## Onglet Permissions

Le **mode par défaut** (`permissions.defaultMode`) décide de ce qui déclenche une demande d'autorisation. Six valeurs, décrites dans le sélecteur :

- `default` — demande à la première utilisation d'un outil ;
- `acceptEdits` — accepte les éditions de fichier sans demander ;
- `plan` — lecture seule ;
- `auto` — approbation avec garde-fous ;
- `dontAsk` — refuse tout ce qu'une règle `allow` n'autorise pas ;
- `bypassPermissions` — **saute toutes les demandes**. J'affiche un bandeau rouge tant que ce mode est actif : à réserver aux environnements isolés, conteneur ou VM.

Viennent ensuite quatre listes de motifs, chacune avec son compteur :

- **Autorisées** (`permissions.allow`) — ex. `Bash(npm run *)` ;
- **Refusées** (`permissions.deny`) — ex. `Read(.env)` ;
- **À confirmer** (`permissions.ask`) — ex. `WebFetch(domain:*)` ;
- **Dossiers additionnels** (`permissions.additionalDirectories`) — étend la zone de travail au-delà du dossier courant.

Chez Claude Code, **`deny` l'emporte sur `allow`**. Un doublon exact n'est pas ajouté deux fois : ressaisir une règle déjà présente vide simplement le champ.

## Onglet Interface & mises à jour

`tui` (`fullscreen` / `inline`), `autoUpdatesChannel` (`stable` / `latest`), et `cleanupPeriodDays` — le nombre de jours avant nettoyage des sessions et artefacts par Claude Code.

`desktopSessionCleanupPeriodDays` en est le pendant pour les sessions ouvertes depuis Claude Desktop, que le nettoyage précédent épargne. C'est un **plafond**, et `0` — la valeur par défaut — veut dire qu'il n'y en a pas : ces transcripts sont gardés jusqu'à ce qu'autre chose les supprime.

`spellcheck.enabled` souligne les mots mal orthographiés dans le prompt. Le soulignement demande un `aspell`, `hunspell` ou `ispell` installé sur la machine ; sans lui, la clé n'a aucun effet. Le reste du bloc — le correcteur, le dictionnaire, la couleur — passe par l'onglet JSON. Repasser ce réglage sur `Hérité` retire la clé, **et le bloc `spellcheck` s'il ne reste rien dedans** : un `"spellcheck": {}` résiduel se lirait comme un réglage posé.

Puis une série d'interrupteurs à trois positions, dont l'infobulle « Hérité » rappelle chaque fois **la valeur par défaut de Claude Code** : `autoCompactEnabled`, `autoMemoryEnabled`, `fileCheckpointingEnabled` (les instantanés de `/rewind`), `spinnerTipsEnabled`, `prefersReducedMotion`, `agentPushNotifEnabled`, `skipAutoPermissionPrompt`, `remoteControlAtStartup`, `includeCoAuthoredBy`, `autoContinueAtUsageLimit`, `syncClaudeAiSkills`, `syncClaudeAiPlugins`.

Les deux derniers gouvernent ce que claude.ai dépose dans `~/.claude/skills/synced` et `~/.claude/plugins/synced`. Une particularité à connaître : **seul `Non` agit**. La synchronisation s'active côté serveur pour votre compte, si bien qu'écrire `true` ne l'allume pas plus tôt — `Hérité` et `Oui` disent la même chose au fichier.

La **status line**, enfin, n'apparaît que si elle est configurée, et **en lecture seule** : c'est une structure trop libre pour un champ. Son édition fine passe par l'onglet JSON.

## Enregistrement

Rien ne part au fil de la saisie. La pastille `non enregistré` signale l'écart avec le disque, **Proposer…** ouvre le diff, et l'écriture n'a lieu qu'à la confirmation — avec sauvegarde de la version précédente, et refus si le fichier a changé entre-temps. **Recharger** abandonne les modifications en cours et relit le disque.

Un `settings.json` inexistant n'est pas une erreur : l'écran démarre sur `{}` et le premier enregistrement crée le fichier.

## D'autres écrans écrivent le même fichier

`settings.json` est aussi modifié, sur leurs clés propres, par les modules **Hooks** (`hooks`, `disableAllHooks`), **Plugins** (`enabledPlugins`, `extraKnownMarketplaces`), **MCP** (les trois clés `…McpjsonServers` et `enableAllProjectMcpServers`) et **Sessions actives** (`permissions.allow`, via « Toujours autoriser »). Tous suivent le même contrat, et la garde anti-écrasement empêche deux écrans ouverts de se marcher dessus.
