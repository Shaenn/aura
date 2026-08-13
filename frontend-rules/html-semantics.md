# Sémantique HTML

Un composant Quasar ne dispense pas d'une structure correcte. `q-card` rend une `<div>` ;
`q-item` rend une `<div>` ; `q-page` rend une `<main>`. Ce que le document signifie, c'est
vous qui l'écrivez.

Le code d'AURA le fait déjà largement — 76 `<section>`, 67 `<header>`, 54 `<ul>`, 45 `<h2>`
dans `src/`. Un nouvel écran s'aligne dessus.

## Un `<h1>` par page, sans saut de niveau

**Pourquoi.** Un lecteur d'écran parcourt une page par son plan. Un niveau sauté rend une
section inatteignable par la navigation par titres.

```vue
<q-page class="pj-page">
  <header class="pj-header">
    <h1>Projets</h1>
  </header>

  <section class="surface-card">
    <h2 class="section-label">Tous les projets</h2>
    …
  </section>
</q-page>
```

- `h1` → `h2` → `h3`. Jamais `h1` → `h3`.
- Le niveau vient de la **place dans le plan**, pas de la taille voulue. Un titre qui doit
  paraître petit prend `.section-label`, il ne devient pas un `<h3>` pour autant.
- `q-page` rendant déjà `<main>`, ne pas en ajouter un second.

## Une liste est une liste

Tout ce qui se compte s'écrit `<ul>` / `<li>` — ou `<ol>` quand l'ordre porte du sens, comme
les actions du diagnostic classées par impact.

```vue
<ul class="mk-list">
  <li v-for="m in marketplaces" :key="m.name" class="mk-item">…</li>
</ul>
```

Une suite de `<div>` répétées n'annonce ni le nombre d'éléments, ni la position dans la
liste. Ne pas remplacer une liste par des cartes empilées : c'est **aussi** une liste, avec
des cartes dedans.

## `<section>`, `<header>`, `<nav>`, `<article>`

- `<section>` — un bloc de contenu qui porte un titre. Une `<section>` sans titre est
  probablement une `<div>`.
- `<header>` — l'en-tête d'une page ou d'une carte.
- `<nav>` — un groupe de liens de navigation, **avec un `aria-label`** dès qu'il y en a
  plusieurs sur la page (`aria-label="Fil d'Ariane"`).
- `<article>` — un contenu autonome, qui garderait son sens sorti de son contexte : un tour
  de conversation, un rapport de sous-agent.

## Un tableau de données est un `<table>`

`q-table` s'en charge. Ne pas simuler une table avec des `<div>` en grille : les en-têtes de
colonnes ne seraient plus associés aux cellules, et une cellule lue isolément perdrait son
sens.

À l'inverse, ne pas employer une table pour de la mise en page.

## Un contrôle est associé à son libellé

```vue
<label class="srv-field">
  <span class="srv-label">Nom</span>
  <q-input v-model="fName" dense outlined placeholder="ex. mon-serveur" />
</label>
```

L'imbrication dans un `<label>` suffit. Sinon, `label` sur le composant Quasar, ou un
`aria-labelledby` pointant l'élément qui le nomme.

Un `placeholder` **n'est pas** un libellé : il disparaît à la saisie.

## Le texte porte le sens, pas la mise en forme

- Une abréviation utile prend `<abbr>`, un chemin ou une commande prennent `<code>`.
- Ne pas employer `<b>` / `<i>` pour de l'emphase sémantique : `<strong>` et `<em>`.
- Un saut de ligne visuel ne se fait pas avec `<br>` répétés mais avec des paragraphes.

## Le lien d'évitement

`MainLayout` ouvre sur un lien d'évitement, premier élément focusable du document :

```vue
<a href="#main-content" class="skip-link">Aller au contenu</a>
```

Il n'est visible qu'au focus. Toute nouvelle mise en page qui remplacerait `MainLayout` doit
le reprendre, et exposer une cible `#main-content`.

## Lien ou bouton

- Ça **navigue** → `<router-link>` ou `<a>`. Ça doit être ouvrable dans un nouvel onglet.
- Ça **agit** → `q-btn`.

Un `q-btn` qui fait `router.push` prive du clic milieu et du menu contextuel. Une `<a>` qui
supprime une ressource ment sur ce qui va se passer.
