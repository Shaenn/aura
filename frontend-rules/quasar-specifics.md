# Particularités Quasar

Le fourre-tout des mécanismes propres à Quasar : plugins, thème, téléportation, mode SPA. Ne
double pas `design-tokens.md` ni `component-selection.md` — complète ce qu'ils ne couvrent
pas.

## Plugins enregistrés

Quatre, déclarés dans `quasar.config.ts` :

```ts
framework: {
  plugins: ['Notify', 'Dialog', 'Loading', 'Dark'],
}
```

Employer l'API d'un plugin non enregistré produit une erreur d'exécution. En ajouter un est
une décision : le signaler plutôt que de l'ajouter en passant.

## Thème sombre

Le sombre est le **défaut** d'AURA, le clair est l'exception. Le plugin `Dark` bascule
`body--dark` / `body--light`, et `app.scss` définit la palette sombre dans `:root` puis
l'override sous `body.body--light`.

La bascule appartient au store `settings` :

```ts
const settings = useSettingsStore()
settings.darkMode = !settings.darkMode // le store fait Dark.set()
```

- **Ne jamais manipuler `body--dark` directement**, ni stocker une copie de l'état.
- **Ne jamais lire le thème pour choisir une couleur** en TypeScript : les tokens CSS le font
  déjà. Un `isDark ? '#fff' : '#000'` est le signe qu'un token manque.
- La préférence est chargée **depuis le BFF** par `boot/settings.ts` avant le premier rendu.
  Rien n'est gardé dans le navigateur, et il n'y a pas de flash au chargement. Ne pas
  réintroduire de `localStorage`.

Exception connue : `SegmentedControl` lit `$q.dark.isActive`, parce qu'il passe des couleurs
à `q-btn-toggle` par des props Quasar, hors de portée du CSS. C'est encapsulé là, exprès —
ne pas répandre le motif.

`useChartTokens` joue le même rôle pour Chart.js, qui dessine dans un canvas et ne voit pas
les custom properties.

## Contenu téléporté

`q-tooltip`, `q-dialog` et `q-menu` rendent leur contenu dans `<body>`, hors de l'arbre du
composant. Conséquence : **les styles `scoped` de la page appelante ne les atteignent pas.**

Vue enregistre en revanche les styles scoped **globalement**. Un composant dédié peut donc
styliser son propre contenu téléporté — c'est ce que font `HelpTip` et `LabelValueRow`.

Ne pas contourner avec `:deep()` depuis la page appelante : ça marche jusqu'au jour où deux
tooltips coexistent.

## Mode SPA

Le build est une SPA servie par le BFF. Deux conséquences :

- Pas de rendu serveur : aucun code de composant ne doit supposer un contexte Node.
- Toute route inconnue retombe sur `index.html`. Le catch-all `/:catchAll(.*)*` reste **en
  dernier** dans `routes.ts`.

## Notifications

Toujours via `useNotify`, jamais `$q.notify` en direct :

```ts
const { notifyError, notifyDone, notifyWarn } = useNotify()
notifyError(e, "Je n'ai pas pu supprimer cette version")
```

Le composable applique la charte de voix — ce qu'AURA tentait dans le message, le détail
technique en `caption`, position en haut. Un `$q.notify` posé à la main rouvre les treize
variantes divergentes que ce composable a supprimées.

## Icônes

`material-icons` via `@quasar/extras`. Le nom passe en prop, jamais en ligature dans le
contenu :

```vue
<q-icon name="folder" aria-hidden="true" />
```

## Polices

`Inter` pour l'interface, `JetBrains Mono` pour le monospace, chargées par `boot/fonts.ts`
depuis `@fontsource`. Aucune police n'est chargée depuis un CDN — AURA ne fait aucun appel
sortant, et c'est une propriété du produit, pas une commodité.

Pour du monospace ponctuel, la classe `.font-mono`.

## Pinia

Deux stores : `system` (état du BFF, version, sessions actives) et `settings` (préférences).
Un store porte de l'état **partagé entre écrans**. L'état local d'une page reste dans la
page ; un composable (`useLiveSession`, `useExpandAll`) porte la logique réutilisable sans
état global.

## Vérification des types

`pnpm typecheck` ouvre la marche par `vue-tsc` : **il couvre `src/`**, puis `server/` et
`test/` par `tsc`. `vite-plugin-checker` continue de typer le front pendant `pnpm dev`,
pour le retour immédiat, mais la ligne de commande ne laisse plus rien dehors.

Un point demeure, et il ne se voit pas au lint : ESLint n'obtient pas de types complets sur
les `.vue`. Une règle typée qui retirerait une assertion `as` sur un composant monofichier
ne serait rattrapée par rien — ni par le lint, ni par `tsc`, qui ne lit pas les `.vue`.
D'où la règle : sur un `--fix` de masse, relever `vue-tsc --noEmit` avant ET après.
