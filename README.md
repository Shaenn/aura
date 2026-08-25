<div align="center">

<img src="public/icons/favicon.svg" width="88" alt="">

# AURA

**Assistant Unifié des Ressources Agentiques**

_Le poste de pilotage de votre environnement Claude Code._

[![CI](https://github.com/Shaenn/aura/actions/workflows/ci.yml/badge.svg)](https://github.com/Shaenn/aura/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-2f6f4e)](LICENSE)
[![Local](https://img.shields.io/badge/100%25-local-2f6f4e)](#sécurité--confidentialité)
[![Node](https://img.shields.io/badge/node-24-5a5a5a)](#prérequis)
[![Plateformes](https://img.shields.io/badge/Windows-5a5a5a)](#prérequis)
[![Stack](https://img.shields.io/badge/Vue%203%20%C2%B7%20Quasar%20%C2%B7%20Fastify-5a5a5a)](#architecture)

**[Le site et le manuel en ligne](https://shaenn.github.io/aura)**

**Français** · [English](README.en.md)

</div>

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

C'est un projet personnel, écrit d'abord pour comprendre l'envers du décor. Le CLI est avare :
il travaille bien, mais il ne dit presque rien de ce qu'il fait — et bien se servir de Claude
Code demande justement de voir ce qui se passe sous le capot, en local, sur ses propres
fichiers. AURA est l'outil que j'ai construit pour regarder.

```bash
pnpm install && pnpm dev:all
```

<p align="center">
  <img src="docs/screenshots/replay.png" width="100%" alt="Rejeu d'une session : les pistes de sous-agents, et la fenêtre de contexte reconstruite tour par tour">
</p>

<p align="center">
  <img src="docs/screenshots/diagnostic.png" width="49%" alt="Diagnostic : les actions classées par impact cumulé">
  <img src="docs/screenshots/projet.png" width="49%" alt="Page projet : ressources .claude et liste des sessions">
</p>

<p align="center"><sub>Les captures utilisent un jeu de données de démonstration anonymisé.</sub></p>

---

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

Ce qui reste, une fois la ligne « coûts » mise de côté : **AURA est le seul endroit où l'on
voit ce qui a rempli la fenêtre de contexte**, ce qu'une compaction a jeté, ce qu'un
sous-agent a réellement fait — et le seul qui écrive dans `~/.claude` sous contrat.

---

## Ce qu'AURA fait

### Rejouer une session, et voir ce qui a rempli le contexte

Le rejeu reconstruit une session entière depuis son transcript : chaque tour, chaque appel
d'outil dans une vue **propre à cet outil** — un diff pour une édition, la réponse du serveur
de langage pour un `LSP`, l'image d'abord quand l'outil en a produit une.

Ce qui n'existe nulle part ailleurs :

- **La fenêtre de contexte, reconstruite tour par tour.** Ce qui l'a remplie, dans quel ordre,
  et **ce qu'une compaction a jeté**. On voit enfin où passent les jetons.
- **Les pistes de sous-agents.** Un run de deux cents tours inséré à l'endroit de son appel
  noie le fil principal. Ici chaque sous-agent a son onglet, et l'URL le porte — c'est une
  adresse, celle qu'on partage pour montrer ce qu'un agent a fait.
- **Le coût réel de la session**, jeton par jeton, cache compris.

### Suivre les sessions en direct

La liste des sessions Claude Code en cours sur la machine, avec leur statut : au travail,
**en attente de vous**, ou au repos. Le point ambre d'une session bloquée sur une permission
est le signal utile de l'écran.

AURA ne se contente pas de lire les fichiers d'état : le CLI ne les efface que s'il sort
proprement, alors AURA **interroge le système sur chaque PID** et écarte les fantômes. Et
le rafraîchissement n'est pas un sondage — le serveur surveille le dossier et pousse les
changements en SSE, avec un filet de sécurité lent pour les événements perdus.

> **« En direct » veut dire au tour près, pas au token près.**
>
> Tout ce qui est arrêté atteint le disque presque aussitôt : vos messages, les résultats
> d'outils et les lignes de service y sont en **201 ms** en médiane, 145 ms au mieux.
>
> Un tour d'assistant, lui, s'écrit d'un bloc quand il se résout. Son raisonnement, son texte
> et son appel d'outil partent ensemble, chacun portant l'horodatage du moment où il a été
> produit : le retard d'une ligne mesure donc **ce qu'il restait à produire après elle**.
> D'où 237 ms pour un texte qui clôt un tour, et jusqu'à 17 s pour le raisonnement d'un tour
> long. (64 lignes observées sur deux sessions simultanées, trois minutes.)
>
> Le rythme paraît donc irrégulier sans que ce soit de la latence : un tour court apparaît en
> une seconde, un tour long apparaît d'un coup à la fin. Le terminal, lui, affiche les tokens
> au fil de leur génération — il n'attend pas le fichier, cet écran si.
>
> Le statut de la session reste à jour dans l'intervalle : il vient de `~/.claude/sessions/`,
> écrit bien plus souvent que le transcript. Un point **au travail** sous un flux immobile
> n'est pas un écran figé, c'est un tour en cours d'écriture.
>
> Le seul endroit où AURA a un vrai direct, token par token, est l'**Atelier** — parce qu'elle
> y possède la session et reçoit le flux du SDK au lieu de relire un fichier.

### Lire la documentation d'un projet, pas seulement son `.claude`

La page d'un projet inventorie son dossier `.claude`, mais l'essentiel est souvent à côté :

- **Les instructions d'agents**, cherchées à toute profondeur parce que c'est ainsi qu'elles
  s'appliquent — `CLAUDE.md`, mais aussi `AGENTS.md`, `GEMINI.md`, `.cursorrules`,
  `.github/copilot-instructions.md`. Le fichier le plus proche du code l'emporte.
- **Les documents du dépôt** — `README`, `CONTRIBUTING`, `CHANGELOG`, `LICENSE`,
  `ARCHITECTURE`… —, pris à la racine seulement : dans un monorepo, un `README` par paquet
  ferait une liste sans fin.
- **Les dossiers que vous incluez.** Un `docs/`, un `specs/`, un dossier de comptes rendus que
  l'IA a remplis : AURA compte les documents de chaque dossier et vous les propose, mais ne
  choisit pas — un dossier de gabarits que le programme consomme ressemble trait pour trait à
  un dossier de documentation. Rien n'est écrit dans votre dépôt : l'inclusion est une
  préférence, rangée chez AURA.

Cette dernière ouvre la seule lecture d'AURA hors de `.claude`, et elle est gardée en
conséquence : la liste est **relue sur le disque avant chaque lecture**, et rien d'autre n'est
ouvert. Sans inclusion, cette porte n'ouvre rien.

### Savoir où part l'argent

Deux écrans, deux intentions. **Usage** répond à « combien, et où » : coût par jour, par
modèle, par projet, et la part des sous-agents — dont les jetons vivent dans des fichiers à
part que personne ne compte jamais.

**Diagnostic** répond à « est-ce anormal, et qu'est-ce que j'en fais ». Sa méthode mérite
d'être dite, parce qu'elle est ce qui sépare un rapport d'un devis :

- Un seuil vaut `max(P90 de votre parc, un garde-fou)`. Le percentile dit « inhabituel **ici** »
  — 78 % de cache est excellent sur un parc à 60 %, médiocre sur un parc à 99 %. Le garde-fou
  ajoute « et assez gros pour valoir une action ».
- Un garde-fou **ne peut que faire taire**. Au pire il masque un vrai problème mineur ; jamais
  il n'en invente un.
- Les actions sont classées par **impact cumulé, pas par gravité** : une règle mineure sur
  cinquante sessions passe devant une règle critique sur deux, parce que c'est la somme qui
  décide de ce qu'on fait lundi.
- Chaque chiffre annonce s'il est **mesuré ou estimé**, avec sa base de calcul.
- Le rapport se termine par **« ce qu'il ne sait pas »** : seuils non calibrés, modèles sans
  tarif connu, part de la fenêtre réellement attribuée.

> Les montants sont calculés aux **tarifs API de liste**. Un abonnement Pro ou Max est facturé
> au forfait : ce chiffre dit ce que votre usage **aurait coûté** à l'API, pas ce que vous avez
> payé. L'interface le répète partout où le chiffre apparaît.

### Piloter les ressources de `~/.claude`

| Module          | Ce qu'il gère                                                 |
| --------------- | ------------------------------------------------------------- |
| **Agents**      | Vos sous-agents et leurs prompts (`agents/*.md`)              |
| **Skills**      | Les savoir-faire chargés à la demande (`skills/*/SKILL.md`)   |
| **Plugins**     | Les plugins installés et leurs marketplaces                   |
| **Mémoire**     | Instructions permanentes et mémoires (`CLAUDE.md`)            |
| **Hooks**       | Les actions automatiques aux moments-clés                     |
| **MCP**         | Les serveurs d'outils extérieurs (`~/.claude.json`)           |
| **Réglages**    | Permissions, modèle, langue, effort, interface                |
| **Sauvegardes** | Revenir sur n'importe quelle écriture                         |
| **Maintenance** | Stockage, purge des caches, plans orphelins, processus Claude |
| **Manuel**      | Une aide contextuelle sur chaque écran                        |

### L'Atelier — la cerise, pas le gâteau

Un terminal fera toujours mieux ce travail : c'est son métier, et le CLI a des années d'avance
sur ce point précis. L'**Atelier** n'a pas été écrit pour le remplacer, mais pour voir jusqu'où
l'on pouvait mener une session complète depuis l'interface — et pour finir le projet en beauté.
Il marche, il sert tous les jours, et il n'est pas abouti au même degré que le reste de
l'application. C'est la seule partie d'AURA dont je dirais ça.

Ce qu'il apporte quand même tient en deux points. C'est le seul écran où AURA **possède** la
session au lieu de l'observer — d'où le seul vrai direct, token par token, et non au tour près.
Et il en découle une promesse : **chaque outil que l'agent veut employer passe par vous**, avec
le chemin ou la commande visée en entier, sous les yeux, avant d'autoriser. `bypassPermissions`
et `dontAsk` sont **délibérément absents** — ils retirent l'humain de la boucle, et feraient de
l'Atelier un terminal en moins commode.

- Ces sessions écrivent au **même format que le CLI** : elles se rejouent comme les autres et
  comptent dans l'usage comme dans le diagnostic. C'est ce qui les rattache au reste.
- Une session appartient au service, pas à l'onglet : fermez la page, elle continue. Elles sont
  bornées — **six de front**, ramassées après une demi-heure sans personne —, et une demande de
  permission sans réponse au bout d'un quart d'heure est **refusée** par défaut, jamais
  accordée.

Trois courtes démonstrations, prises sur un projet de test — la saisie y reprend les gestes du
terminal, image collée, `@` et `/` compris.

<!--
  LECTEURS VIDÉO — à activer une fois le dépôt en ligne.

  GitHub accepte la balise <video>, mais seulement avec une URL qu'il héberge :
  une source pointant vers un chemin du dépôt ne donne aucun lecteur. La marche à
  suivre, une fois par fichier :

    1. ouvrir une issue (ou une PR) sur le dépôt ;
    2. y glisser-déposer le .webm de docs/videos/ ;
    3. GitHub renvoie une URL github.com/user-attachments/assets/<uuid> ;
    4. la coller dans le `src` ci-dessous, et retirer le lien de repli au-dessus.

  <p align="center">
    <video src="https://github.com/user-attachments/assets/UUID-LECTURE" controls>
      Lire un fichier — la consigne, puis le fichier qui se déplie dans le fil.
    </video>
  </p>
-->

**Lire un fichier** — la consigne, puis le fichier qui se déplie dans le fil et entre dans la
fenêtre de contexte. → [voir la vidéo](docs/videos/1-lecture-fichier.webm)

**Déléguer à un agent** — un agent Explore au travail, puis sa piste, séparée du fil
principal. → [voir la vidéo](docs/videos/2-agent-explore.webm)

**Répondre à une question** — le dialogue qui s'ouvre, la réponse, la reprise de l'agent.
→ [voir la vidéo](docs/videos/3-question.webm)

Le détail — bornes, arrière-plan, reprise d'une session — est dans
[la page du manuel](https://shaenn.github.io/aura/guide/atelier).

---

## Le manuel

AURA embarque son propre manuel : **19 pages** qui ne décrivent pas seulement où cliquer, mais
**pourquoi chaque écran est fait ainsi** — pourquoi une permission qui expire est refusée et
non accordée, pourquoi les seuils du diagnostic sont des percentiles, pourquoi les sous-agents
ont leur propre piste. La touche `?` ouvre la page correspondant à l'écran courant.

Il se lit en ligne, sans installer quoi que ce soit :

[Concepts](https://shaenn.github.io/aura/guide/concepts) · [Rejeu de session](https://shaenn.github.io/aura/guide/replay) ·
[Atelier](https://shaenn.github.io/aura/guide/atelier) · [Passerelle](https://shaenn.github.io/aura/guide/passerelle) ·
[Sessions actives](https://shaenn.github.io/aura/guide/sessions) ·
[Diagnostic](https://shaenn.github.io/aura/guide/diagnostic) · [Usage & coûts](https://shaenn.github.io/aura/guide/usage) ·
[toutes les pages](https://shaenn.github.io/aura/guide/concepts)

Si vous vous demandez si le projet est sérieux, [Concepts](https://shaenn.github.io/aura/guide/concepts) est la
page à lire : elle tient en cinq minutes et dit exactement ce qu'AURA s'autorise à écrire, à
lire, et à refuser.

---

## Le modèle de sûreté

AURA modifie des fichiers qui gouvernent le comportement d'un agent autonome sur votre
machine. Le contrat est donc explicite, et il tient en quatre garanties.

**1. Toute écriture est prévisualisée.** Le serveur calcule le contenu résultant et renvoie un
diff ligne à ligne. Rien n'est écrit tant que vous n'avez pas confirmé.

**2. Toute écriture est réversible.** La version précédente part, horodatée, dans
`.local/backups` — à côté de l'application, jamais dans `~/.claude`. Y compris pour une
suppression. Une restauration est elle-même une écriture : elle est donc prévisualisée, et
sauvegarde à son tour ce qu'elle remplace.

**3. Une écriture concurrente n'est jamais écrasée.** Entre la proposition et la confirmation,
AURA retient le contenu qu'elle vous a montré. Si le fichier a bougé sur le disque entre-temps,
la confirmation est **refusée**. C'est ce qui rend sûr d'avoir deux onglets ouverts sur
`settings.json`, ou de travailler pendant qu'une session Claude Code tourne.

**4. Le périmètre d'écriture est une liste blanche, volontairement courte.** Dans `~/.claude` :
`settings.json`, `CLAUDE.md`, et les dossiers `agents/`, `skills/`, `projects/`. Tout le reste
est en lecture seule — `plugins/` en particulier, dont l'installation appartient à Claude Code.
Là où une action sort de ce périmètre, AURA affiche la **commande CLI exacte** à lancer plutôt
que de bricoler les fichiers.

En regard, une liste noire de lecture : **`.credentials.json` n'est jamais lu**, ni exposé, ni
sauvegardé. Les caches, la télémétrie, les instantanés de shell et l'état interne des sessions
sont hors de l'explorateur générique. Et tout chemin venu de l'interface est normalisé puis
vérifié : il ne peut pas sortir du dossier géré, quel que soit le nombre de `..`.

---

## Sécurité & confidentialité

- **100 % local.** Un serveur sur votre poste, votre dossier `~/.claude`, rien d'autre.
- **Aucun appel sortant.** Pas de télémétrie, pas d'analytics, pas de mise à jour silencieuse.
- **Aucun secret à fournir.** Ni compte, ni clé d'API, ni configuration obligatoire.
- **Aucun stockage côté navigateur.** Même vos préférences d'interface vivent sur le serveur.

Le seul processus qui parle à l'extérieur est l'agent de l'Atelier, quand vous lui en donnez
l'ordre — et il utilise l'authentification de votre installation Claude Code, pas la nôtre.

Une seule chose peut changer cela, et c'est vous qui décidez de l'allumer : la
[Passerelle](https://shaenn.github.io/aura/guide/passerelle), qui relie une messagerie à
l'Atelier pour piloter une session à distance. Elle est **inerte par défaut** — sans jeton,
rien ne démarre et aucun appel ne sort. Activée, elle porte un secret et appelle un service
externe, mais **n'ouvre aucun port** : son échange est sortant, l'écoute reste `127.0.0.1`.
Le pouvoir qu'elle accorde est celui d'un accès distant à votre poste, et sa liste blanche de
conversations est ce qui le referme — sans elle, elle refuse de démarrer.

Ce qui transite passe par les serveurs de la messagerie, sans chiffrement de bout en bout : la
Passerelle est faite pour un usage personnel, et **n'est pas recommandée pour un usage
professionnel**. Une forme sans tiers est cherchée — un réseau privé rendant l'Atelier joignable
depuis un téléphone — mais elle n'existe pas aujourd'hui.

[SECURITY.md](SECURITY.md) détaille les gardes du serveur, ce qu'elles ne couvrent pas, et
comment signaler une faille.

---

## Prérequis

- **Node.js 24** — une seule version majeure, celle sur laquelle l'application est développée,
  testée et livrée. C'est aussi celle que la CI fait tourner. Node 24 est en support long terme.
- **pnpm** ≥ 11 — `npm i -g pnpm`. La version exacte est épinglée par `packageManager` dans
  `package.json` : les gardes de `pnpm-workspace.yaml` sont des fonctions de pnpm 11, et une
  majeure antérieure les ignorerait en silence.
- **Claude Code** installé et lancé au moins une fois, donc un dossier `~/.claude` existant —
  `C:\Users\<vous>\.claude`.

Développé et testé sous **Windows**, exclusivement. Rien dans le code ne s'oppose à un autre
système, mais aucune autre plateforme n'a été essayée : le dire serait promettre ce qui n'a
pas été vérifié.

### Gardez vos transcripts, sinon AURA n'a rien à montrer

Claude Code purge tout seul les sessions qui n'ont pas bougé depuis **30 jours** — c'est la
valeur par défaut de `cleanupPeriodDays`. Les `.jsonl` disparaissent, et avec eux le rejeu,
l'historique d'usage et la calibration du diagnostic : les seuils sont des percentiles de
**votre** parc, un parc réduit à un mois est un parc qui a peu à dire.

Avant tout le reste, allongez cette rétention dans `~/.claude/settings.json` :

```json
{ "cleanupPeriodDays": 3650 }
```

Le réglage est aussi dans **Réglages → Interface & mises à jour**, champ « Rétention des
sessions ». Un transcript pèse quelques mégaoctets ; la page **Maintenance** montre ce que
l'ensemble occupe, et purge ce qui ne sert plus.

## Installation

```bash
git clone <url-du-dépôt> aura
cd aura
pnpm install
```

## Lancement

**En développement** — front et serveur ensemble, rechargement à chaud des deux :

```bash
pnpm dev:all
```

L'application s'ouvre sur <http://127.0.0.1:9788> — le serveur de développement ouvre le
navigateur lui-même — et le BFF écoute sur `:8788`. `dev.bat` lance exactement la même
commande, pour qui préfère un double-clic à un terminal.

### L'arrêt compte autant que le lancement

```bash
pnpm stop           # ou stop.bat
```

Une session de l'Atelier fait tourner un processus `claude`. Le serveur les coupe tous en
s'éteignant — mais encore faut-il qu'il ait le temps de le faire. Une fenêtre fermée d'un
geste ne le lui laisse pas : chaque session ouverte survit alors, invisible, en continuant de
compter sur votre quota, et laisse dans `~/.claude/sessions` un fichier qui la fait passer
pour vivante.

`Ctrl+C` dans la fenêtre suffit. Depuis une autre fenêtre, `pnpm stop` demande au serveur de
partir de lui-même — c'est le seul geste qui, sous Windows, déclenche cet arrêt ordonné, un
`Stop-Process` s'y réduisant à une terminaison sans préavis. Ce qui résiste est écarté
ensuite, en dernier recours.

La même commande s'exécute au début de `pnpm dev:all` : `node --watch` est un superviseur qui
ne meurt pas d'un port occupé — il attend, et le reprend dès qu'il se libère. Sans ce garde,
un lancement précédent mal refermé reprend la main sur le nouveau.

**En local « production »** — un seul process sert l'application et l'API :

```bash
pnpm build
pnpm start          # http://127.0.0.1:8788
```

La fenêtre de console reste ouverte : **c'est le serveur**. La fermer arrête AURA.

## Configuration

Aucune. Quelques variables facultatives, à poser dans l'environnement ou dans `server/.env`
(ignoré par git, lu par `--env-file`) :

| Variable          | Défaut      | Rôle                                                          |
| ----------------- | ----------- | ------------------------------------------------------------- |
| `PORT`            | `8788`      | Port d'écoute du serveur — cible du proxy dev de Quasar.      |
| `AURA_CLAUDE_DIR` | `~/.claude` | Dossier géré. Pratique pour travailler sur une copie sandbox. |

Les trois suivantes n'existent que pour la
[Passerelle](https://shaenn.github.io/aura/guide/passerelle), et **tout reste éteint tant que
la première est absente** :

| Variable              | Défaut    | Rôle                                                                          |
| --------------------- | --------- | ----------------------------------------------------------------------------- |
| `AURA_TELEGRAM_TOKEN` | —         | Le jeton du bot. Absent : la Passerelle n'existe pas.                         |
| `AURA_TELEGRAM_CHATS` | —         | Les conversations autorisées. **Obligatoire** : sans elle, refus de démarrer. |
| `AURA_TELEGRAM_MODE`  | `default` | Mode de permission des sessions ouvertes de loin.                             |

Une nouvelle variable demande un redémarrage complet : le rechargement à chaud ne relit pas
`--env-file`.

---

## Architecture

```
Navigateur (SPA Quasar)  ──/api/*──►  BFF Fastify (server/)  ──►  ~/.claude
        :9788 (dev)                        :8788                  lecture / écriture gardée
```

Le front ne touche jamais le disque : il appelle `/api/*` en même origine — pas de CORS, aucun
secret dans le navigateur. Le serveur, lui, ne touche `~/.claude` qu'à travers une couche
cloisonnée qui centralise la garde de chemins et les sauvegardes.

En production, le même process sert le build statique de la SPA : un seul déployable.

| Côté    | Stack                                                             |
| ------- | ----------------------------------------------------------------- |
| Front   | Vue 3 `<script setup>` · TypeScript · Pinia · Quasar · Vue Router |
| Serveur | Fastify · `tsx` · SSE pour le direct · `fs.watch` débounce        |
| Agent   | `@anthropic-ai/claude-agent-sdk`                                  |
| Rendu   | `markdown-it` · `highlight.js` · `mermaid` · `chart.js`           |
| Qualité | ESLint · Prettier · `vue-tsc` · `vitest`                          |

Les types échangés entre les deux vivent dans `shared/` et sont importés **tels quels** de part
et d'autre : renommer un champ casse les deux typechecks d'un coup, ce qui est exactement le
but.

Le détail — structure fichier par fichier, conventions, comment ajouter une surface au BFF —
est dans [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Questions fréquentes

**AURA remplace-t-elle le CLI Claude Code ?**
Non, et elle n'essaie pas. Le CLI reste l'endroit où l'on travaille ; AURA est l'endroit où
l'on voit ce qui a été fait, ce que ça a coûté, et comment est configuré l'environnement.
L'Atelier permet bien de mener une session sans terminal, mais c'est une commodité, pas une
ambition : pour travailler, le terminal reste meilleur.

**Mes transcripts partent-ils quelque part ?**
Nulle part. Ils sont lus sur votre disque par un serveur qui tourne sur votre machine, et
rendus dans un navigateur sur cette même machine.

**Est-ce que ça peut casser mon installation Claude Code ?**
Le périmètre d'écriture est court, chaque écriture est prévisualisée puis sauvegardée, et une
modification concurrente est refusée plutôt qu'écrasée. En cas de doute, la page **Sauvegardes**
restaure n'importe quelle version antérieure.

**Et si je fais tourner Claude Code sur un modèle auto-hébergé ?**
Ça se lit. Le JSONL est écrit par le CLI, pas par le modèle : l'enveloppe — chaînage des tours,
`cwd`, branche git, horodatage — est la même quel que soit le backend derrière
`ANTHROPIC_BASE_URL`. Ce qui change tient au bloc recopié de la réponse : pas de jetons de
cache, pas de coût réconciliable, et un raisonnement écrit entre `<think>` et `</think>` au
lieu d'un bloc dédié. **Ce dernier, je le sépare de la réponse à la lecture** et je le rends
comme celui de Claude — repliable, et rempli, ce que le raisonnement de Claude n'est jamais :
Claude Code le retire du transcript avant de l'écrire. Un modèle auto-hébergé est donc le seul
dont le rejeu montre vraiment la réflexion.

**Ça marche ailleurs que sous Windows ?**
Ce n'est pas testé. Le développement se fait sous Windows et rien d'autre n'a été essayé — ni
Linux, ni macOS. Les retours sont bienvenus.

**Pourquoi une interface web pour un outil local ?**
Parce que le contenu à montrer est du texte riche : diffs, Markdown, coloration syntaxique,
diagrammes, images, graphes. Un terminal les rend mal, et une application native aurait coûté
un empaquetage pour zéro bénéfice sur un outil qu'on lance à côté de son éditeur.

---

## Écrit à 100 % par Claude Code

Aucune ligne de ce dépôt n'a été tapée à la main. Tout — le serveur, la SPA, les tests, le
manuel, ce fichier — a été écrit par Claude Code, sous direction humaine : le cahier des
charges, les arbitrages, les refus et les relectures sont de moi, le code est de lui.

C'est un choix, pas un aveu. Ce qui m'intéresse est le **résultat** : une application qui
fait ce qu'elle annonce, tenue par des conventions écrites (`CLAUDE.md`, `CONTRIBUTING.md`),
des types partagés, un lint, un typecheck et des tests. Le chemin pour y arriver n'est pas
la valeur du projet ; il en est l'outil. Je l'assume entièrement, et c'est aussi la raison
d'être d'AURA — un outil pour regarder ce travail-là de près.

Le corollaire pratique : jugez le dépôt comme n'importe quel autre. S'il a un bug, c'est un
bug. Ce n'est ni une excuse ni une circonstance atténuante.

## Contribuer

Les issues et les pull requests sont bienvenues. Avant d'ouvrir une PR, lisez
[CONTRIBUTING.md](CONTRIBUTING.md) : le projet a des conventions fermes sur les tokens de
design, l'accessibilité et le contrat d'écriture, et elles sont documentées.

```bash
pnpm verifie        # lint + typecheck + test
pnpm typecheck      # src/, server/ et test/
pnpm test           # vitest
```

## Soutenir

AURA est un projet personnel, offert tel quel, et le restera. Si l'outil vous sert, le bouton
**Sponsor** en haut de cette page est la façon de le dire — sans contrepartie promise, et sans
que cela change quoi que ce soit à la licence.

## Licence

[MIT](LICENSE). Utilisez-la, forkez-la, modifiez-la, intégrez-la où vous voulez — gardez
simplement la mention de copyright.

Ce que la licence d'AURA ne couvre pas, parce que cela ne lui appartient pas :

- **Claude Code** et le **SDK Anthropic** (`@anthropic-ai/claude-agent-sdk`) relèvent des
  conditions d'Anthropic. AURA pilote votre installation, elle ne la redistribue pas.
- Les polices **Inter** et **JetBrains Mono**, embarquées dans le build, sont sous
  [SIL Open Font License 1.1](https://openfontlicense.org).

<div align="center">

---

Construit pour rendre visible ce que Claude Code fait déjà.

</div>
