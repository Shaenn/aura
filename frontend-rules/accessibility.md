# Accessibilité

Cible : **WCAG 2.2 AA**. Ce n'est pas une couche qu'on ajoute à la fin — les règles ci-dessous
sont celles que le code applique déjà, et elles se tiennent en écrivant, pas en repassant.

## Tout élément interactif a un nom accessible

C'est la faute la plus fréquente, et elle touche surtout les boutons d'icône.

```vue
<q-btn flat dense round size="sm" icon="content_copy" aria-label="Copier le chemin" />
<q-input v-model="query" placeholder="Rechercher…" aria-label="Rechercher dans le manuel" />
<SegmentedControl v-model="scope" :options="scopes" aria-label="Portée" />
```

Trois voies, dans cet ordre de préférence : un **libellé visible**, sinon `aria-label`,
sinon `aria-labelledby` pointant l'élément qui nomme.

Un `placeholder` n'est pas un nom accessible : il disparaît dès la première frappe.

Le nom décrit **l'action ou la cible**, pas l'icône. `aria-label="Copier le chemin"`, pas
`aria-label="Icône presse-papiers"`.

## Une icône décorative est masquée

Dès qu'une icône double un texte voisin, elle est du bruit pour un lecteur d'écran :

```vue
<q-icon name="folder" size="18px" aria-hidden="true" />
<span class="pj-name">{{ cell.value }}</span>
```

C'est le cas le plus courant — `src/` en compte 261. Une icône **seule porteuse de sens**
prend au contraire un nom, ou passe dans un `q-btn` qui en porte un.

Même chose pour les pastilles d'état, les séparateurs `chevron_right` d'un fil d'Ariane, les
sigils de marque : `aria-hidden="true"`.

## Jamais la couleur seule

Un état signalé par la seule couleur est perdu pour qui ne la distingue pas. Chaque état
porte un **mot** :

```vue
<span class="status-dot status-dot--live" aria-hidden="true" />
{{ system.connected ? 'connecté' : 'hors ligne' }}
```

Dans la timeline de rejeu, l'état d'un appel d'outil est doublé d'un mot pour cette raison
exacte.

## Tout s'atteint au clavier

- **Tab** parcourt les contrôles dans l'ordre visuel.
- **Entrée** / **Espace** activent.
- **Échap** ferme un dialogue, un tiroir, un panneau — et l'annule plutôt que de le valider.
- Le focus est **visible**. Ne jamais poser `outline: none` sans remplacement.

Ne pas fabriquer de contrôle avec une `<div>` + `@click` : il faudrait ajouter `tabindex`,
`role`, la gestion des touches et l'état désactivé. C'est ce que le composant Quasar fait
déjà.

Attention à `q-tooltip` seul : Quasar ne pose que `mouseenter` / `mouseleave` sur son ancre,
donc l'explication est **inaccessible au clavier**. Quand elle compte, employer `HelpTip`,
dont l'ancre est focusable et pilote le tooltip par `v-model`.

Le lien d'évitement de `MainLayout` (`Aller au contenu`) est le premier élément focusable du
document. Le conserver.

## Les états ARIA suivent l'état réel

```vue
<q-btn :aria-expanded="helpOpen" aria-controls="help-drawer" :aria-label="helpLabel" @click="toggleHelp()" />
```

| Attribut        | Quand                                                          |
| --------------- | -------------------------------------------------------------- |
| `aria-expanded` | Un contrôle qui ouvre ou ferme quelque chose                   |
| `aria-controls` | L'`id` de ce qu'il pilote                                      |
| `aria-current`  | `"page"` sur le segment courant d'un fil d'Ariane ou d'un menu |
| `aria-pressed`  | Un bouton bascule qui reste enfoncé                            |
| `aria-selected` | L'onglet actif d'un jeu d'onglets                              |
| `aria-live`     | Une zone qui change seule et qu'il faut annoncer               |

Un attribut ARIA figé qui ment sur l'état est pire que son absence.

## Ce qui change tout seul s'annonce

Une ligne d'activité qui bouge, un statut qui bascule : `aria-live="polite"`. Un message
d'erreur qui remplace une section : `role="alert"`.

```vue
<div v-if="error" class="pj-state" role="alert">…</div>
```

Ne pas mettre en `aria-live` une zone qui change à chaque tick : un compteur de secondes
annoncé en continu rend l'écran inutilisable.

## Contraste

La palette a été calibrée pour cela — ratios et ΔE annotés dans `app.scss`, exceptions
comprises. Prendre les tokens de texte tels quels : `--text` pour le texte courant, `--muted`
et `--dim` pour le secondaire, `--faint` pour ce qui doit s'effacer. Ne pas fabriquer une
teinte intermédiaire, elle sortirait du calcul sans que rien ne l'indique.

Le texte sur le saumon de marque prend `text-color="dark"` : blanc sur `--brand` passe sous
le seuil.

## Mouvement

Les durées viennent de `--motion-*`. Respecter `prefers-reduced-motion` pour toute animation
autre qu'un changement d'état bref — les pulsations d'activité comprises.
