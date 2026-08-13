# Motifs composites

Là où `component-selection.md` choisit **un** composant, ce fichier décrit des compositions
récurrentes. Les appliquer telles quelles ; ne pas les redessiner localement.

## Paire d'actions : secondaire d'abord, principale ensuite

**Pourquoi.** Une position fixe s'apprend une fois. Une paire inversée d'un écran à l'autre
oblige à relire les libellés à chaque fois, et c'est exactement le moment où on ne veut pas
se tromper.

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

- Alignées à droite, **secondaire plate**, **principale pleine**.
- Le verbe de la principale nomme l'acte : `Appliquer`, `Restaurer`, `Ajouter` — jamais
  `OK`, jamais `Valider`.
- L'action destructrice prend `color="negative"`, à la même place.
- `:loading` pendant l'aller-retour serveur ; `:disable` quand il n'y a rien à faire.

## Le titre est le fil d'Ariane

AURA n'affiche pas un gros titre de page en haut du contenu. La barre d'état porte la marque,
puis le fil d'Ariane, et c'est lui qui situe l'écran.

```vue
<nav v-if="crumbs.length" class="sb-crumbs" aria-label="Fil d'Ariane">
  <template v-for="(c, i) in crumbs" :key="i">
    <q-icon name="chevron_right" size="16px" aria-hidden="true" />
    <router-link v-if="c.to" :to="c.to" class="sb-crumb sb-crumb--link">{{ c.label }}</router-link>
    <span v-else class="sb-crumb" aria-current="page">{{ c.label }}</span>
  </template>
</nav>
```

Un écran qui connaît un libellé dynamique — nom de projet, identifiant de session — pousse sa
propre traînée :

```ts
setBreadcrumbs([{ label: 'Projets', to: { name: 'projects' } }, { label: project.name }]);
```

Le dernier segment **n'a pas de `to`** : c'est la page courante, elle porte `aria-current="page"`
et ne se clique pas. `MainLayout` remet la traînée par défaut à chaque navigation ; un écran
n'a donc pas à nettoyer derrière lui.

Une page garde bien un `<h1>` — voir `html-semantics.md` — même quand le fil d'Ariane porte
l'orientation visuelle.

## Légende de section

Une section se coiffe d'une légende mono en capitales, pas d'un gros titre.

```vue
<section class="surface-card">
  <h2 class="section-label">Tous les projets</h2>
  …
</section>
```

`.section-label` est une classe utilitaire maison. Quand la légende accompagne un contrôle,
c'est `FormSection` qui fait la paire :

```vue
<FormSection label="Portée" hint="S'applique à toutes les sessions.">
  <SegmentedControl v-model="scope" :options="scopes" aria-label="Portée" />
</FormSection>
```

## Pastille d'état : jamais la couleur seule

```vue
<span class="status-dot status-dot--pulse status-dot--live" aria-hidden="true" />
{{ system.connected ? 'connecté' : 'hors ligne' }}
```

La pastille est **décorative** — elle double un mot, elle ne le remplace pas. Un état signalé
par la seule couleur est perdu pour qui ne la distingue pas.

La pulsation est réservée à ce qui **change tout seul** : une session au travail, une
attente. Un fichier qui existe prend un point fixe. Faire respirer un état statique fait
croire à une activité.

## Muet quand il n'y a rien à dire

Un compteur à zéro affiché en permanence n'apprend rien et dilue ce qui l'entoure. Le nombre
de sessions actives disparaît quand il vaut zéro :

```vue
<router-link v-if="activeCount" :to="{ name: 'sessions' }">…</router-link>
```

Corollaire : ne pas annoncer ce qui est déjà à l'écran. « Voici vos projets » sous une liste
de projets est du bruit. Voir la règle de silence dans `docs/voix.md`.

## Copier une valeur

`CopyButton` plutôt qu'un `q-btn` maison : il gère l'écriture presse-papiers, le retour
visuel temporaire, et le cas où le presse-papiers est indisponible — auquel cas il **ne dit
rien** plutôt que d'affirmer une copie qui n'a pas eu lieu.

```vue
<CopyButton :text="project.path" label="Copier le chemin" />
```

## Un chiffre s'explique

Un indicateur chiffré porte son explication, via `HelpTip` ou un `q-tooltip` sur une ancre
focusable. `what` dit ce que la chose désigne ; `reading` dit comment lire le chiffre quand
ça demande une seconde phrase.

Et un chiffre dit toujours **son statut** : mesuré ou estimé. C'est une règle du produit —
le diagnostic la tient page par page, un nouvel écran ne s'en dispense pas.
