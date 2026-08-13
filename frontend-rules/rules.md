# Règles front d'AURA

Vue 3 + TypeScript + Pinia + Vite + Quasar, avec un système de design **maison**.

Ces règles décrivent ce que le code d'AURA fait déjà. Ce ne sont pas des vœux : chaque
exemple « faire » sort d'un fichier existant, et chaque interdit correspond à une dérive
réelle qu'on a corrigée. Si une règle et le code divergent, l'un des deux est en tort —
allez voir lequel avant d'écrire.

## Portée

- Elles valent pour le code que vous écrivez ou qu'on vous demande de modifier.
- Le code existant non conforme ne se refactore pas spontanément : le signaler, laisser
  décider.
- En cas de conflit avec `CLAUDE.md` ou `src/CLAUDE.md`, ce sont eux qui l'emportent.

## Le point à comprendre en premier

**AURA emploie Quasar pour ses composants, pas pour son style.**

Le vocabulaire visuel est un jeu fermé de custom properties CSS défini dans
`src/css/app.scss` — `--space-md`, `--fs-base`, `--brand`, `--surface-2`… Les classes
utilitaires de Quasar (`q-pa-md`, `text-h4`, `shadow-4`, `rounded-borders`) et l'échelle
typographique Material **ne sont utilisées nulle part** : zéro occurrence dans `src/`, contre
96 fichiers qui appellent `var(--space-*)`.

Écrire `class="q-pa-md text-h5"` n'est donc pas un raccourci tolérable : c'est du code
étranger au projet, qui passera la revue visuelle et cassera le thème clair.

## Les règles

| Règle                                                                                             | Détail                   |
| ------------------------------------------------------------------------------------------------- | ------------------------ |
| Toujours `<script setup lang="ts">`. Jamais l'Options API, jamais de composant sans types.        | —                        |
| Jamais de valeur de design en dur. Un token, ou rien.                                             | `design-tokens.md`       |
| Jamais de `<button>`, `<input>`, `<select>` bruts. Le composant Quasar, ou une primitive maison.  | `component-selection.md` |
| Ne jamais inventer une prop absente de l'API d'un composant.                                      | `component-selection.md` |
| Les props par défaut du projet s'appliquent à chaque usage.                                       | `component-defaults.md`  |
| Réutiliser les motifs composites existants avant d'en inventer un.                                | `design-patterns.md`     |
| Toute section asynchrone rend ses états chargement / vide / erreur.                               | `async-states.md`        |
| Un formulaire valide par règles de champ ; la soumission valide et met le focus sur la 1ʳᵉ faute. | `form-validation.md`     |
| Une table filtrable pilote le filtre natif de `q-table` depuis son slot `top`.                    | `table-filtering.md`     |
| Le HTML porte le sens : titres, listes, sections, `<header>`.                                     | `html-semantics.md`      |
| Tout élément interactif a un nom accessible et s'atteint au clavier.                              | `accessibility.md`       |
| Les particularités Quasar — thème sombre, téléportation, directives.                              | `quasar-specifics.md`    |

## Un token qui manque

Ne pas l'inventer. Le vocabulaire est fermé délibérément : un `--space-xxl` ajouté à la volée
est une dette que personne ne voit passer. Signaler le manque, proposer le cran existant le
plus proche, et laisser trancher.

## Tout texte visible suit la charte de voix

`docs/voix.md`. Ce n'est pas un vernis rédactionnel : la charte décide de la personne
grammaticale, et sépare les surfaces où AURA parle d'elle-même (« Je ne vois aucune session
active. ») de celles où elle se tait (en-têtes de colonnes, libellés de boutons, titres
d'écrans).
