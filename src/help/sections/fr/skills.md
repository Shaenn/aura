---
id: skills
title: Skills
icon: bolt
order: 35
routes: [skills]
---

Vos savoir-faire réutilisables : un **dossier** par skill dans `~/.claude/skills/`, dont le point d'entrée est `SKILL.md`. Un skill est un mode d'emploi que Claude charge quand la situation s'y prête — à la différence d'un agent, il s'exécute **dans la conversation en cours**, avec son contexte.

Comme pour les agents, l'écran est en `lecture seule` : il montre et explique, il ne rédige pas. La seule écriture est la suppression.

## Ce que la page lit sur le disque

Le service liste les **sous-dossiers** de `skills/` et, pour chacun, tente de lire `<dossier>/SKILL.md`. Un dossier sans `SKILL.md` est ignoré en silence — c'est exactement ce que fait Claude Code, et donc ce qui explique un skill « qui n'existe pas » alors que ses fichiers sont bien là.

Le nom affiché vient de la clé `name` du frontmatter, à défaut du nom du dossier. Attention : **`name` ne change pas la commande `/nom`**, qui suit toujours le nom du dossier.

## Le dépliant : les fichiers de référence

Chaque entrée de la liste porte un chevron. Le déplier montre **les autres fichiers du dossier du skill** — ceux que `SKILL.md` peut demander de lire. Je parcours le dossier du skill et **un niveau de sous-dossiers** ; les fichiers imbriqués plus profond ne sont pas listés. Un sous-dossier illisible n'interrompt rien : le point d'entrée reste consultable.

Ces fichiers sont le cœur du _chargement progressif_ : ils ne sont **pas** injectés dans le contexte avec le skill. C'est le corps de `SKILL.md` qui dit lesquels lire, et quand. Les voir ici, c'est voir ce que le skill a sous la main sans que cela coûte un seul token tant qu'il ne s'en sert pas.

Cliquer un fichier de référence l'ouvre dans le panneau de droite :

- un `.md` est rendu comme du Markdown, **en entier** — pas de carte de frontmatter, puisque seul le point d'entrée en porte une ;
- tout autre fichier est affiché comme un bloc de code coloré, la coloration étant déduite de l'extension (`json`, `js`, `ts`, `sh`, `bash`, `yml`, `yaml`, `toml`, `py`).

## Lire la carte de frontmatter

Elle fonctionne comme celle des agents : chaque clé posée est expliquée au survol, chaque clé absente est listée sous le dépliant « N clés non définies » avec la valeur que Claude Code supposera, et toute clé étrangère au vocabulaire des skills porte le drapeau `ignorée`.

Le vocabulaire des skills est en **kebab-case** (`allowed-tools`, `user-invocable`) là où celui des agents est en camelCase. Une clé d'agent glissée dans un `SKILL.md` ne fera rien.

Aucune clé n'est requise dans un skill. Si `description` manque, la carte le signale : **Claude retombe alors sur le premier paragraphe du corps** pour décider de charger le skill — ce qui marche par accident bien plus souvent que par intention.

## Ce qui décide du déclenchement

Trois clés, et elles seules, gouvernent le moment où un skill entre en jeu.

- **`description`** — ce que Claude lit pour décider. Elle doit énoncer _quand_ s'en servir, pas seulement ce que le skill fait. C'est la première cause d'un skill jamais déclenché.
- **`when_to_use`** — du contexte de déclenchement supplémentaire : phrases-clés, exemples de demandes. Elle **s'ajoute** à la description ; les deux partagent un budget de 1 536 caractères.
- **`paths`** — des globs qui restreignent l'activation aux fichiers correspondants. Affichés un par ligne, les jokers mis en évidence.

Deux interrupteurs en modifient la portée :

- **`user-invocable`** à `false` — le skill disparaît du menu `/` ; seul Claude peut le charger ;
- **`disable-model-invocation`** à `true` — Claude ne le déclenche jamais de lui-même ; il faut le demander.

Les deux à la fois rendent le skill **inatteignable**.

## Le vocabulaire complet d'un skill

| Clé                        | Rôle                                                                                  | Sans elle                           |
| -------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| `name`                     | Nom affiché. Ne change pas la commande `/nom`.                                        | Nom du dossier                      |
| `description`              | Ce que fait le skill et quand l'utiliser.                                             | Premier paragraphe du corps         |
| `when_to_use`              | Contexte de déclenchement supplémentaire.                                             | La description seule                |
| `argument-hint`            | Affiché à l'autocomplétion, ex. `[issue-number]`.                                     | Aucun indice                        |
| `arguments`                | Arguments positionnels nommés, substitués par `$nom` dans le corps.                   | Seulement `$ARGUMENTS`, `$0`, `$1`… |
| `allowed-tools`            | Outils utilisables **sans demander de permission** tant que le skill est actif.       | Permissions habituelles             |
| `disallowed-tools`         | Outils retirés du pool pendant le skill. La restriction tombe au message suivant.     | Aucun outil retiré                  |
| `user-invocable`           | `false` : masqué du menu `/`.                                                         | `true`                              |
| `disable-model-invocation` | `true` : jamais déclenché spontanément.                                               | `false`                             |
| `model`                    | Modèle utilisé tant que le skill est actif ; la session reprend le sien ensuite.      | Modèle de la session                |
| `effort`                   | Niveau de raisonnement pendant le skill.                                              | Effort de la session                |
| `context`                  | `fork` : le skill s'exécute dans un sous-agent isolé, son contenu devenant le prompt. | Contexte principal                  |
| `agent`                    | Sous-agent utilisé quand `context: fork`. Sans effet autrement.                       | `general-purpose`                   |
| `paths`                    | Globs restreignant l'activation.                                                      | Actif partout                       |
| `shell`                    | Interpréteur des commandes inline `` !`cmd` `` du corps : `bash` ou `powershell`.     | `bash`                              |
| `hooks`                    | Hooks de cycle de vie actifs uniquement pendant ce skill.                             | Aucun hook                          |

Pour un blocage **durable** d'un outil, `disallowed-tools` ne suffit pas : il ne vaut que le temps du skill. Passez par les permissions de `settings.json`.

## Supprimer

La suppression vise le **dossier entier**, fichiers de référence compris — le dialogue affiche ce chemin, pas celui du `SKILL.md`. Une copie horodatée du dossier complet est prise avant, récupérable dans **Sauvegardes**.
