# La voix d'AURA en anglais

Pendant anglais de [`voix.md`](voix.md). Même personne, même retenue, une autre langue —
et quelques arbitrages que le français n'avait pas à trancher.

Ce document est écrit en français, comme le reste des documents de contribution, mais tous
ses exemples sont en anglais : un registre se juge dans sa propre langue, pas en traduction.

La règle mère ne change pas : **AURA parle à la première personne là où il y a une relation,
et reste nominale là où il n'y a que de la donnée.**

---

## Le problème que le français ne posait pas

En français, la retenue d'AURA tenait à un mot : elle vous **vouvoie**. L'anglais n'a pas ce
levier — `you` est le même pour l'intime et le lointain. La distance doit donc venir d'ailleurs :

- **rien de conversationnel.** Pas de `Let's take a look`, pas de `Alright`, pas de `Oops`,
  pas de question rhétorique. AURA constate, elle ne bavarde pas.
- **les contractions usuelles, oui ; la familiarité, non.** `I couldn't`, `it didn't`,
  `you're` sont l'anglais neutre : les écrire en toutes lettres (`I could not`) sonne raide
  et solennel, ce qui n'est pas la même chose que sobre. En revanche `gonna`, `let's`,
  `heads-up`, `oops` sont hors charte.
- **aucun superlatif, aucune emphase.** `Successfully saved!` dit deux fautes en trois mots :
  AURA ne se félicite pas, et n'emploie pas le point d'exclamation.

## Où AURA parle d'elle-même

Les mêmes surfaces qu'en français : celles où quelqu'un s'adresse à vous.

| Surface          | Français                                                                  | Anglais                                                         |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| État vide        | `Je ne vois aucune session active.`                                       | `I don't see any active session.`                               |
| Perte de lien    | `J'ai perdu le contact avec le serveur.`                                  | `I've lost contact with the server.`                            |
| Échec d'écriture | `Je n'ai pas pu écrire settings.json : permission refusée.`               | `I couldn't write settings.json: permission denied.`            |
| Confirmation     | `Je vais remplacer 3 lignes dans settings.json.`                          | `I'm about to replace 3 lines in settings.json.`                |
| Recommandation   | `Je vous conseille d'alléger le contexte : il occupe 68 % de la fenêtre.` | `I'd suggest trimming the context: it fills 68% of the window.` |
| Accueil          | `Trois sessions ont tourné cette nuit. Rien d'anormal.`                   | `Three sessions ran overnight. Nothing out of the ordinary.`    |

Noter le `68%` sans espace : l'anglais colle le symbole au nombre là où le français l'en
sépare. Ce genre de détail ne se traduit pas, il se reformate — c'est le travail d'`Intl`
dans `src/utils/format.ts`, pas celui du catalogue.

## Où AURA se tait

Inchangé. En-têtes de colonnes, libellés de boutons, titres d'écrans, `aria-label`
descriptifs, étiquettes de données brutes. Ces surfaces nomment, elles ne s'adressent à
personne.

Une différence de forme, cependant : l'anglais met des **capitales aux titres** là où le
français n'en met qu'à l'initiale. AURA garde la casse de phrase (`Active sessions`, pas
`Active Sessions`) — la capitale de titre appartient à un registre promotionnel dont
l'interface n'a que faire.

## Invariants

Ceux du français, mot pour mot :

- Aucun emoji, aucun point d'exclamation, aucune majuscule d'insistance.
- Phrases courtes, affirmatives, terminées par un point. Le tiret cadratin pour l'incise.
- AURA ne s'excuse pas et ne se félicite pas. Elle constate.
- Les termes du domaine Claude Code (`Skills`, `Hooks`, `MCP`, `Plugins`, `Agents`) étaient
  déjà en anglais : ils ne bougent pas, et c'est la seule chose que la traduction simplifie.

Et un invariant propre à l'anglais : **jamais `please`, jamais `sorry`.** Le premier
transforme un constat en requête polie, le second est une excuse — les deux sont hors
personnage.

## Règle de silence

Identique, et plus facile à enfreindre en anglais, où les tournures d'annonce viennent
naturellement. À proscrire :

- `I've loaded your projects.` — le chargement n'est pas une nouvelle.
- `Here are your projects.` — ils sont déjà à l'écran.
- `Let me show you the diff.` — l'affichage n'est pas un acte à annoncer.

Le « I » se mérite : il faut qu'AURA ait **tenté** quelque chose, **renoncé** à quelque
chose, ou **constaté** quelque chose que l'utilisateur ne voit pas encore.

## Erreurs

Trois choses, dans cet ordre : ce qu'AURA voulait faire, ce qui a échoué, ce qui reste
possible.

> `I couldn't write ~/.claude/settings.json: permission denied. The file is unchanged.`

Jamais de rejet sur l'utilisateur (`You didn't…`), jamais de fatalisme (`An error
occurred.`). Comme en français, si le message vient du serveur, c'est le serveur qu'il faut
corriger : voir `server/i18n/` et les routes.

## Le vocabulaire

Les noms maison sont **traduits** : une interface anglaise est entièrement anglaise. Cette
table fait autorité — un même terme doit se rendre partout de la même façon, catalogue,
manuel et README compris.

| Français            | Anglais         |
| ------------------- | --------------- |
| Vue d'ensemble      | Overview        |
| Projets             | Projects        |
| Sessions actives    | Active sessions |
| Atelier             | Workshop        |
| Rejeu               | Replay          |
| Usage & coûts       | Usage & costs   |
| Diagnostic          | Diagnostic      |
| Mémoire             | Memory          |
| Réglages            | Settings        |
| Sauvegardes         | Backups         |
| Maintenance         | Maintenance     |
| Manuel              | Manual          |
| Fenêtre de contexte | Context window  |
| Piste (sous-agent)  | Track           |
| Compaction          | Compaction      |
| Constat             | Finding         |
| Seuil               | Threshold       |
| Garde-fou           | Guardrail       |
| Relevé              | Reading         |
| Prévisualiser       | Preview         |
| Appliquer           | Apply           |

`AURA` ne se traduit pas et ne se décline pas : une seule forme écrite, en capitales. Son
développement anglais est **Agentic Unified Resource Assistant** — les quatre mots du
français dans le même ordre, pour que le sigle tienne dans les deux langues.

## Le manuel

Comme en français, la voix s'y partage :

- ce qu'**AURA** fait → première personne : « I preview every write before applying it. » ;
- ce que **Claude Code** fait → voix neutre descriptive : « A hook runs before each tool
  call. »

La frontière est celle de la responsabilité. AURA n'endosse pas le comportement de Claude
Code, elle l'explique.
