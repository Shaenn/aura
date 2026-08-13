# Validation de formulaire

La validation passe par `q-form` et les `:rules` natives de Quasar. Aucune bibliothèque
externe. `q-form` orchestre déjà tout : il exécute les règles de chaque champ à la
soumission, bloque `@submit` tant qu'une règle échoue, et met le focus sur le premier champ
en faute.

## Le motif

```vue
<q-form ref="mkForm" class="mk-add" @submit.prevent="openAddCommand">
  <q-input
    v-model="mkSource"
    dense
    outlined
    hide-bottom-space
    placeholder="owner/repo · https://…/repo.git · ./chemin-local"
    aria-label="Source de la marketplace"
    :rules="[(v) => !!v?.trim() || 'Source requise']"
  />
  <q-btn type="submit" unelevated no-caps dense color="primary" text-color="dark" label="Ajouter" />
</q-form>
```

Quatre points, tous nécessaires :

- **`@submit.prevent`** — le `.prevent` évite la navigation native du formulaire.
- **`type="submit"`** sur le bouton — c'est ce qui déclenche la validation de `q-form` et
  fait marcher la touche Entrée. Un `@click` sur un bouton ordinaire court-circuite tout.
- **`hide-bottom-space`** — sans lui, la mise en page saute de la hauteur d'une ligne quand
  le message d'erreur apparaît.
- **Une règle rend `true` ou un message.** Jamais `false` seul : l'utilisateur verrait un
  champ rouge sans savoir ce qu'on lui reproche.

## Écrire une règle

Une règle est une fonction qui reçoit la valeur et rend `true` ou un message.

```ts
:rules="[(v) => !!v?.trim() || 'Nom requis']"
:rules="[(v) => !!v?.trim() || 'Commande requise']"
:rules="[(v) => !!v?.trim() || 'URL requise']"
```

Le message est **court, nominal, sans point final** — c'est une étiquette de champ, pas une
phrase d'AURA. La charte de voix range explicitement les libellés de champs parmi les
surfaces où AURA se tait.

Pour une règle réutilisée, la factoriser plutôt que de la recopier. `SettingsPage` et
`McpPage` partagent ainsi `stringArray()` :

```vue
<q-input :rules="stringArray(['permissions', 'allow'])" />
```

## Ne pas désactiver le bouton de soumission

**Pourquoi.** Un bouton grisé cache la raison du blocage. Laisser la soumission possible fait
apparaître les messages, qui disent quoi corriger.

C'est différent d'une action qui **n'a rien à faire** : le bouton d'application d'un diff
sans ligne modifiée porte bien `:disable="!lines.length"`, parce qu'il n'y a pas d'erreur à
révéler — il n'y a simplement rien à appliquer.

## Erreur de champ, erreur de formulaire, erreur d'action

Trois choses distinctes, trois emplacements :

| Nature                                 | Où                                                   |
| -------------------------------------- | ---------------------------------------------------- |
| Une valeur est invalide                | Sous son champ, via `:rules`                         |
| Une combinaison de champs est invalide | Un message dans le formulaire, près de la soumission |
| L'écriture a échoué côté serveur       | `notifyError` — voir `async-states.md`               |

Ne jamais afficher une erreur serveur sous un champ : elle ne vient pas de sa valeur, et le
message ne disparaîtrait pas en le corrigeant.

## Les écritures passent par le diff

Dans AURA, un formulaire qui modifie un fichier `.claude` ne l'écrit pas à la soumission : il
**propose**. La soumission valide, puis ouvre `ConfirmDiffDialog`, qui montre le diff avant
d'appliquer.

Une pastille `non enregistré` signale l'écart avec le disque ; **Proposer…** ouvre le diff ;
**Recharger** abandonne. Rien ne part au fil de la saisie, nulle part.

Un nouveau formulaire d'écriture qui n'emprunterait pas ce chemin serait un contournement du
contrat central de l'application, pas un raccourci.
