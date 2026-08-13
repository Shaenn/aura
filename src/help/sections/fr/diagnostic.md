---
id: diagnostic
title: Diagnostic de coût
icon: troubleshoot
order: 80
routes: [diagnostic]
---

Ce que coûtent vos sessions, et ce qui mérite une action. Le diagnostic relit les transcripts de `~/.claude/projects` — il n'écrit jamais rien. La période choisie en haut de page vaut pour tout l'écran, seuils compris : les percentiles sont recalculés sur elle.

Le module **Usage & coûts** répond à « combien, et où ? » ; celui-ci répond à « est-ce anormal, et qu'est-ce que j'en fais ? ». Ils lisent la même matière, avec deux intentions différentes.

## Les sections de l'écran

**Le résumé** — coût de la période, sessions analysées, constats, et le nombre de constats _critiques_. Un constat est critique quand la session dépasse **le double du seuil**, à surveiller au-delà de 1,3 fois. La gravité se calcule ainsi sur l'écart au seuil, jamais sur une constante : un parc qui se calme voit ses critiques s'éteindre seuls.

**À faire, dans cet ordre** — jusqu'à cinq actions, celles qui valent la peine. Le regroupement est par **règle et non par session** : une session chère n'est pas une action, « les sessions longues relisent leur historique » en est une, et elle vaut pour toutes celles qu'elle concerne d'un coup. L'ordre vient de l'**impact cumulé, pas de la gravité** — une règle critique sur deux sessions passe derrière une règle mineure sur cinquante, parce que c'est la somme qui décide de ce qu'on fait lundi.

**Comment vous travaillez** — vos sessions d'au moins dix tours ayant produit une modification, coupées en quarts selon leurs éditions par heure, puis le quart du haut comparé à celui du bas. Ce rendement mesure une **activité, pas une valeur** : une session qui traque deux heures un bug et le corrige en une ligne figure tout en bas, et elle a bien travaillé. En dessous de 32 sessions retenues, deux quarts ne sont que deux poignées et le tableau s'abstient.

**Rythme** — la dépense vue par le temps et non par la session. La fenêtre de cinq heures est celle que compte une limite d'usage : elle ne connaît pas les sessions, et deux sessions menées de front la remplissent deux fois plus vite. Les fenêtres sont mesurées à chaque réponse API, donc elles se recouvrent : le pic n'est pas une journée mais un moment. Les sessions de front se comptent par recouvrement des bornes — une session laissée ouverte sans qu'on y touche compte comme ouverte, car c'est ce qu'elle était.

**Le détail** — une entrée par règle. Chacune indique si son chiffre est **mesuré** (lu dans le transcript) ou **estimé**, avec la base de calcul : sans elle, un montant n'est qu'une assertion. Les cas les plus lourds sont cliquables et ouvrent le rejeu de la session.

**Ce que ce rapport ne sait pas** — les angles morts de _votre_ période : seuils non calibrés, modèles sans tarif connu, part de la fenêtre réellement attribuée. Un rapport qui tait ses angles morts se lit comme un devis.

## Un seuil, deux moitiés

Un signal se déclenche au-delà de `max(P90 de votre parc, un garde-fou)` — et en deçà de `min(P10, un plafond)` pour les deux signaux inversés, décrits plus bas. Les deux moitiés répondent à deux échecs différents.

Le **percentile** dit « inhabituel _ici_ ». Une constante ne le saura jamais : 78 % de cache est excellent sur un parc à 60 %, médiocre sur un parc à 99 %. Il est recalculé à chaque rapport, sur la période choisie.

Le **garde-fou** dit « et assez gros pour valoir une action ». Sans lui, un percentile désigne toujours 10 % du parc, y compris quand tout va bien : on accuserait la session la moins vertueuse d'un parc irréprochable.

La propriété qui rend l'ensemble sûr : **un garde-fou ne peut que faire taire.** Pris du côté qui exige davantage — `max` quand plus haut est pire, `min` quand c'est l'inverse — le durcir supprime des constats et n'en crée jamais. Au pire il cache un vrai problème mineur ; jamais il n'en invente un.

Deux signaux sont inversés — **Tours par prompt** et **Taux de cache** — parce que plus bas y est pire. Leur seuil est un P10 et leur garde-fou un plafond, pris en `min`. Conséquence à retenir avant d'y toucher : sur un signal inversé, **un garde-fou posé au-dessus du percentile n'a aucun effet, quel que soit le parc**. Pour faire taire, il doit passer en dessous.

## Lire une ligne du tableau des seuils

- **Sessions** — celles qui _portent_ le signal, pas le parc entier. Une session sans compaction n'a pas un gaspillage de compaction nul : elle est hors sujet, et la compter tirerait tous les percentiles vers zéro.
- **Médiane** — celle des sessions qui portent le signal, pas du parc. L'écart entre elle et le seuil dit à quel point la distribution est étalée.
- **Décidé par** — `votre parc` signifie que le percentile a gagné. `garde-fou` signifie l'inverse, et donc que **le parc est sain sur ce signal** : son décile le moins bon n'atteint pas ce qui vaudrait une action. L'infobulle donne l'arbitrage chiffré — les deux candidats, ce que le plancher tait, et d'où il sort.
- **Cas** — les sessions au-delà du seuil. Quand c'est le parc qui décide, ce sera toujours ~10 % **des sessions portant le signal** : un tri, pas une détection d'anomalie.

Sous les 30 sessions portant un signal, le percentile est écarté et le garde-fou décide seul — la colonne l'affiche. Les constats restent plausibles, ils ne sont pas étalonnés.

## Recalibrer les garde-fous

Les percentiles se recalculent tout seuls ; **les garde-fous, non**. Ce sont les seules valeurs écrites à la main, dans `server/diagnostics/thresholds.ts`, et la date de leur dernière revue s'affiche sous le tableau, à côté du nombre de sessions de votre parc. Un plancher posé il y a longtemps, face à un parc qui a beaucoup grandi depuis, mérite une relecture.

La marche à suivre, signal par signal :

1. **Comparer le plancher au percentile.** Un plancher très au-dessus du P90 rend le signal muet ; très en dessous, il ne sert plus à rien. Les deux valent d'être regardés — le second est bénin, le premier fait disparaître un gisement entier.
2. **Regarder les orphelines, pas la bande.** L'infobulle de la colonne « Décidé par » donne les deux : les sessions situées entre le percentile et le plancher, puis celles d'entre elles qu'**aucun autre signal ne désigne**. Seules les secondes disparaissent vraiment du rapport ; les autres y figurent sous un autre titre, et les taire ne fait que dédoublonner. L'écart entre les deux chiffres est énorme — un plancher peut taire des dizaines de sessions dont une poignée seulement, pour une fraction du montant, sont réellement perdues.
3. **Décider sur un ordre de grandeur, jamais sur le percentile du moment.** Caler un plancher sur le P90 courant le rendrait circulaire : il ne ferait plus rien qu'obéir aux données qu'il est censé arbitrer. Un bon plancher se raconte en une phrase — « une fenêtre standard entière », « la moitié du plancher de coût total » — et c'est ce que doit dire son `guardBasis`.
4. **Mettre à jour `GUARDS_REVIEWED`** dans le même fichier : la date de la révision. C'est elle que la page affiche, pour qu'on sache si un plancher a été pesé récemment ou hérité d'un autre temps.

Le plancher épouse la **légitimité** de la dépense, ce qui explique que deux signaux de même unité portent des valeurs très différentes. Un outil doit consommer du contexte, c'est son métier : son plancher est haut, à une fenêtre entière. Relire un fichier déjà lu, ou charger un socle avant la première question, ne produit rien : ces planchers-là sont dix fois plus bas.

## Quand un seuil ne suffit pas

Un signal exprimé en **ratio** ignore l'ampleur, et désignera volontiers une session à deux cents dont la forme est mauvaise et l'enjeu nul. Aucun garde-fou ne corrige cela — il juge le ratio, jamais la taille de la session. C'est un filtre de matérialité qu'il faut ajouter au signal lui-même, comme le `MIN_MATERIAL_COST` du taux de cache. Le symptôme est reconnaissable : beaucoup de cas dont le coût cumulé est dérisoire.

## Ce que ces chiffres ne sont pas

Les dollars viennent des tarifs API ; un abonnement forfaitaire ne facture pas ainsi. Les tokens attribués à une catégorie — outils, socle, relectures — sont des **estimations** (`chars/4`), pas des compteurs facturés. La section « Ce que ce rapport ne sait pas », en bas de la page, liste les réserves qui s'appliquent à votre période.
