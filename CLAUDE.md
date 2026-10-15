# CLAUDE.md

## Identité

L'application s'appelle **AURA** — _Assistant Unifié des Ressources Agentiques_. Une seule
forme écrite, en capitales, partout : jamais « Aura », jamais « aura ».

Tout texte visible par l'utilisateur suit la charte de voix : @docs/voix.md

## Architecture

```
Navigateur (SPA Quasar)  ──/api/*──►  BFF Fastify (server/)  ──►  ~/.claude
        :9788 (dev)                        :8788                  (lecture / écriture gardée)
```

Ces deux numéros sont déclarés dans **`ports.json`**, à la racine, et nulle part ailleurs :
`quasar.config.ts` (l'écoute et la cible du proxy), `server/env.ts` et `lancement/arreter.mjs`
le lisent. Du JSON plutôt qu'un module TypeScript pour rester lisible hors du monde TypeScript
— PowerShell par `ConvertFrom-Json`, un back C# par `AddJsonFile`. Le schéma ci-dessus est la
seule recopie qui subsiste : elle se lit, elle ne s'exécute pas.

Le lancement vit dans **`lancement/`**, le lanceur commun du parc distribué par VIGIE : `dev.bat`,
`preview.bat` et `stop.bat` ne font que l'appeler, et pour un agent ce sont `node
lancement/lancer.mjs dev`, `node lancement/lancer.mjs preview` et `node lancement/arreter.mjs`.
Ce qui est propre à AURA tient dans `lancement/services.json` (les deux services) et
`lancement/eteindre.mjs` (l'extinction ordonnée du BFF). `lancer.mjs`, `arreter.mjs` et
`LISEZMOI.md` sont des copies qu'on ne retouche pas : une correction se porte à VIGIE.

AURA est un outil **local, mono-utilisateur** : aucun service externe, aucun secret, aucune
authentification. Le front n'appelle que `/api/*` en même origine — pas de CORS.

**Une seule exception, et elle est optionnelle** : la Passerelle
(`server/passerelle/`) relie une messagerie à l'Atelier. Elle porte un secret, appelle un
service externe, et n'existe que si l'utilisateur la configure — sans jeton, rien ne démarre
et aucun appel ne sort. Elle n'ouvre **aucun port** : son long-polling est sortant, si bien
que l'écoute reste `127.0.0.1` et que `guard.ts` ne bouge pas. Ce qui la tient est sa liste
blanche de conversations, et elle refuse de démarrer sans elle.

Elle vise l'usage personnel : ce qui transite passe par les serveurs de la messagerie, sans
chiffrement de bout en bout, donc elle **n'est pas recommandée en contexte professionnel**. Une
forme sans tiers reste à trouver — piste d'un réseau privé (Tailscale) joignant l'Atelier depuis
un téléphone, ce qui supposerait de l'adapter à cet écran.

- `src/` — SPA Vue 3 / Quasar. Voir `src/CLAUDE.md`.
- `server/` — BFF Fastify. Voir `server/CLAUDE.md`.
- `shared/` — types de _wire_ (`transcript.ts`, `context.ts`, `agent.ts`, `projects.ts`,
  `processes.ts`)
  importés tels quels des deux côtés. Renommer un champ ici casse les deux typechecks
  d'un coup : c'est voulu, c'est ce qui empêche la dérive. Toute forme échangée entre le
  BFF et la SPA vit ici, jamais dupliquée.

## Commandes

```bash
pnpm dev         # front seul, HMR — le back doit tourner à côté
pnpm server      # BFF seul, relancé à chaque fichier (node --watch)
node lancement/lancer.mjs dev      # front + BFF ensemble, en développement (dev.bat)
node lancement/lancer.mjs preview  # comme en production : build, puis le BFF sert dist/spa (preview.bat)
node lancement/arreter.mjs         # extinction ordonnée du BFF, puis libère les ports (stop.bat)
pnpm test        # vitest, environnement node, test/**/*.test.ts
pnpm typecheck   # vue-tsc sur src/, puis tsc sur server/ et test/
pnpm lint        # eslint . — 384 fichiers, mise en forme comprise
pnpm lint:fix
pnpm format      # prettier . --write puis pnpm lint:fix
pnpm format:check
pnpm verifie     # lint + typecheck + test : le geste avant de pousser
```

`pnpm typecheck` couvre tout ce que le dépôt contient : le front par `vue-tsc`, le BFF et
les tests par `tsc`. `vite-plugin-checker` continue de typer `src/` pendant `pnpm dev`,
mais il ne rattrape plus rien que la ligne de commande ne verrait pas.

Prettier est lancé **comme une règle ESLint** (`eslint-plugin-prettier/recommended`) : la
mise en forme se relève par `pnpm lint` et se corrige par le même `--fix`. Une seule
réserve : le correcteur de `local/import-order` remplace le bloc des imports par les seuls
imports triés, et efface ce qui vit entre eux — un `export … from`, un commentaire de
groupe. Ordonner les imports à la main plutôt que de laisser `pnpm format` s'en charger.

`server/` et `test/` ont leur propre `tsconfig.json` (Node, pas de `lib: dom`) ; la racine
les exclut. `exactOptionalPropertyTypes` est actif côté `src/`, inactif côté `server/`.

## Conventions transverses

- **Toute écriture dans `~/.claude` suit le contrat propose → apply**, jamais un write
  direct : le BFF renvoie un diff, l'utilisateur confirme, l'écriture se fait avec backup
  et vérification que le disque n'a pas bougé entre-temps. Détail dans `server/CLAUDE.md`.
- Les fichiers de `frontend-rules/` décrivent ce que le code du projet fait déjà : ce sont des
  règles, pas du code applicatif. Ne pas les modifier pour faire passer du code — si une règle
  et le code divergent, aller voir lequel des deux est en tort.
- Le code existant non conforme aux règles ne se refactore pas sans demander : le signaler
  et laisser décider.
- Les commentaires expliquent _pourquoi_, pas _quoi_. Le code du dépôt suit cette forme —
  s'y conformer plutôt que d'annoter chaque ligne.

`CONTRIBUTING.md` détaille la structure fichier par fichier ; `README.md` couvre
l'installation et l'usage.
