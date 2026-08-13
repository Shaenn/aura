---
id: usage
title: Usage & coûts
icon: insights
order: 75
routes: [usage]
---

Ce que vos sessions ont consommé : tokens, coût estimé, répartition par modèle, par projet et par sous-agent. **Cette page décrit ; le module Diagnostic, lui, juge et propose des actions.** Le lien vers lui est en tête, parce que c'est ici qu'on remarque un montant inhabituel.

Rien n'est écrit : tout est relu depuis les transcripts de `~/.claude/projects`.

## La période

`7 j`, `30 j`, `90 j` ou `Tout`. Elle filtre par **jour calendaire local**, bornes incluses, et vaut pour tout l'écran.

## Ce que « coût » veut dire ici

Le bandeau le dit et il faut le prendre au mot : le montant est calculé aux **tarifs API en liste**, modèle par modèle. Un abonnement Pro ou Max est facturé au forfait — ce chiffre indique **ce que cet usage aurait coûté à l'API**, pas ce que vous avez payé.

Trois précisions sur le calcul :

- le coût est calculé **par cellule (jour, modèle)**, jamais avec un tarif moyen appliqué à des tokens agrégés : une session mélange les modèles, et un modèle peut changer de tarif dans le temps ;
- les tarifs de cache sont **dérivés** du tarif d'entrée du modèle — écriture de cache à 1,25×, lecture à 0,1× ;
- un modèle dont je n'ai **pas** le tarif, je ne le devine jamais à partir de sa famille. Ses tokens sont comptés, son coût est exclu, et le bandeau **nomme les modèles concernés**. Un total qui omet une dépense en silence serait pire qu'un total incomplet annoncé.

## Les tuiles

| Tuile       | Ce qu'elle compte                                              |
| ----------- | -------------------------------------------------------------- |
| Coût estimé | Somme des cellules, aux tarifs API                             |
| Sessions    | Transcripts distincts ayant produit au moins une réponse       |
| Réponses    | **Appels au modèle**, dédoublonnés — pas des lignes de fichier |
| Tokens ↓    | Entrée, **hors cache**                                         |
| Tokens ↑    | Générés                                                        |
| Cache lu    | Tokens relus du cache, facturés 10 % du prix d'entrée          |

Le comptage des **Réponses** mérite une explication, car il conditionne tout le reste. Claude Code écrit **une ligne de transcript par bloc de contenu** : une seule réponse d'API se répète donc sur plusieurs lignes, avec un `output_tokens` qui grandit au fil du flux. Je replie ces lignes par identifiant de message et ne retiens que **la plus grande valeur de chaque compteur**. Compter les lignes gonflerait tous les totaux ; ne garder que la première les sous-estimerait.

## Coût par jour

Des barres empilées : une pile par jour, un segment par modèle. **Un seul axe** — toutes les séries sont des dollars, donc la pile totalise bien le coût du jour et les segments restent comparables entre eux.

La couleur d'un modèle est une propriété **du modèle, pas de son rang** : elle est attribuée une fois, sur le classement de toute l'histoire, et réutilisée pour chaque période. Sans cela, changer de période repeindrait les séries survivantes dès qu'un modèle sort de la fenêtre. Au-delà de la palette, les modèles restants partagent l'encre neutre plutôt qu'une teinte recyclée.

La légende sous le graphique est du HTML, atteignable au clavier et par un lecteur d'écran.

## Répartition par modèle

Un anneau, et **à côté un tableau** qui dit la même chose. Le tableau n'est pas une redite : il est la version accessible de l'anneau, et il donne le nombre de réponses que l'anneau ne peut pas montrer. Un modèle sans tarif connu y affiche `n/a` en coût.

Les identifiants sont raccourcis à l'affichage — `claude-haiku-4-5-20251001` devient `haiku-4-5`.

## Projets les plus coûteux

Les dix premiers, la barre étant relative au plus cher d'entre eux. Le nom affiché est le dernier segment du slug ; le slug complet est dans l'infobulle.

## Sous-agents

La section qui n'a d'équivalent nulle part ailleurs. Les tours d'un sous-agent sont écrits dans des fichiers **à part** — `<session>/subagents/agent-*.jsonl`, accompagnés d'un `.meta.json` qui nomme le type d'agent. Qui ne parcourt que les transcripts principaux **ne voit jamais ces tokens**.

Je les lis, je les regroupe par type d'agent, et j'affiche en tête **la part du coût total** qu'ils représentent. C'est le chiffre à regarder avant de généraliser une architecture à base de fan-out.

## Performance et fraîcheur

Le parcours est incrémental : un transcript est immuable une fois la session finie, donc un fichier dont la taille et la date n'ont pas bougé n'est **pas relu** — seuls les fichiers touchés depuis le dernier appel sont rescannés. C'est ce qui rend la page utilisable sur un parc de plus d'un millier de fichiers.

`Recharger` relance ce parcours. Une session **en cours** apparaît avec ce qu'elle a consommé jusqu'à sa dernière réponse écrite sur le disque.
