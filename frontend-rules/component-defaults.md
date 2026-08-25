# Props par défaut

`component-selection.md` décide **quel** composant. Ce fichier décide **comment** le
configurer, à chaque usage. Ces défauts ne sont pas une convention aspirationnelle : ce sont
les props qu'on trouve sur toutes les instances existantes.

Diverger demande une raison tenant au contexte, pas une préférence.

## Champs de saisie

**Toujours `dense outlined`.** AURA est dense par nature — beaucoup d'information par écran —
et le contour est la forme retenue partout.

```vue
<q-input v-model="query" outlined dense clearable debounce="120" placeholder="Rechercher…" aria-label="Rechercher dans le manuel">
  <template #prepend><q-icon name="search" /></template>
</q-input>
```

| Prop                | Quand                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| `dense` `outlined`  | Toujours.                                                                              |
| `clearable`         | Champ de filtre ou de recherche.                                                       |
| `hide-bottom-space` | Champ validé — évite le sursaut de mise en page quand le message apparaît.             |
| `debounce="120"`    | Champ qui déclenche un filtrage à la frappe.                                           |
| `autogrow`          | Avec `type="textarea"`, pour une zone de message.                                      |
| `autofocus`         | Le champ principal d'un écran qu'on ouvre pour écrire (composeur de l'Atelier).        |
| `aria-label`        | Dès qu'il n'y a pas de `label` visible — un `placeholder` n'est pas un nom accessible. |

Pour un `q-select`, ajouter `options-dense` : la liste déroulante doit avoir la densité du
reste.

```vue
<q-select v-model="newEvent" :options="EVENTS" dense outlined options-dense aria-label="Événement" />
```

## Boutons

### Bouton d'icône

**`flat dense round size="sm"`**, plus un `aria-label`.

```vue
<q-btn flat dense round size="sm" icon="content_copy" aria-label="Copier le chemin" @click="copy" />
```

### Paire d'actions d'un dialogue

L'action secondaire est **plate**, la principale **pleine**. Les deux portent `no-caps` :
AURA n'écrit pas en capitales, la charte de voix l'interdit et le défaut Material de Quasar
s'y oppose.

```vue
<q-card-actions align="right">
  <q-btn flat no-caps dense label="Annuler" @click="open = false" />
  <q-btn
    unelevated
    no-caps
    dense
    color="primary"
    text-color="dark"
    :loading="applying"
    :disable="!lines.length"
    label="Appliquer"
    @click="confirm"
  />
</q-card-actions>
```

Deux points qui comptent :

- **`text-color="dark"` sur le bouton de marque.** Le saumon `--brand` est clair : du texte
  blanc dessus tombe sous le seuil de contraste. C'est la raison de la prop, pas un goût.
- **`:disable` quand l'action n'a rien à faire.** Le bouton d'application d'un diff sans
  ligne modifiée reste inactif — il dirait sinon qu'il va se passer quelque chose.

`no-caps` s'applique à **tout** `q-btn` portant un `label`.

## Bascules

**`dense size="sm"`**, avec un `label` visible.

```vue
<q-toggle v-model="autoScroll" dense size="sm" label="Auto-défilement" />
```

## Squelettes

`type="rect"` et une **hauteur proche du contenu réel**, pour que la page ne saute pas quand
les données arrivent.

```vue
<q-skeleton type="rect" height="280px" />
```

`type="text"` avec un `width` en pourcentage pour une valeur seule dans une tuile :

```vue
<p v-if="loading" class="dg-tile-value"><q-skeleton type="text" width="70%" /></p>
```

## Tables

**`flat`** toujours — la table vit déjà dans une carte, une élévation par-dessus doublerait
la profondeur. Et `:rows-per-page-options="[15, 30, 50, 0]"`, le `0` valant « tout ».

```vue
<q-table :rows="projects" :columns="columns" row-key="slug" :loading="loading" :filter="filter" flat :rows-per-page-options="[15, 30, 50, 0]" />
```

Ajouter `dense` quand la table est un sous-bloc d'une page déjà chargée (liste des sessions
d'un projet), pas quand elle est le contenu principal de l'écran.

## Icônes

Une icône **décorative** — c'est-à-dire doublée par un texte à côté — prend
`aria-hidden="true"`. C'est le cas le plus fréquent : on en compte 261 dans `src/`.

```vue
<q-icon name="folder" aria-hidden="true" />
<span>{{ project.name }}</span>
```

Une icône **seule porteuse de sens** prend un nom accessible, ou passe dans un `q-btn` qui en
porte un.

## Tooltips

Le contenu d'un `q-tooltip` est **téléporté dans `<body>`**. Les styles `scoped` de la page
appelante ne l'atteignent donc pas. Deux voies : styliser depuis un composant dédié (c'est
ce que font `HelpTip` et `LabelValueRow`, dont les styles scoped sont enregistrés
globalement par Vue), ou accepter le style par défaut.

Voir `quasar-specifics.md`.
