# src/ — la SPA

Règles Vue 3 / Quasar du projet : @../frontend-rules/rules.md

## Design tokens

Le vocabulaire visuel est **fermé** et défini dans `src/css/app.scss`. Règle d'or : toujours
un token, jamais une valeur en dur — pour les couleurs **comme** pour les tailles, radius,
espacements et durées.

| Dimension   | Tokens                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| Typographie | `--fs-2xs` `--fs-xs` `--fs-sm` `--fs-base` `--fs-md` `--fs-lg`            |
| Radius      | `--radius-xs` `--radius-sm` `--radius-md`                                 |
| Espacement  | `--space-xs` `--space-sm` `--space-md` `--space-lg` `--space-xl`          |
| Écran       | `--page-max` — largeur utile d'une page bornée, la même pour toutes       |
| Motion      | `--motion-fast` `--motion-base` `--motion-slow`                           |
| Surfaces    | `--bg` `--surface` `--surface-2/3/4` `--text` `--muted` `--dim` `--faint` |
| Lignes      | `--line` `--line-2/3`                                                     |
| Marque      | `--brand` (+ `-hover` `-soft` `-line` `-muted`), `--on-brand`             |
| États       | `--pulse` `--warn` `--danger`                                             |

Choisir le cran le plus proche. Un token qui manque se signale à l'utilisateur, il ne
s'invente pas.

Le thème sombre est le défaut (`body--dark`), le clair est un override sous `body.body--light`.
La bascule passe par le plugin Quasar `Dark`, piloté par le store `settings`. `boot/settings.ts`
charge la préférence **depuis le BFF** avant le premier rendu (rien n'est gardé dans le
navigateur, pas de flash au chargement).

Les contrastes de la palette ont été calculés (ratios et ΔE annotés dans `app.scss`) :
modifier une couleur invalide ce travail. Remesurer avant de toucher au fichier.

## Primitives

Réutiliser `src/components/ui/` (`SegmentedControl`, `FormSection`, `LabelValueRow`…) et les
classes utilitaires (`.surface-card`, `.status-dot`, `.section-label`, `.font-mono`) plutôt
que de recopier leur markup ou leur CSS.

`SegmentedControl` sert à **éditer une valeur** ; un toggle sert à **un effet immédiat**.

Deux classes sont **opt-in et le restent** : `.surface-card--braced` (renforts d'angle) ne
va qu'au bloc dont il s'agit — un écran qui la pose sur ses dix cartes n'annonce plus rien ;
`.backdrop-grid` (trame de fond) n'a de sens que sur un écran qui a du vide à occuper, et
n'apparaîtrait que dans les gouttières d'un écran de travail plein bord à bord.

La trame est posée aujourd'hui sur l'accueil, la 404, les six pages de ressources (Agents,
Skills, Plugins, Mémoire, Hooks, MCP), les six pages système (Réglages, Sauvegardes, Usage,
Diagnostic, Maintenance, Manuel) et **l'accueil de l'Atelier seulement** — le `v-if="!session"`
l'en retire dès qu'une session est ouverte. Le critère est le vide, pas la famille d'écran :
un écran vide donne de la matière à voir, un écran de travail n'en a pas besoin. Elle reste
donc hors de Sessions actives, du Rejeu et de l'Atelier en session, dont les volets vont
bord à bord.

Un écran dont la racine est bornée prend `.backdrop-grid--fixed` : sinon la trame s'arrête au
bord de la colonne, c'est-à-dire partout sauf dans les marges, qui sont justement le vide à
occuper.

Toute page bornée est **centrée** (`margin: 0 auto`) et prend `--page-max`. Les deux vont
ensemble : trois pages étaient calées à gauche et trois largeurs différentes coexistaient,
si bien que le contenu sautait d'un écran à l'autre sans raison.

## Accès aux données

Le front ne touche jamais le disque et n'appelle jamais autre chose que `/api/*`. Un domaine =
un service `src/services/<nom>/index.ts` (client `fetch` typé, base `/api/<nom>`), calqué sur
les services existants. Les types de réponse viennent de `shared/`, ils ne se redéclarent pas.

Toute mutation d'un fichier `.claude` passe par `ConfirmDiffDialog.vue` : proposer, montrer le
diff, appliquer. Pas d'écriture silencieuse.

## Le manuel

`src/help/sections/*.md` alimente à la fois le tiroir d'aide contextuel et la page `/aide` —
une seule source. La frontière de voix y est stricte : ce qu'**AURA** fait se dit à la
première personne, ce que **Claude Code** fait reste en voix neutre descriptive.

Une page d'aide se vérifie contre le code avant d'être écrite : elle décrit ce que l'écran
fait réellement, pas ce qu'il devrait faire.
