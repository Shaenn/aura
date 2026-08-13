---
id: agents
title: Agents
icon: smart_toy
order: 30
routes: [agents]
---

Vos sous-agents personnels : un fichier Markdown par agent, dans `~/.claude/agents/`. Un agent est un exécutant spécialisé auquel Claude délègue une tâche — il part avec son propre contexte, ses propres outils, et ne rend que sa conclusion.

L'écran est un **consultateur**, pas un éditeur. Le bandeau `lecture seule` le dit : la seule écriture possible ici est la suppression.

## Ce que la page lit sur le disque

Le service local liste `agents/`, **un seul niveau**, et ne retient que les fichiers `.md`. Un agent rangé dans un sous-dossier n'apparaît donc pas ; un fichier `.txt` non plus. Pour chacun, il lit le frontmatter et en extrait deux valeurs :

- le **nom affiché** — la clé `name` si elle existe, sinon le nom du fichier sans son extension ;
- la **description** — affichée sous le nom, tronquée à deux lignes dans la liste.

Un dossier `agents/` absent donne une liste vide, pas une erreur.

## La pastille de couleur

Chaque agent porte une pastille colorée. Sa teinte n'est pas décorative et ne vient pas du fichier : elle est **calculée à partir du nom**, par hachage, parmi les huit teintes que Claude Code accepte dans la clé `color` — bleu, vert, jaune, violet, rose, orange, cyan, rouge.

Deux conséquences utiles :

- un agent garde sa teinte partout — ici, et dans le rejeu d'une session où il apparaît sous le même nom (`subagent_type`) ;
- un agent qui n'a **pas** de fichier garde quand même sa teinte : `Explore`, `Plan`, `general-purpose` sont intégrés à Claude Code, un agent de plugin vit ailleurs, et un agent supprimé reste inscrit dans les transcripts passés.

Huit teintes ne séparent pas plus de huit agents : les collisions sont arithmétiques. C'est pourquoi le nom est toujours écrit à côté de la pastille — la couleur ne porte jamais l'information seule.

## Le panneau de droite

Sélectionner un agent affiche trois choses :

1. **Le chemin réel** du fichier, en tête, et le bouton de suppression ;
2. **La carte de frontmatter** — l'en-tête décodé, clé par clé ;
3. **Le corps du fichier**, rendu comme du Markdown. Ce corps est le **prompt système** de l'agent : c'est littéralement ce que l'agent lit avant de commencer.

## Lire la carte de frontmatter

La carte fait trois choses qu'une simple coloration syntaxique ne ferait pas.

**Elle explique chaque clé.** Survolez le nom d'une clé : son rôle s'affiche. Les valeurs de type outil deviennent une puce par outil, elle-même explicable au survol — y compris les formes ouvertes que la documentation n'énumère pas : `Bash(git status)` se lit « Bash, restreint aux commandes… », `mcp__serveur__outil` se lit comme l'outil d'un serveur MCP, `Agent(Explore)` comme une délégation restreinte.

**Elle signale ce qui ne sert à rien.** Une clé absente du vocabulaire des agents porte le drapeau `ignorée`. C'est le piège le plus fréquent : le vocabulaire des agents **n'est pas** celui des skills. Les agents écrivent `tools`, `disallowedTools`, `permissionMode`, `maxTurns` — en camelCase. `allowed-tools` ou `disable-model-invocation` sont des clés de skill : dans un agent, elles ne produisent rien.

**Elle montre ce que le fichier tait.** Le dépliant « N clés non définies » liste chaque clé absente avec **la valeur que Claude Code suppose**. C'est là que se lisent les décisions implicites : un agent sans `tools` hérite de tous les outils de son parent ; un agent sans `model` tourne sur le modèle du parent.

Deux clés sont **requises** et signalées en rouge quand elles manquent : `name` et `description`.

## Le vocabulaire complet d'un agent

| Clé               | Rôle                                                                                                                       | Sans elle                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `name`            | Identifiant unique (minuscules + tirets), transmis aux hooks comme `agent_type`. Le nom du fichier n'a pas à correspondre. | **Requise**                     |
| `description`     | _Quand_ déléguer à cet agent.                                                                                              | **Requise**                     |
| `tools`           | Liste blanche d'outils. Accepte les motifs MCP et `Agent(worker, researcher)`.                                             | Hérite des outils du parent     |
| `disallowedTools` | Liste noire, appliquée **avant** `tools`.                                                                                  | Aucun outil refusé              |
| `model`           | `inherit`, `haiku`, `sonnet`, `opus`, `fable`, ou un identifiant complet.                                                  | `inherit` — le modèle du parent |
| `effort`          | `low`, `medium`, `high`, `xhigh`, `max`.                                                                                   | Effort de la session            |
| `permissionMode`  | Gestion des demandes de permission. Un parent en `bypassPermissions` ou `acceptEdits` l'emporte.                           | Mode du parent                  |
| `maxTurns`        | Nombre de cycles avant arrêt forcé.                                                                                        | Illimité                        |
| `isolation`       | `worktree` : l'agent travaille dans une copie git isolée, nettoyée s'il n'a rien changé.                                   | Aucune isolation                |
| `memory`          | Mémoire persistante entre conversations : `user`, `project`, `local`.                                                      | Aucune mémoire persistante      |
| `skills`          | Skills injectés en entier au démarrage.                                                                                    | Aucun skill préchargé           |
| `mcpServers`      | Serveurs MCP de l'agent — référence partagée, ou définition inline ouverte puis fermée avec lui.                           | Aucun serveur supplémentaire    |
| `hooks`           | Hooks actifs seulement pendant cet agent. `Stop` devient `SubagentStop`.                                                   | Aucun hook                      |
| `background`      | `true` : toujours exécuté en arrière-plan.                                                                                 | Claude choisit                  |
| `color`           | Couleur d'affichage dans les tâches et la transcription.                                                                   | Couleur par défaut              |
| `initialPrompt`   | Auto-soumis comme premier tour quand l'agent tient lieu de session principale (`--agent`).                                 | Aucun prompt initial            |

`hooks`, `mcpServers` et `permissionMode` sont **ignorés pour les agents fournis par un plugin**.

Les clés dont le contenu est un bloc YAML imbriqué (`hooks`, un `mcpServers` inline) sont affichées telles quelles, sans interprétation : je ne modélise pas ce que je ne sais pas décrire.

## Pourquoi il n'y a pas d'éditeur

Rédiger un agent est un travail de prompt, pas de formulaire : c'est la `description` qui décide quand la délégation se produit, et le corps qui décide de ce que l'agent sait faire. Demandez à Claude de l'écrire — le skill `create-agents` existe pour cela. Cet écran sert à **vérifier** ce que le fichier déclare vraiment, et ce que Claude Code en déduira.

## Supprimer

Le bouton `Supprimer` demande confirmation et affiche le chemin exact visé — ici, le fichier `.md` seul. Une **copie horodatée est prise avant** la suppression et reste accessible dans le module **Sauvegardes**. La liste se recharge ensuite.
