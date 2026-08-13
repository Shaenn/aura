---
layout: home

hero:
  name: AURA
  text: Assistant Unifié des Ressources Agentiques
  tagline: Le poste de pilotage de votre environnement Claude Code. Local, sans compte, sans appel sortant.
  image:
    src: /media/favicon.svg
    alt: ''
  actions:
    - theme: brand
      text: Lire le manuel
      link: /guide/concepts
    - theme: alt
      text: Installer
      link: '#installation'
    - theme: alt
      text: GitHub
      link: https://github.com/Shaenn/aura

features:
  - title: La fenêtre de contexte, reconstruite
    details: Ce qui l'a remplie, dans quel ordre, et ce qu'une compaction a jeté. On voit enfin où passent les jetons.
  - title: Les pistes de sous-agents
    details: Chaque sous-agent a son onglet, et l'URL le porte — c'est une adresse, celle qu'on partage pour montrer ce qu'un agent a fait.
  - title: Un diagnostic calibré sur votre parc
    details: Un seuil vaut le P90 de vos sessions, jamais une valeur de catalogue. Les actions sont classées par impact cumulé.
  - title: Toute écriture est prévisualisée
    details: Le serveur renvoie un diff, vous confirmez, la version précédente part en sauvegarde. Une écriture concurrente est refusée, jamais écrasée.
  - title: 100 % local
    details: Un serveur sur votre poste, votre dossier ~/.claude, rien d'autre. Pas de télémétrie, pas de clé d'API, pas de stockage navigateur.
  - title: Son propre manuel
    details: Dix-huit pages qui disent pourquoi chaque écran est fait ainsi. Elles sont lisibles ici, sans rien installer.
---

Claude Code écrit beaucoup de choses dans `~/.claude`, et n'en montre presque rien.

Vos agents, vos skills, vos hooks, vos serveurs MCP, vos permissions vivent dans une poignée
de fichiers JSON et Markdown qu'on édite à l'aveugle. Vos sessions, elles, laissent derrière
elles des transcripts `.jsonl` de plusieurs mégaoctets — le récit complet de ce que le modèle
a lu, pensé, tenté et dépensé — que personne ne lit jamais.

**AURA ouvre ce dossier.** C'est une application web locale qui inventorie vos ressources,
observe vos sessions en direct, rejoue les anciennes ligne à ligne, chiffre ce qu'elles ont
coûté, et vous dit lesquelles méritaient une action. Elle tourne sur votre poste, ne parle à
aucun service extérieur, et ne modifie jamais un fichier sans vous avoir montré le diff.

<figure>
  <img class="shot" src="/media/replay.png" alt="Rejeu d'une session : les pistes de sous-agents, et la fenêtre de contexte reconstruite tour par tour">
  <figcaption>Le rejeu d'une session : les pistes de sous-agents, et la fenêtre de contexte reconstruite tour par tour.</figcaption>
</figure>

<figure>
  <img class="shot" src="/media/diagnostic.png" alt="Diagnostic : les actions classées par impact cumulé">
  <figcaption>Le diagnostic : les actions classées par impact cumulé, pas par gravité.</figcaption>
</figure>

<p style="text-align:center"><sub>Les captures utilisent un jeu de données de démonstration anonymisé.</sub></p>

## Ce n'est pas un compteur de jetons de plus

Il existe une bonne demi-douzaine de tableaux de bord qui lisent vos transcripts et vous
disent ce que Claude Code vous coûte. Ils font ça bien. AURA les recoupe sur ce terrain, mais
ce n'est pas là qu'elle se joue.

|                                             | Compteurs d'usage | Gestionnaires de config | **AURA** |
| ------------------------------------------- | :---------------: | :---------------------: | :------: |
| Jetons, coûts, graphes                      |        oui        |            —            |   oui    |
| Éditer agents, skills, hooks, MCP, réglages |         —         |           oui           |   oui    |
| Rejeu intégral d'une session                |      parfois      |            —            |   oui    |
| **Fenêtre de contexte reconstruite**        |         —         |            —            | **oui**  |
| **Pistes de sous-agents séparées**          |         —         |            —            | **oui**  |
| **Diagnostic calibré sur votre parc**       |         —         |            —            | **oui**  |
| **Diff + sauvegarde avant toute écriture**  |         —         |         parfois         | **oui**  |
| Mener une session depuis l'interface        |         —         |            —            |   oui    |

Les deux colonnes de gauche décrivent des familles d'outils, pas des projets nommés : la
comparaison reste vraie quand l'un d'eux ajoute une fonctionnalité.

## Le modèle de sûreté

AURA modifie des fichiers qui gouvernent le comportement d'un agent autonome sur votre
machine. Le contrat est donc explicite, et il tient en quatre garanties.

**1. Toute écriture est prévisualisée.** Le serveur calcule le contenu résultant et renvoie un
diff ligne à ligne. Rien n'est écrit tant que vous n'avez pas confirmé.

**2. Toute écriture est réversible.** La version précédente part, horodatée, dans
`.local/backups` — à côté de l'application, jamais dans `~/.claude`. Y compris pour une
suppression.

**3. Une écriture concurrente n'est jamais écrasée.** Si le fichier a bougé sur le disque
entre la proposition et la confirmation, la confirmation est **refusée**.

**4. Le périmètre d'écriture est une liste blanche, volontairement courte.** Dans `~/.claude` :
`settings.json`, `CLAUDE.md`, et les dossiers `agents/`, `skills/`, `projects/`. Tout le reste
est en lecture seule. En regard, une liste noire de lecture : **`.credentials.json` n'est
jamais lu**, ni exposé, ni sauvegardé.

Le détail est dans [Concepts](/guide/concepts) — cinq minutes, et vous saurez exactement ce
qu'AURA s'autorise à écrire, à lire, et à refuser.

## Installation

Il faut **Node.js 24**, **pnpm ≥ 10**, et un dossier `~/.claude` existant — donc Claude Code
installé et lancé au moins une fois. Développé et testé sous **Windows**, exclusivement.

```bash
git clone https://github.com/Shaenn/aura.git aura
cd aura
pnpm install
pnpm dev:all
```

L'application s'ouvre sur `http://127.0.0.1:9100`. Pour l'arrêter : `Ctrl+C`, ou `pnpm stop`
depuis une autre fenêtre — une session de l'Atelier fait tourner un processus `claude`, et
c'est le seul geste qui, sous Windows, déclenche un arrêt ordonné.

::: warning Gardez vos transcripts, sinon AURA n'a rien à montrer
Claude Code purge tout seul les sessions qui n'ont pas bougé depuis 30 jours. Avant tout le
reste, allongez cette rétention dans `~/.claude/settings.json` :

```json
{ "cleanupPeriodDays": 3650 }
```

:::

## Écrit à 100 % par Claude Code

Aucune ligne de ce dépôt n'a été tapée à la main. Tout — le serveur, la SPA, les tests, le
manuel — a été écrit par Claude Code, sous direction humaine : le cahier des charges, les
arbitrages, les refus et les relectures sont de moi, le code est de lui.

C'est un choix, pas un aveu. Le corollaire pratique : jugez le dépôt comme n'importe quel
autre. S'il a un bug, c'est un bug.
