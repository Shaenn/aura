# Contribuer

**Français** · [English](CONTRIBUTING.en.md)

Guide technique pour développer sur l'application. Pour l'installation et l'utilisation, voir le
[README](README.md).

En proposant une contribution, vous acceptez qu'elle soit publiée sous la [licence MIT](LICENSE)
du projet. Le [code de conduite](CODE_OF_CONDUCT.md) vaut pour les issues comme pour les revues,
et [SECURITY.md](SECURITY.md) dit comment signaler une faille sans l'exposer.

## Stack

- **Front** : Vue 3 + TypeScript + Pinia + Quasar (SPA), `vue-router`.
- **BFF** (Backend-for-Frontend) : serveur **Fastify** (`server/`), exécuté par `tsx`.
- **Agent** : `@anthropic-ai/claude-agent-sdk` pour l'Atelier (sessions possédées par AURA).
- **Rendu de transcript** : `markdown-it` + `highlight.js` (+ `mermaid`) pour le rejeu des sessions ;
  `chart.js` pour les graphes d'usage, `lottie-web` pour les animations.
- **Outillage** : ESLint + Prettier, `vite-plugin-checker` (vue-tsc + eslint), `vitest`, `concurrently`.

## Architecture

```
Navigateur (SPA Quasar)  ──/api/*──►  BFF Fastify (server/)  ──►  ~/.claude  (lecture / écriture gardée)
        :9100 (dev)                        :8800                   (dossier local de l'utilisateur)
```

Le BFF a deux rôles :

1. **Exposer une API gardée au-dessus de `~/.claude`.** Le front ne touche jamais le disque directement :
   il appelle `/api/*`, et le serveur lit / liste / écrit dans le dossier `.claude` via une couche
   **cloisonnée** (garde anti-`..`, allowlist d'écriture, denylist de lecture — `server/claude/paths.ts`,
   `server/claude/fs.ts`). Toute écriture passe par un flux **propose → apply** avec **backup** préalable.
2. En **production**, il sert aussi le build statique de la SPA depuis le même process (un seul
   déployable). En dev, Quasar sert le front sur `:9100` et proxifie `/api` vers `:8800`
   (`quasar.config.ts` → `devServer.proxy`).

Le front n'appelle donc que `/api/...` — même origine, pas de CORS, aucun secret côté navigateur.

AURA est un outil **local et mono-utilisateur** : pas d'authentification, pas de service externe.
Le BFF n'écoute que `127.0.0.1`, sans variable pour en sortir. Ce que cela ne suffit pas à
fermer — le navigateur, lui, est sur la machine — est pris par `server/guard.ts` : `Host`
vérifié contre le rebinding DNS, `Sec-Fetch-Site` exigé sur toute écriture. Voir
[SECURITY.md](SECURITY.md).

## Structure

```
shared/                 types de wire, importés tels quels par les deux côtés
  transcript.ts         modèle de rejeu (TranscriptEvent, Block, images)
  context.ts            remplissage de la fenêtre de contexte + compactions
  projects.ts           types de l'API Projects
  agent.ts              protocole de l'Atelier
  processes.ts          les processus Claude vivants (Maintenance)

server/                 BFF Fastify
  index.ts              bootstrap (routes + service statique en prod)
  env.ts                config locale (PORT, AURA_CLAUDE_DIR — voir README)
  paths.ts              APP_DIR / IS_BUNDLE / BACKUPS_DIR
  guard.ts              qui a le droit d'appeler /api (Host, Sec-Fetch-Site)
  errors.ts             ce qu'une erreur a le droit de dire au client
  net.ts                d'où vient la requête — garde de l'extinction ordonnée
  claude/               fs.ts (I/O sandboxé + backup), paths.ts (garde de chemins),
                        frontmatter.ts, model.ts
  projects.ts           inventaire .claude d'un projet + lecture de ressources (read-only)
  transcript.ts         parsing des transcripts .jsonl → TranscriptEvent / Block
  transcript-cache.ts   ne reparse pas un fichier dont l'empreinte n'a pas bougé
  context.ts            reconstruit ce qui a rempli la fenêtre, tour par tour
  usage.ts              agrégation des tokens sur tout le parc (passe étroite, ~1200 fichiers)
  tokens.ts             pliage des compteurs `usage` répétés d'une même réponse
  pricing.ts            estimation de coût aux tarifs API (⚠️ pas ce qui est facturé)
  maintenance.ts        stockage, purge, sessions actives, plans, mapping slug ↔ chemin
  processes.ts          énumère et classe les processus Claude, et les coupe
                        (⚠️ la seule surface qui sorte de ~/.claude — voir server/CLAUDE.md)
  mcp.ts / backups.ts / plugin-hooks.ts   inventaires correspondants
  watch.ts              surveillance de ~/.claude (fs.watch débounce, best-effort)
  diagnostics/          chaîne mesurer → calibrer → désigner → décider
                        (signals, thresholds, rules, recommend, behaviour, pace, session)
  agent/                Atelier : runner (session possédée, sans HTTP), registry (sessions
                        vivantes en mémoire), queue, pending, ask, activity, folder, slug,
                        files (arborescence du dossier de travail, pour le `@`),
                        shells (commandes en arrière-plan : suit les messages, lit les
                        sorties — ⚠️ seconde surface hors de ~/.claude)…
  routes/               claude.ts (list/read/propose/apply/delete + index de ressources),
                        projects.ts, maintenance.ts, mcp.ts, backups.ts, preferences.ts,
                        usage.ts, diagnostics.ts, events.ts (SSE), agent.ts

src/
  pages/                HomePage, ProjectsPage, ProjectDetailPage, SessionsPage,
                        TranscriptReplayPage, AgentsPage, SkillsPage, PluginsPage, McpPage,
                        MemoryPage, HooksPage, BackupsPage, AtelierPage, UsagePage,
                        DiagnosticPage, MaintenancePage, SettingsPage, HelpPage
  components/           replay/ (TranscriptTimeline, ToolCall, MarkdownView, ContextPanel,
                        TaskPanel, AskUserQuestionView…), agent/ (SessionComposer,
                        PermissionPrompt, AskPrompt…), resources/, settings/, usage/, help/,
                        ui/ (SegmentedControl, FormSection, LabelValueRow, CopyButton,
                        HelpTip, LottieView), ConfirmDiffDialog, RuleTree, PlanTree,
                        CliCommandDialog
  services/             clients API front → tapent /api/* :
                        claude/, projects/, system/, mcp/, backups/, preferences/,
                        usage/, diagnostics/, agent/, events.ts
  stores/               Pinia (system, settings)
  composables/          useBreadcrumbs, useJsonForm, useFrontmatterForm, useHelp,
                        useLiveSession, useAgentTracks, useTranscriptTurns, useChartTokens,
                        useExpandAll
  help/                 sections/*.md — source unique du manuel (tiroir + page /aide)
  utils/                format, slug, markdown, diff, json-edit, tools, ansi, agentColors,
                        resourceFrontmatter, pathMatch (classement et arbre du `@`)
  boot/, router/, layouts/, css/

test/                   vitest, environnement node — parseurs, agrégats, diagnostics

scripts/                outillage hors application
  free-ports.mjs        libère 8800/9100 : extinction ordonnée du BFF d'abord, force ensuite
  i18n-scan.mjs         relevé des chaînes à traduire

dev.bat                 lancement (délègue à `pnpm dev:all`)
stop.bat                arrêt ordonné (délègue à `pnpm stop`)
```

## Instructions pour Claude Code

Les fichiers `CLAUDE.md` sont découpés par périmètre, de sorte qu'une session ne charge que ce
qui la concerne :

- `CLAUDE.md` (racine) — identité, architecture, commandes, conventions transverses.
- `src/CLAUDE.md` — règles front, design tokens, primitives, manuel.
- `server/CLAUDE.md` — garde de chemins, contrat propose/apply, pièges du BFF.

Un fichier de sous-dossier n'est chargé que lorsque Claude touche un fichier de ce dossier.
Y ajouter une règle plutôt qu'à la racine quand elle ne concerne qu'un côté.

## Conventions front

Le projet suit les règles de `frontend-rules/` (Quasar / Vue 3) — voir `frontend-rules/rules.md` :
`<script setup lang="ts">`, composants Quasar (jamais d'élément natif brut), pas de valeur de design en
dur (utiliser les tokens), accessibilité (nom accessible + clavier), états async canoniques, validation
de formulaire par règles de champ.

Ne pas refactorer du code existant non conforme sans le signaler — le pointer et laisser décider.

### Design system (thème & tokens)

Le système visuel repose sur un **vocabulaire fermé de tokens CSS** défini dans `src/css/app.scss`. La
règle d'or : **toujours un token, jamais une valeur en dur** — et ça vaut pour les couleurs **comme** pour
les tailles, radius, espacements et durées.

**Couleurs.** Tokens neutres dans `:root`, surfaces / texte / lignes thémés (`body--dark` par défaut,
overrides sous `body.body--light`). Le thème passe par le plugin Quasar `Dark`, piloté par le store
`settings` ; `boot/settings.ts` charge la préférence depuis le BFF avant le premier rendu — rien n'est
gardé dans le navigateur, et il n'y a pas de flash au chargement.
`--bg` · `--surface` · `--surface-2/3/4` · `--text` · `--muted` · `--dim` · `--faint` · `--line` ·
`--line-2/3` · marque `--brand` (+ `-hover/-soft/-line/-muted`, `--on-brand`) · états `--pulse` / `--warn`
/ `--danger`.

Les ratios de contraste et les ΔE de la palette sont calculés et annotés dans `app.scss`, y compris pour
les déficiences de vision des couleurs. Changer une valeur invalide ce travail.

**Échelles (thème-agnostiques, dans `:root`).** Choisir le cran le plus proche, jamais une valeur libre :

| Dimension   | Tokens                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Typographie | `--fs-2xs` 10 · `--fs-xs` 11 · `--fs-sm` 12 · `--fs-base` 13 · `--fs-md` 14 · `--fs-lg` 15 (px) |
| Radius      | `--radius-xs` 4 · `--radius-sm` 6 · `--radius-md` 12 (px)                                       |
| Espacement  | `--space-xs` 4 · `--space-sm` 8 · `--space-md` 12 · `--space-lg` 16 · `--space-xl` 24 (px)      |
| Motion      | `--motion-fast` 0.12s · `--motion-base` 0.2s · `--motion-slow` 0.3s                             |

**Primitives.** Classes utilitaires (`.surface-card`, `.status-dot`, `.section-label`, `.font-mono`) et
composants réutilisables dans `src/components/ui/` : `SegmentedControl` (boutons segmentés « tech »,
couleurs dark-aware encapsulées), `FormSection` (label + contrôle, empilé avec hint ou inline),
`LabelValueRow` (ligne clé/valeur), `CopyButton`, `HelpTip`, `LottieView`. Réutiliser ces primitives
plutôt que de recopier leur markup/CSS.

## Qualité

```bash
pnpm verifie     # lint + typecheck + test — le geste avant de pousser
pnpm lint        # ESLint, mise en forme comprise
pnpm format      # Prettier puis ESLint --fix
pnpm typecheck   # vue-tsc sur src/, puis tsc sur server/ et test/
pnpm test        # vitest
```

`pnpm typecheck` couvre le front, le BFF et les tests. Prettier est lancé comme une règle
ESLint : la mise en forme se relève par `pnpm lint` et se corrige par le même `--fix`.

`server/` et `test/` ont leur propre `tsconfig.json` (Node, `lib: esnext` sans DOM, extensions `.ts`
autorisées à l'import) ; le tsconfig racine les exclut. `exactOptionalPropertyTypes` est actif côté
`src/` (hérité de Quasar) et désactivé côté `server/` : le BFF construit ses DTO depuis du JSON non
typé, où `field: undefined` est la façon normale d'écrire « absent ».

Les tests sont en environnement `node` (`test/**/*.test.ts`) : ils couvrent les parseurs, les agrégats
et les diagnostics. Les composants Vue ne sont pas couverts par vitest ; Playwright est lancé à la main.

La CI (`.github/workflows/ci.yml`) enchaîne ces quatre commandes sur `windows-latest`. `pnpm build`
y figure pour la raison ci-dessus : sans lui, une rupture de types dans `src/` passerait.

Quelques tests lisent le `~/.claude` de la machine s'il existe et se sautent sinon. Cela vaut d'être
su avant de faire échouer volontairement l'un d'eux : un échec affiche les chemins qu'il a lus.

## Ajouter une surface au BFF

1. `server/routes/<nom>.ts` : enregistrer les routes sous un préfixe `/api/<nom>` ; pour toute lecture /
   écriture du dossier `.claude`, passer par `server/claude/fs.ts` (I/O sandboxé + backup) et
   `server/claude/paths.ts` (garde de chemins) — **ne jamais** manipuler des chemins bruts.
2. L'enregistrer dans `server/index.ts` (`registerXxx`).
3. Toute mutation suit le contrat **propose / apply** : le serveur renvoie le diff, le front confirme,
   puis l'écriture se fait avec backup **et** vérification que le contenu sur disque correspond encore à
   ce que le client avait vu (concurrence optimiste) — voir `server/routes/claude.ts` et
   `src/components/ConfirmDiffDialog.vue`.
4. Les formes échangées avec le front vont dans `shared/`, jamais dupliquées de part et d'autre.
5. Côté front, un service `src/services/<nom>/index.ts` (client `fetch` typé, base `/api/<nom>`) calqué
   sur les services existants (`claude`, `projects`, `system`).
6. Une route destructrice nomme sa cible : rien de ce qui efface ne doit s'obtenir par omission. La
   purge des sauvegardes effaçait tout sur un corps vide — c'est le genre de défaut par défaut qui
   ne se voit qu'une fois.
7. Une erreur rendue au client passe par `publicMessage` (`server/errors.ts`) : le message d'AURA
   est rédigé pour être lu, celui de Node porte le chemin absolu du poste.

## Notes techniques

- Le serveur charge `server/.env` via `--env-file` natif de Node (pas de dépendance `dotenv`). Un
  redémarrage complet est nécessaire pour prendre en compte une nouvelle variable (le hot-reload `tsx`
  ne relit pas `--env-file`).
- Le dossier géré se surcharge par `AURA_CLAUDE_DIR` — pratique pour travailler sur une copie du
  dossier plutôt que sur le vrai.
- Le port est `8800` et non `8788` : ce dernier est celui d'une autre application locale. Le dev
  server échoue bruyamment plutôt que de glisser vers le port libre suivant.
- Le service statique de prod s'active **sur présence du build** (`dist/spa/index.html`), pas via
  `NODE_ENV` inline (incompatible PowerShell).
- Les sauvegardes des fichiers modifiés vivent dans `.local/backups` (restaurables depuis la page
  **Sauvegardes**) ; le dossier `.local/` est ignoré par git.
- La fraîcheur passe par SSE (`/api/events`, alimenté par `server/watch.ts`) plutôt que par du polling.
  `fs.watch` est best-effort — événements coalescés, watcher qui meurt en silence — donc le front garde
  un poll de repli lent : c'est un signal de rafraîchissement, jamais la seule source de vérité.
- Les prix de `server/pricing.ts` sont des **tarifs API de liste**. Un abonnement Pro/Max facture un
  forfait mensuel : l'interface doit dire que le chiffre répond à « combien cette session aurait coûté
  en API », pas à « combien vous avez payé ».
