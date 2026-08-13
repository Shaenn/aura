# Choisir un composant

Deux règles avant tout le reste :

1. **Jamais d'élément natif brut** pour un contrôle — ni `<button>`, ni `<input>`, ni
   `<select>`, ni `<textarea>`. Le composant Quasar porte le focus, le clavier, l'état
   désactivé et le thème.
2. **Jamais une prop qui n'existe pas.** Une prop inventée est silencieuse : Vue la passe en
   attribut HTML, le composant l'ignore, et le comportement attendu n'arrive jamais. En cas
   de doute, vérifier l'API de Quasar.

## Regarder d'abord dans `src/components/ui/`

Ces primitives existent parce que leur motif était recopié partout. Les réutiliser plutôt
que de reconstruire leur markup.

| Primitive          | Quand                                                             |
| ------------------ | ----------------------------------------------------------------- |
| `EmptyState`       | Tout « rien à montrer ». Voir `async-states.md`.                  |
| `FormSection`      | Un contrôle et sa légende, empilés (avec indice) ou en ligne.     |
| `SegmentedControl` | Choisir **une** valeur parmi 2 à 4, toutes visibles.              |
| `LabelValueRow`    | Une ligne clé / valeur, y compris dans un tooltip téléporté.      |
| `CopyButton`       | Copier une valeur, avec retour visuel temporaire.                 |
| `HelpTip`          | Un libellé qui explique ce qu'il désigne, atteignable au clavier. |
| `LottieView`       | Une animation Lottie.                                             |

## Intention → composant

### Décider quelque chose de conséquent → `q-dialog`

Le dialogue bloque : c'est ce qui garantit qu'on ne rate pas la décision. C'est le bon
support pour une confirmation d'écriture, une question à choix, une création de ressource.

```vue
<q-dialog v-model="open">
  <q-card class="cd-card">
    <q-card-section>…</q-card-section>
    <q-card-actions align="right">
      <q-btn flat no-caps dense label="Annuler" @click="open = false" />
      <q-btn unelevated no-caps dense color="primary" text-color="dark" label="Appliquer" @click="confirm" />
    </q-card-actions>
  </q-card>
</q-dialog>
```

Voir `design-patterns.md` pour l'ordre et le style de la paire de boutons.

**Ne pas** employer une bannière ou un encart pour une décision bloquante : rien n'oblige à
la traiter, et on continue de travailler à côté.

**Exception d'AURA, à connaître.** Une demande de permission dans l'Atelier n'est **pas** un
dialogue : c'est une carte posée au-dessus de la zone de saisie. Motif délibéré — c'est ce
qui bloque l'agent, donc la seule chose à faire ; un modal par-dessus la conversation
cacherait précisément le contexte dont on a besoin pour trancher. Une question à choix, elle,
ouvre bien un dialogue, parce qu'elle porte des maquettes à comparer.

### Contexte latéral qu'on consulte en travaillant → `q-drawer`

Ne bloque pas, ne consomme pas le flux de la page. C'est ce que fait le tiroir d'aide
(`HelpDrawer`) et le tiroir de contexte sous 1 280 px.

### Détail repliable dans le flux → `q-expansion-item`, ou un pli maison

Pour du contenu qui reste à sa place. Attention au coût : dans la timeline de rejeu, les
appels d'outil sont repliés **et non montés** — la coloration syntaxique et le Markdown sont
tout le prix de l'écran. Un pli qui monte son contenu d'avance sur une liste de trois cents
éléments est une faute de performance, pas un détail.

### Choisir une valeur parmi quelques-unes, toutes visibles → `SegmentedControl`

```vue
<SegmentedControl v-model="scope" :options="scopes" aria-label="Portée" />
```

Au-delà de quatre options, ou si les libellés sont longs : `q-select`.

### Bascule à effet immédiat → `q-toggle`

Un `q-toggle` agit **tout de suite** (auto-défilement, suivre le direct, thème). Une valeur
qu'on **édite** avant d'enregistrer prend un `SegmentedControl`. Cette distinction est une
règle du projet, pas une préférence d'auteur.

### Saisie de texte → `q-input`

Jamais `<input>` ni `<textarea>`. Pour un champ multiligne : `type="textarea"` + `autogrow`.

### Action d'icône seule → `q-btn` + `aria-label`

```vue
<q-btn flat dense round size="sm" icon="content_copy" aria-label="Copier le chemin" />
```

Un bouton d'icône sans nom accessible est invisible pour un lecteur d'écran. C'est la faute
la plus fréquente sur ce type de contrôle.

### Explication au survol → `q-tooltip`, ou `HelpTip`

`q-tooltip` seul ne s'ouvre **qu'à la souris** : Quasar ne pose que `mouseenter` /
`mouseleave` sur son ancre. Si l'explication compte, employer `HelpTip`, dont l'ancre est
focusable et pilote le tooltip par `v-model`.

### Liste de données comparables, triable ou filtrable → `q-table`

Voir `table-filtering.md`. Pour une liste de cartes hétérogènes, un `<ul>` sémantique et des
composants à soi valent mieux qu'une table détournée.

### Attente → `q-skeleton`, pas `q-spinner`

Voir `async-states.md`. Le squelette dit _ce qui_ arrive ; le spinner dit seulement qu'on
attend. `q-spinner` reste bon pour une action ponctuelle en cours (dans un bouton, via sa
prop `loading`).

## Ce qu'on n'utilise pas

`q-notify` en flux principal, `q-banner` pour une décision, `q-btn-dropdown` pour une
navigation. Si un besoin semble les appeler, il vaut mieux le signaler que d'introduire un
motif que le reste de l'application ne porte pas.
