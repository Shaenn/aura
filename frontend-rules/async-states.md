# États asynchrones

Une section qui charge des données traverse quatre états : **chargement**, **erreur**,
**vide**, **contenu**. Ils forment un cycle, pas quatre écrans indépendants — les traiter
séparément produit des trous (un squelette au chargement, puis une carte blanche quand la
liste est vide).

Règle qui tient le reste : **le chrome de la section reste visible dans tous les états.**
Titre, légende de section, filtres, actions secondaires ne bougent pas. Seul le contenu
dynamique est remplacé. Une page qui perd son titre pendant le chargement se relit
entièrement à chaque cycle.

## L'ordre canonique

```vue
<template>
  <q-page class="pj-page">
    <header class="pj-header">
      <h1>Projets</h1>
    </header>

    <!-- 1. Erreur — avant tout le reste : c'est le seul état qui demande une action -->
    <div v-if="error" class="pj-state" role="alert">
      <q-icon name="error_outline" size="28px" color="negative" aria-hidden="true" />
      <p>{{ error }}</p>
      <q-btn flat no-caps label="Réessayer" @click="refresh" />
    </div>

    <!-- 2. Chargement -->
    <div v-else-if="loading" class="pj-skel">
      <q-skeleton type="rect" height="280px" />
    </div>

    <!-- 3. Vide -->
    <EmptyState v-else-if="!projects.length" message="Je ne vois aucun projet." center />

    <!-- 4. Contenu -->
    <section v-else class="surface-card">…</section>
  </q-page>
</template>
```

## Chargement : un squelette, pas un spinner

**Pourquoi.** Le squelette dit _ce qui_ arrive et réserve la place ; le spinner dit seulement
qu'on attend, et la page saute à l'arrivée des données.

```vue
<div v-if="loading" class="sd-loading">
  <q-skeleton type="rect" height="90px" />
  <q-skeleton type="rect" height="140px" />
  <q-skeleton type="rect" height="120px" />
</div>
```

Les hauteurs sont **calquées sur le contenu réel**. Un squelette de 40 px devant un bloc de
280 px ne réserve rien.

`q-spinner` reste bon pour une action ponctuelle en cours — et dans ce cas il passe par la
prop `loading` d'un `q-btn`, pas par un composant posé à côté.

**Cas limite : le rechargement.** Quand des données sont déjà affichées et qu'on rafraîchit,
ne pas les remplacer par un squelette — on ferait clignoter un écran qui allait bien. C'est
la raison du `v-if="loading && !data"` de `ProjectResourcesPanel` : le squelette n'est que
pour le **premier** chargement.

## Erreur : dire, et proposer une suite

Une erreur affichée porte `role="alert"` et suit la charte de voix : ce qu'AURA voulait
faire, ce qui a échoué, ce qui reste possible. Jamais « Une erreur est survenue. »

Quand une action peut être retentée, le bouton est dans l'état d'erreur — pas ailleurs.

**Erreur d'action ≠ erreur de chargement.** Une action qui échoue (supprimer, restaurer,
appliquer) ne remplace pas la section : elle passe par `useNotify`.

```ts
const { notifyError, notifyDone } = useNotify()

try {
  await removeBackup(id)
  notifyDone('Version supprimée.')
} catch (e) {
  notifyError(e, "Je n'ai pas pu supprimer cette version")
}
```

`notifyError` prend **ce qu'AURA tentait**, à la première personne et sans point final. Le
détail technique vient de l'exception et part en `caption` — il vient du serveur, il n'est
pas dans la voix d'AURA, et le distinguer est plus honnête que de le fondre dedans.

## Vide : `EmptyState`, une phrase

```vue
<EmptyState message="Je ne vois aucun agent personnel." />
<EmptyState message="Je n'ai enregistré aucune session pour ce dossier." center />
```

Un état vide d'AURA tient en **une phrase**, à la première personne. C'est un parti pris de
l'application : le motif riche (icône + titre + corps + bouton) n'est pas employé ici.

Un état vide qui mérite vraiment une action se compose par le slot par défaut :

```vue
<EmptyState center>
  Je ne vois aucune sauvegarde.
  <q-btn flat no-caps label="Actualiser" @click="refresh" />
</EmptyState>
```

Props : `center` pour un panneau (pas pour une ligne dans une liste), `pad` (`none` quand le
conteneur porte déjà la respiration).

**Vide ≠ erreur.** Un dossier qui existe et ne contient rien n'est pas une panne. Un compteur
à zéro n'est pas un échec, et le dire sur un ton d'erreur serait faux.

**Vide ≠ aucun résultat de filtre.** « Je ne vois aucun projet » et « aucun projet ne
correspond à ce filtre » sont deux phrases différentes. Pour une table, c'est `q-table` qui
gère le second cas — voir `table-filtering.md`.
