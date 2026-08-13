---
id: hooks
title: Hooks
icon: webhook
order: 50
routes: [hooks]
---

Des actions que Claude Code déclenche automatiquement à un moment précis du cycle de vie d'une session. Un hook de type `command` est du shell : il tourne **sur votre machine, avec vos droits**, et reçoit l'événement en JSON sur son entrée standard.

L'écran édite la clé `hooks` de `settings.json`, et affiche à part — en lecture seule — les hooks que vos plugins apportent.

## L'anatomie d'un hook

Trois niveaux emboîtés, qu'il faut distinguer pour lire l'écran :

1. **L'événement** — quand cela se déclenche. Une section par événement.
2. **Le groupe** — un _matcher_ et les actions qui vont avec. Un événement peut en porter plusieurs.
3. **L'action** — ce qui est exécuté. Un groupe peut en enchaîner plusieurs.

Le **matcher** filtre. Laissé vide, un hook d'outil se déclenche sur **tous** les outils. `Edit|Write` le restreint aux seules écritures de fichier.

## Les types d'action

| Type       | Ce qu'il exécute                                          | Champ éditable ici |
| ---------- | --------------------------------------------------------- | ------------------ |
| `command`  | Une commande shell, qui reçoit l'événement JSON sur stdin | La commande        |
| `prompt`   | Une évaluation par un modèle                              | Le prompt          |
| `agent`    | Un sous-agent                                             | Le prompt          |
| `http`     | Une requête sortante                                      | L'URL              |
| `mcp_tool` | Un outil d'un serveur MCP                                 | —                  |

Chaque action porte aussi un **timeout** optionnel, en secondes.

Un type dont je n'expose pas le champ principal (`mcp_tool`) l'annonce et renvoie vers l'onglet **JSON** des Réglages. Plus largement : **les champs avancés que le formulaire n'affiche pas — `env`, `args`, `if`… — sont préservés tels quels** à l'enregistrement. Éditer un hook ici ne l'ampute jamais de ce que l'écran ne sait pas montrer.

## Le catalogue d'événements

Trente événements sont proposés. Le sélecteur d'ajout, en bas de page, affiche la description de celui qui est sélectionné ; chaque titre de section a la même infobulle.

**Cycle de vie de la session** — `SessionStart`, `SessionEnd`, `Setup` (lancement en mode init/maintenance).

**Autour de vos messages** — `UserPromptSubmit` (avant traitement de votre prompt), `UserPromptExpansion` (quand une commande tapée se déploie en prompt).

**Autour des outils** — `PreToolUse`, `PostToolUse` (après un **succès**), `PostToolUseFailure` (après un échec), `PostToolBatch` (après la résolution d'un lot d'appels parallèles, avant l'appel modèle suivant).

**Permissions** — `PermissionRequest` (affichage d'un dialogue), `PermissionDenied` (refus par le classifieur du mode auto).

**Sous-agents et tâches** — `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`.

**Fin de tour** — `Stop` (Claude a fini de répondre), `StopFailure` (le tour s'est terminé sur une erreur API).

**Contexte** — `PreCompact`, `PostCompact`, `InstructionsLoaded` (chargement d'un `CLAUDE.md` ou d'un `.claude/rules/*.md`).

**Environnement** — `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`.

**MCP** — `Elicitation` (un serveur demande une saisie pendant un appel d'outil), `ElicitationResult` (après votre réponse, avant renvoi au serveur).

**Affichage** — `Notification`, `MessageDisplay`.

## Hooks de plugins

Un plugin peut fournir ses propres hooks. Ils vivent dans le `hooks/hooks.json` du plugin, **pas dans votre `settings.json`** — sans cette section, l'écran paraîtrait vide alors que des hooks tournent bel et bien.

Je les affiche donc à part : le nom du plugin, son état (`actif` / `désactivé` selon `enabledPlugins`), les événements qu'il couvre, et la liste dédoublonnée des commandes qu'il exécute. Ils ne sont **pas modifiables ici** : c'est au plugin de les gérer.

## Tout désactiver

L'interrupteur en tête coupe l'exécution de l'ensemble des hooks sans détruire leur configuration. C'est le premier réflexe quand une session se comporte de travers. Les hooks _managés_ échappent à cette coupure.

Deux détails d'implémentation qui se voient dans le diff :

- la clé sous-jacente, `disableAllHooks`, est **inversée** par rapport aux libellés `Actifs` / `Désactivés` de l'écran — l'interrupteur vous évite cette traduction mentale ;
- l'état « actifs » est écrit par **l'absence de la clé**, pas par `false`. Le fichier ne consigne que les écarts.

## Ajouter, retirer

`Ajouter un hook sur <événement>` crée un groupe vide avec une action `command`. `Groupe` et `Action` en ajoutent au sein d'une section existante.

Retirer le dernier groupe d'un événement **supprime aussi la clé de l'événement**, et si c'était le dernier événement, la clé `hooks` disparaît entièrement. Aucun objet vide n'est laissé derrière.

## Enregistrer

Rien n'est écrit au fil de la saisie. La pastille `non enregistré` signale l'écart, **Proposer…** affiche le diff de `settings.json`, et l'écriture n'a lieu qu'à la confirmation. Le bouton reste inactif tant que le JSON sous-jacent n'est pas valide.
