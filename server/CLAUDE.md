# server/ — le BFF Fastify

Fastify exécuté par `tsx`. Node pur, pas de DOM, `tsconfig.json` local. Deux rôles :
exposer une API gardée au-dessus de `~/.claude`, et servir le build de la SPA en production
depuis le même process.

## La garde de chemins n'est pas optionnelle

Toute lecture ou écriture sous `~/.claude` passe par `claude/paths.ts` (résolution gardée)
puis `claude/fs.ts` (I/O + backup). **Jamais** `node:fs` sur un chemin brut venu du client.

Deux garanties y sont centralisées :

1. **Pas d'évasion** — un chemin relatif fourni par le client ne peut pas sortir de la racine
   `.claude` (`..`, chemins absolus, ruses de lien symbolique).
2. **Moindre privilège** — les lectures sont larges mais une _denylist_ masque toujours les
   secrets et le volatil (`.credentials.json`, `sessions`, `cache`, `telemetry`…) ; les
   **écritures** sont restreintes à une _allowlist_ des zones éditables à la main. AURA
   n'écrit jamais un cache ni un log.

Élargir l'une de ces listes est une décision, pas un détail d'implémentation : le signaler.

### Les exceptions, et elles sont deux

_(Une troisième surface sort du dossier géré sans y toucher : la Passerelle, plus bas — elle
ne lit ni n'écrit `~/.claude`, elle parle au registre de l'Atelier.)_

`processes.ts` sort de `~/.claude` : il énumère les processus Claude du système et sait en
terminer. C'était le seul moyen de montrer ce que le disque ne déclare pas — un daemon, un
hôte de pseudo-terminal, le pont de l'extension n'écrivent aucun fichier de session.

Ce pouvoir est gardé à part, et ces gardes ne se relâchent pas sans décision :

- la coupe n'écoute que la **boucle locale**, comme l'extinction ;
- la cible doit figurer dans une énumération faite **à l'instant** — donc être un processus
  Claude vivant, ce qui ferme aussi la fenêtre du PID recyclé ;
- **jamais** le processus d'AURA lui-même ;
- l'ordre de coupe appartient à `killOrder`, jamais à l'appelant : un job coupé avant son
  hôte de pseudo-terminal est relancé par celui-ci dans la seconde.

`agent/shells.ts` lit les fichiers de sortie des commandes qu'une session d'Atelier a
lancées en arrière-plan. Le CLI les écrit dans le dossier temporaire du système —
`%TEMP%/claude/<slug>/<sessionId>/tasks/<shellId>.output` — et nulle part ailleurs : sans
cette lecture, un `pnpm dev:all` lancé par la session est invisible tant qu'il tourne.

Les gardes, là encore, tiennent à peu de choses et ne se relâchent pas sans décision :

- **le client ne fournit aucun chemin** — il donne un `runId` et un `shellId` ; le chemin
  vient du suiveur de la session, qui l'a lu dans le flux du CLI ;
- ce chemin est vérifié par `isOutputPath` avant tout accès : il doit finir par
  `<shellId>.output` sous un dossier `tasks`, lui-même sous un `claude`. La comparaison
  porte sur les **segments**, jamais sur un préfixe — le CLI écrit la forme courte de
  Windows (`JEANDU~1.DUP`) là où `os.tmpdir()` rend la forme longue ;
- **lecture seule, et bornée** : `readTail` rend au plus 64 Ko à partir d'un curseur.

Toute autre sortie du dossier géré est à discuter, pas à écrire.

## Le contrat propose → apply

Une mutation se fait en deux temps, toujours :

1. **propose** — lire l'état actuel, renvoyer `before` / `after` au front. Aucune écriture.
2. **apply** — snapshot de backup, puis écriture **seulement si** le contenu sur disque
   correspond encore à ce que le client avait vu (concurrence optimiste : on refuse d'écraser
   une modification hors-bande).

Les backups vivent dans `.local/backups`, restaurables depuis la page Sauvegardes.
`.local/` est ignoré par git.

## Ajouter une surface

1. `server/routes/<nom>.ts` — routes sous le préfixe `/api/<nom>`, I/O via `claude/fs.ts`.
2. L'enregistrer dans `server/index.ts` (`registerXxx`).
3. Toute mutation suit propose / apply (voir `routes/claude.ts` comme référence).
4. Les formes échangées avec le front vont dans `shared/`, pas dans `server/`.
5. Côté front, un service `src/services/<nom>/index.ts`.

## La Passerelle (`passerelle/`)

Piloter l'Atelier depuis une messagerie. **Optionnelle et inerte par défaut** : sans
`AURA_TELEGRAM_TOKEN`, rien ne démarre et aucun appel ne sort.

Ce qui la rend acceptable tient en une phrase : **elle n'ouvre aucun port**. Le long-polling
est sortant, donc l'écoute reste `127.0.0.1` et `guard.ts` est inchangé. Elle ne passe pas non
plus par HTTP — même process que le registre, qu'elle appelle directement. Il n'y a donc pas
de requête à authentifier, et pas une route à ouvrir.

Trois gardes, et elles ne se relâchent pas sans décision :

- **la liste blanche `AURA_TELEGRAM_CHATS` est obligatoire** — jeton sans liste, la Passerelle
  refuse de démarrer. L'omission ne doit pas ouvrir la machine au premier venu ;
- un message venu d'ailleurs est ignoré **en silence** : répondre confirmerait l'existence du
  bot ;
- le jeton ne traverse pas `ServerEnv`, que tout le serveur importe : il est lu dans le seul
  module qui en a besoin, et aucune route n'est en mesure de le renvoyer.

Le pouvoir accordé reste considérable — qui écrit dans une conversation autorisée peut faire
lancer une commande et autoriser une écriture. Les demandes de permission partent en boutons ;
sans réponse, le garde-fou d'`agent/runner.ts` les refuse après un quart d'heure.

Une session pilotée d'ici **doit** rester abonnée (`runner.subscribe`) : c'est l'abonnement, et
lui seul, qui la protège du balayeur d'`agent/registry.ts`.

Tout ce qui décide vit dans `passerelle/routage.ts`, sans réseau ni registre — c'est ce qui
rend la garde vérifiable par un test (`test/passerelle.test.ts`).

Le rendu des documents a son propre piège : **l'API des messages riches accepte en silence
les champs qu'elle ne connaît pas**, si bien qu'une faute de nom ne produit pas d'erreur mais
un tableau sans en-tête. `passerelle/blocs-riches.md` recense les blocs, les noms exacts, et
les endroits où le comportement observé contredit la documentation — le lire avant de
toucher à `riche.ts`.

## Messages d'erreur

Une erreur renvoyée au front sera lue telle quelle par l'utilisateur : elle suit la charte de
voix (`docs/voix.md`, déjà chargée). Trois choses, dans cet ordre — ce qu'AURA voulait faire, ce qui a
échoué, ce qui reste possible. Corriger le message ici, pas à l'affichage.

## Pièges connus

- `server/.env` est chargé par le `--env-file` natif de Node. Le hot-reload `tsx` ne le relit
  pas : une nouvelle variable demande un redémarrage complet.
- Le service statique de prod s'active **sur présence du build** (`dist/spa/index.html`), pas
  via `NODE_ENV` inline — incompatible PowerShell.
- Port `8800` et non `8788` : ce dernier est celui d'une autre application locale.
- `AURA_CLAUDE_DIR` surcharge le dossier géré.
- `CLAUDE_CODE_PROJECT_DIR_NAME` **casse la résolution des transcripts, en silence**. Le
  nom du dossier d'un projet est dérivé du `cwd` (`agent/slug.ts`, et sa lecture inverse
  dans `src/utils/slug.ts`) ; depuis le CLI 2.1.234, cette variable permet de le choisir.
  Posée, elle rend introuvables des transcripts qui existent, sans erreur ni trace.
- **Les sessions de l'Atelier ont deux bornes**, toutes deux dans `agent/registry.ts` :
  `MAX_SESSIONS` (le parc refuse d'en ouvrir une de plus — `429`, pas `409`) et
  `IDLE_TTL_MS` (un balayeur ramasse celles que plus personne ne regarde). Une session
  qui travaille ou qu'un onglet suit n'est jamais ramassée : c'est `SessionRunner.expired`
  qui en juge, et lui seul.
- **Le serveur ne se tue pas, il s'éteint.** Le crochet `onClose` coupe les sessions de
  l'Atelier — un processus `claude` chacune — et les threads de lecture. Aucun signal venu de
  l'extérieur ne le déclenche sous Windows : `POST /api/system/shutdown` (refusé hors
  `127.0.0.1`) existe pour ça, et `pnpm stop` l'appelle. Terminer le processus de force laisse
  les sessions derrière lui, quota compris.

## Tests

`vitest`, environnement `node`, dans `test/**/*.test.ts` — ils exercent le BFF et les helpers
sans DOM. Un parseur ou un accumulateur qui prend un fichier et rend un objet se teste ici ;
les composants Vue ne sont pas couverts par vitest.
