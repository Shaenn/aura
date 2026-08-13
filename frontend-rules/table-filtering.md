# Filtrer une table

Le filtre d'une table appartient à la table. Il se pose dans le slot `#top` et pilote le
mécanisme natif de `q-table` (`:filter` + `:filter-method`).

**Pourquoi.** Lier un tableau `filteredRows` calculé à la main sur `:rows` court-circuite la
machinerie de `q-table` : la pagination compte alors les mauvaises lignes, et les slots
`no-data` / `loading` cessent d'être cohérents. Le filtre natif garde tout le cycle aligné.

## Le motif

```vue
<q-table
  :rows="projects"
  :columns="columns"
  row-key="slug"
  :loading="loading"
  :filter="filter"
  :filter-method="filterProjects"
  flat
  :rows-per-page-options="[15, 30, 50, 0]"
  @row-click="(_e, row) => open(row.slug)"
>
  <template #top>
    <div class="pj-table-top">
      <span class="section-label">Tous les projets</span>
      <q-space />
      <q-input
        v-model="filter"
        dense
        outlined
        clearable
        debounce="150"
        placeholder="Filtrer par nom ou chemin…"
        aria-label="Filtrer les projets"
      >
        <template #prepend><q-icon name="search" aria-hidden="true" /></template>
      </q-input>
    </div>
  </template>
</q-table>
```

## La méthode de filtrage

Pure, sans effet de bord, et elle rend les lignes telles quelles quand le terme est vide.

```ts
function filterProjects(rows: readonly ProjectSummary[], term: string): ProjectSummary[] {
  const q = term.trim().toLowerCase();
  if (!q) return rows as ProjectSummary[];
  return rows.filter((p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
}
```

Points qui comptent :

- **`trim()` et `toLowerCase()` une seule fois**, hors de la boucle.
- **Chercher dans ce que l'utilisateur voit _et_ dans ce qu'il connaît.** Ici le nom affiché
  et le chemin complet : quelqu'un qui cherche un projet tape souvent un fragment de chemin.
  Le placeholder annonce les deux — « Filtrer par nom ou chemin… ».
- **Le terme vide rend tout**, sans copie ni tri.

Sans `:filter-method`, `q-table` fait une recherche sur toutes les colonnes visibles. C'est
souvent suffisant : ne fournir une méthode que si le champ recherché n'est pas affiché, ou si
la recherche par défaut donne trop de bruit.

## Le champ

`dense outlined clearable`, un `debounce` de 120 à 150 ms, une icône `search` en `#prepend`
marquée `aria-hidden`, et un `aria-label` — le `placeholder` n'est pas un nom accessible.

## Aucun résultat

C'est `q-table` qui le gère, via son slot `no-data`. Ne pas le confondre avec l'état vide de
la section : « je ne vois aucun projet » et « aucun projet ne correspond à ce filtre » sont
deux situations différentes, et la seconde a un remède immédiat — vider le filtre.

## Quand ne pas prendre une table

Un filtre apparaît quand la liste devient longue — au-delà de cinq entrées sur l'écran des
sessions, par exemple. En deçà, il occupe de la place sans rien résoudre.

Et si les éléments ne sont pas comparables colonne par colonne, ce n'est pas une table : une
`<ul>` sémantique et des composants à soi valent mieux qu'un `q-table` détourné. Voir
`html-semantics.md`.

## Hors périmètre

Le filtrage côté serveur (`@request`, pagination serveur) est un autre sujet. AURA filtre
côté client : les volumes affichés le permettent, et le BFF renvoie déjà des ensembles
bornés.
