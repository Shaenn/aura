# La voix d'AURA

AURA — _Assistant Unifié des Ressources Agentiques_ — n'est pas un outil qui affiche des
messages : c'est une présence qui vous assiste. Ce document dit comment elle parle, pour que
la personnalité survive aux changements futurs au lieu d'être une passe unique.

Une règle tient tout le reste : **AURA parle à la première personne là où il y a une
relation, et reste nominale là où il n'y a que de la donnée.** Un majordome vous répond ;
il ne renomme pas les objets de la maison.

---

## Où AURA parle d'elle-même

Ces surfaces sont des moments où quelqu'un s'adresse à vous. Elles passent à la première
personne du singulier, au présent, en vous vouvoyant.

| Surface          | Avant                                                   | Après                                                                     |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| État vide        | `Aucune session Claude Code active.`                    | `Je ne vois aucune session active.`                                       |
| Perte de lien    | `Le lien avec le BFF est rompu.`                        | `J'ai perdu le contact avec le serveur.`                                  |
| Échec d'écriture | `Impossible d'écrire settings.json`                     | `Je n'ai pas pu écrire settings.json : permission refusée.`               |
| Confirmation     | `Confirmer les modifications`                           | `Je vais remplacer 3 lignes dans settings.json.`                          |
| Recommandation   | `Réduire la taille du contexte.`                        | `Je vous conseille d'alléger le contexte : il occupe 68 % de la fenêtre.` |
| Accueil          | `Poste de pilotage de votre environnement Claude Code.` | `Trois sessions ont tourné cette nuit. Rien d'anormal.`                   |

## Où AURA se tait

Ces surfaces nomment des choses, elles ne s'adressent à personne. Elles restent telles
quelles — y toucher ajouterait du bruit sans ajouter de sens.

- En-têtes de colonnes et libellés de champs (`Nom`, `Dernière session`, `Portée`).
- Libellés de boutons et d'actions (`Ouvrir`, `Démarrer`, `Restaurer`, `Annuler`).
- Titres d'écrans (`src/router/titles.ts`) et fil d'Ariane.
- `aria-label` descriptifs d'un contrôle (`Fermer l'aide`, `Passer en mode clair`).
- Étiquettes de données brutes : chemins, identifiants, versions, unités.

## Invariants

Ils étaient déjà ceux de l'application avant AURA. L'incarnation ne les annule pas — elle
s'ajoute par-dessous.

- Vouvoiement. AURA est proche, pas familière.
- Aucun emoji, aucun point d'exclamation, aucune majuscule d'insistance.
- Phrases courtes, affirmatives, terminées par un point. Le tiret cadratin pour l'incise.
- Le français pour la voix ; l'anglais reste pour les termes du domaine Claude Code
  (`Skills`, `Hooks`, `MCP`, `Plugins`, `Agents`) et le vocabulaire maison pour le reste
  (`Atelier`, `Manuel`, `Rejeu`, `Vue d'ensemble`).
- AURA ne s'excuse pas et ne se félicite pas. Elle constate.

## Règle de silence

AURA ne parle pas d'elle-même quand elle n'a rien à dire. Le « je » doit porter une
information que la formulation impersonnelle ne portait pas — le plus souvent : _qui_ a agi,
_ce qui a été tenté_, ou _ce qui est recommandé_.

À proscrire :

- `J'ai chargé la liste des projets.` — le chargement n'est pas une nouvelle.
- `Voici vos projets.` — ils sont déjà à l'écran.
- `Je vous affiche le diff.` — l'affichage n'est pas un acte à annoncer.

À l'inverse, le « je » est justifié dès qu'AURA a _tenté_ quelque chose, _renoncé_ à quelque
chose, ou _constaté_ quelque chose que l'utilisateur ne voit pas encore.

## Erreurs

Une erreur dit trois choses dans cet ordre : ce qu'AURA voulait faire, ce qui a échoué, et
ce qui reste possible.

> `Je n'ai pas pu écrire ~/.claude/settings.json : permission refusée. Le fichier n'a pas
été modifié.`

Jamais de rejet sur l'utilisateur (`Vous n'avez pas…`), jamais de fatalisme
(`Une erreur est survenue.`). Si le message vient du serveur, c'est le serveur qu'il faut
corriger, pas l'affichage : voir `server/diagnostics/` et les routes.

## Le manuel

Dans `src/help/sections/*.md`, la voix se partage :

- ce qu'**AURA** fait → première personne : « Je prévisualise chaque écriture avant de
  l'appliquer. » ;
- ce que **Claude Code** fait → voix neutre descriptive, inchangée : « Un hook s'exécute
  avant chaque appel d'outil. »

La frontière est celle de la responsabilité. AURA n'endosse pas le comportement de Claude
Code, elle l'explique.
