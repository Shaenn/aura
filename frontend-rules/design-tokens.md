# Design tokens

La source de vérité est `src/css/app.scss`. Elle définit un jeu **fermé** de custom
properties CSS. Tout le style d'AURA s'écrit avec, et rien qu'avec.

`src/css/quasar.variables.scss` existe aussi, mais il ne sert qu'à **une** chose : donner à
Quasar la contrepartie SCSS des mêmes couleurs, parce que Quasar compile ses propres classes
au build et n'a donc pas accès aux custom properties. Ce fichier suit `app.scss`, il ne le
précède jamais.

## Le vocabulaire

| Catégorie   | Tokens                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Typographie | `--fs-2xs` 10 · `--fs-xs` 11 · `--fs-sm` 12 · `--fs-base` 13 · `--fs-md` 14 · `--fs-lg` 15     |
| Radius      | `--radius-xs` 4 · `--radius-sm` 6 · `--radius-md` 12                                           |
| Espacement  | `--space-xs` 4 · `--space-sm` 8 · `--space-md` 12 · `--space-lg` 16 · `--space-xl` 24          |
| Motion      | `--motion-fast` 0.12s · `--motion-base` 0.2s · `--motion-slow` 0.3s                            |
| Fonds       | `--bg` · `--surface` · `--surface-2` · `--surface-3` · `--surface-4`                           |
| Texte       | `--text` · `--muted` · `--dim` · `--faint`                                                     |
| Filets      | `--line` · `--line-2` · `--line-3`                                                             |
| Marque      | `--brand` · `--brand-hover` · `--brand-soft` · `--brand-line` · `--brand-muted` · `--on-brand` |
| États       | `--pulse` · `--warn` · `--danger`                                                              |

Les quatre premières familles sont **thème-agnostiques** : elles vivent dans `:root` et ne
changent pas entre clair et sombre. Les fonds, textes, filets et couleurs d'état sont thémés :
définis pour le sombre (le défaut), puis redéfinis sous `body.body--light`.

## Règles

### Une valeur de design est un token

**Pourquoi.** Une valeur en dur ne suit ni le thème, ni les recalibrages. Les ratios de
contraste de la palette sont calculés et annotés dans `app.scss` — un `#888` posé à la main
sort de ce calcul sans que rien ne le signale.

**Faire.**

```scss
.at-panel-empty {
  padding: var(--space-md) 0;
  color: var(--dim);
  font-size: var(--fs-sm);
  border-radius: var(--radius-sm);
}
```

**Ne pas faire.**

```scss
.at-panel-empty {
  padding: 12px 0;
  color: #888;
  font-size: 12px;
  border-radius: 6px;
}
```

**Cas limites.**

- Une valeur qui n'est pas du design n'a pas besoin de token : `width: 100%`, `flex: 1`,
  `z-index`, une hauteur de squelette (`height="280px"`) calquée sur le contenu réel.
- Un `1px` de bordure reste `1px` — c'est une unité physique, pas un cran d'échelle. La
  couleur, elle, prend `var(--line)`.

### Choisir le cran, jamais l'interpolation

**Pourquoi.** L'échelle a peu de crans exprès. `padding: 10px` entre `--space-sm` (8) et
`--space-md` (12) crée un rythme que rien ne rattrape ensuite.

**Faire.** `gap: var(--space-sm);`

**Ne pas faire.** `gap: 10px;` — ni `gap: calc(var(--space-sm) + 2px);`

### Ne jamais employer les utilitaires de style de Quasar

**Pourquoi.** Ils portent l'échelle Material, pas la nôtre. Ils sont compilés au build, donc
insensibles au thème d'AURA, et repeignent le composant à l'ancienne palette.

**Faire.**

```vue
<template>
  <section class="dg-tile">
    <h2 class="section-label">Coût estimé</h2>
    <p class="dg-tile-value">{{ cost }}</p>
  </section>
</template>

<style scoped lang="scss">
.dg-tile {
  padding: var(--space-md);
  background: var(--surface-2);
  border-radius: var(--radius-md);
}
</style>
```

**Ne pas faire.**

```vue
<template>
  <section class="q-pa-md bg-grey-9 rounded-borders shadow-2">
    <h2 class="text-overline text-grey-5">Coût estimé</h2>
    <p class="text-h5">{{ cost }}</p>
  </section>
</template>
```

Sont concernés : `q-pa-*`, `q-ma-*`, `q-gutter-*`, `text-h1`…`text-h6`, `text-body*`,
`text-caption`, `text-overline`, `text-subtitle*`, `shadow-*`, `rounded-borders`, et les
couleurs `text-*` / `bg-*` de la palette Material (`text-grey-7`, `bg-blue-2`…).

**Cas limite.** `q-mb-sm` apparaît sur quelques `q-skeleton`, où l'espacement appartient au
composant Quasar lui-même. Ne pas étendre l'exception : un nouveau bloc s'espace au token.

### Les couleurs sémantiques de Quasar restent accessibles

`color="primary"`, `text-color="dark"`, `color="negative"` sur un **composant Quasar** sont
légitimes : ce sont des props d'API, pas des classes utilitaires, et
`quasar.variables.scss` les branche sur la palette d'AURA (`$primary: #E07A5F`, la même
couleur que `--brand`).

```vue
<q-btn unelevated no-caps dense color="primary" text-color="dark" label="Appliquer" />
```

En CSS en revanche, on écrit `var(--brand)`, jamais `$primary`.

### Ne jamais inventer un token

**Pourquoi.** Le vocabulaire fermé est ce qui garantit qu'un écran écrit aujourd'hui
ressemble à un écran écrit il y a six mois. Un token inventé fork le système en silence.

**Faire.** S'arrêter et dire : « Il faudrait un cran d'espacement entre `--space-lg` (16) et
`--space-xl` (24). Faut-il l'ajouter à `app.scss`, ou prendre `--space-lg` ? »

**Ne pas faire.** Écrire `--space-xxl: 32px` dans un `<style scoped>` de page, ou tomber sur
`padding: 20px`.

Ça vaut pour **toutes** les familles : couleur, espacement, typographie, radius, motion.

### Les couleurs ont été calibrées

`app.scss` porte, en commentaires, les ratios de contraste et les écarts ΔE de chaque paire —
y compris pour les déficiences de vision des couleurs, et y compris les exceptions assumées.
Modifier une valeur de la palette invalide ce travail : remesurer avant d'y toucher.

## Primitives et classes utilitaires maison

Avant d'écrire du CSS, vérifier que la chose n'existe pas déjà :

| Classe           | Rôle                                              |
| ---------------- | ------------------------------------------------- |
| `.surface-card`  | Le bloc de contenu standard — fond, filet, radius |
| `.section-label` | La légende mono en capitales d'une section        |
| `.status-dot`    | La pastille d'état                                |
| `.font-mono`     | Bascule en JetBrains Mono                         |

Et les composants de `src/components/ui/` — voir `component-selection.md`.
