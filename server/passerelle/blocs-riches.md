# Les blocs riches de Telegram

Ce que `sendRichMessage` sait dessiner, ce qu'on en emploie, et ce qu'on a écarté.

Ce fichier existe pour une raison précise : **l'API accepte en silence les champs qu'elle
ne connaît pas.** Un `header` écrit pour `is_header` ne produit aucune erreur — seulement un
tableau sans en-tête, et rien pour dire pourquoi. Les types de `node-telegram-bot-api`
défendent les noms de champs, mais leurs valeurs sont déclarées `type: string` : le
compilateur ne dira jamais que `pull_quotation` aurait dû s'écrire `pullquote`. Les chaînes
exactes vivent donc ici, relevées dans la spec, et les comportements réels y sont notés à
côté — plusieurs contredisent la documentation.

Tout ce qui suit est **mesuré contre l'API et contre le client web**, sauf mention contraire.
Un client mobile peut différer ; c'est dit là où on l'a constaté.

---

## Les trois portes d'entrée

`InputRichMessage` accepte **exactement l'un** de ces trois champs :

| Champ      | Ce que c'est                                        |
| ---------- | --------------------------------------------------- |
| `blocks`   | Une liste de blocs structurés en JSON — notre choix |
| `html`     | Un document HTML, dialecte propre à cette API       |
| `markdown` | Du Markdown, dialecte propre à cette API            |

Le champ `markdown` mérite d'être connu, parce qu'il paraît rendre `riche.ts` inutile : on
lui donnerait le fichier tel quel. On ne le fait pas, et pour trois raisons qui tiennent
toutes à la même chose — **on perdrait la main sur les cas où le rendu par défaut est faux** :

- les cases à cocher ne sont pas dessinées par les clients (plus bas) ; il faut les
  remplacer par un symbole, ce qui suppose de les avoir vues passer ;
- les liens relatifs d'un dépôt (`../livraison/0.livraison.md`) ne mènent nulle part depuis
  une messagerie, et doivent être dégradés en texte plutôt que rendus cliquables ;
- le dialecte est celui de Telegram, pas celui de CommonMark. Ce qu'il fait des cas
  limites — listes imbriquées, continuations, tableaux sans en-tête — resterait à
  découvrir, et à re-découvrir à chaque évolution.

Traduire nous-mêmes coûte un fichier ; ne pas traduire coûterait le contrôle du résultat.

Deux options accompagnent le message :

- **`skip_entity_detection: true`** — indispensable ici. Sans elle, Telegram fabrique des
  liens : `.md` est un domaine de premier niveau (la Moldavie), donc `0.livraison.md` part
  vers un site qui n'existe pas. Un dépôt est plein de `.py`, `.pl`, `.sh`, `.io`. Vérifié :
  cette option ne touche pas aux entités qu'on déclare soi-même.
- `is_rtl` — sens de lecture. Sans usage ici.

## Les limites

Elles sont dans la spec, section _Rich Message Limits_ :

| Limite                                        | Valeur  | Gardée chez nous ?                         |
| --------------------------------------------- | ------- | ------------------------------------------ |
| Caractères UTF-8 du message                   | 32 768  | oui — `MAX_RICHE`, pagination à 70 %       |
| **Blocs**, imbriqués, items et lignes compris | **500** | **non** — voir la réserve ci-dessous       |
| Niveaux d'imbrication                         | 16      | non — atteignable seulement par une liste  |
| Pièces jointes                                | 50      | sans objet — on n'envoie aucun média       |
| Colonnes d'un tableau                         | 20      | non — un tableau de dépôt en a rarement 20 |

**La borne des 500 blocs n'est pas gardée** — la pagination compte des caractères, pas des
blocs — mais elle l'est de fait : couper la source à 70 % de 32 768 caractères borne
mécaniquement ce qu'une page peut produire. Mesuré sur tous les `.md` de deux dépôts réels,
162 pages : le pire document en produit **377**. La borne n'a donc pas été atteinte, et un
document assez dense pour la franchir retomberait sur le bloc unique d'`envoieRendu`, qui
n'en compte qu'un. Rien ne se perd, et c'est pour cela que ce n'est pas corrigé.

---

## Les blocs

Vingt-et-un types. La colonne « chez nous » dit ce que `riche.ts` en fait.

### Ceux qu'on émet

| `type`       | Champs                                                 | Correspondance HTML | Chez nous                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paragraph`  | `text`                                                 | `<p>`               | lignes consécutives regroupées                                                                                                                                                                                                                                                                                                                    |
| `heading`    | `text`, `size` (1–6, **1 = le plus grand**)            | `<h1>`…`<h6>`       | `#`…`######`, correspondance directe                                                                                                                                                                                                                                                                                                              |
| `pre`        | `text`, `language?`                                    | `<pre><code>`       | bloc clôturé ` ``` `, langue déclarée reprise                                                                                                                                                                                                                                                                                                     |
| `list`       | `items[]`                                              | `<ul>` / `<ol>`     | puces et listes numérotées, imbriquées par retrait                                                                                                                                                                                                                                                                                                |
| `details`    | `summary`, `blocks[]`, `is_open?`                      | repli natif         | **jamais depuis le Markdown** — posé à la main autour d’un document qu’on ne veut pas déverser (le résumé d’une compaction). Essayé et rendu : le titre reste visible, le corps s’ouvre au clic. C’est le **seul** repli explicite de l’API ; l’« Afficher plus » automatique d’un message long ne s’est pas déclenché sur sept mille caractères. |
| `blockquote` | `blocks[]`, `credit?`                                  | `<blockquote>`      | lignes `>` consécutives, relues comme un document                                                                                                                                                                                                                                                                                                 |
| `table`      | `cells[][]`, `is_bordered?`, `is_striped?`, `caption?` | `<table>`           | tableaux Markdown, bordures toujours                                                                                                                                                                                                                                                                                                              |
| `divider`    | —                                                      | `<hr/>`             | `---`, `***`, `___`                                                                                                                                                                                                                                                                                                                               |

`credit` (sur `blockquote`) et `caption` (sur `table`) ne sont pas employés : le Markdown
n'a rien qui leur corresponde, et les remplir demanderait d'inventer une convention.

### Ceux qu'on n'émet pas, et pourquoi

| `type`                                               | Ce que c'est                                 | Pourquoi pas                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pullquote`                                          | Citation centrée, `text` + `credit?`         | Le Markdown n'a qu'une forme de citation, et `blockquote` en est la traduction fidèle. Attention au nom : **`pullquote`**, pas `pull_quotation`. |
| `footer`                                             | Pied de document                             | Aucun équivalent Markdown. Servirait à signer un envoi — « lu sur le disque à telle heure » — si on décidait un jour de le faire.                |
| `anchor`                                             | Ancre nommée, `name`                         | Sans utilité tant qu'aucun lien interne ne pointe dessus. Irait avec `anchor_link` si l'on voulait rendre les liens de section d'un document.    |
| `mathematical_expression`                            | LaTeX, champ `expression`                    | Rien dans les documents du parc. À revoir si des spécifications en portent.                                                                      |
| `collage`, `slideshow`                               | Groupes de médias                            | La Passerelle n'envoie aucun média.                                                                                                              |
| `map`                                                | Carte, `location`, `zoom`, `width`, `height` | Hors sujet.                                                                                                                                      |
| `photo`, `video`, `animation`, `audio`, `voice_note` | Médias, chacun avec `caption?`               | Idem. La légende est un `RichBlockCaption` (`text` + `credit?`), pas un simple texte.                                                            |
| `thinking`                                           | Un « Thinking… » en attente                  | **Utilisable uniquement dans `sendRichMessageDraft`**, jamais dans un message envoyé. La spec le dit.                                            |

---

## Les items de liste

`InputRichBlockListItem` porte quatre champs optionnels, et **trois nous ont menti** :

| Champ          | Ce que la spec dit                                                | Ce qu'on observe                                                        |
| -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `has_checkbox` | L'item porte une case à cocher                                    | **Accepté, jamais dessiné.** L'item s'affiche comme une puce ordinaire. |
| `is_checked`   | La case est cochée                                                | Idem, sans effet.                                                       |
| `value`        | « Pour les listes ordonnées, la valeur numérique de l'étiquette » | **Sans effet seul** : l'item reste une puce. Voir ci-dessous.           |
| `type`         | `"1"`, `"a"`, `"A"`, `"i"`, `"I"` — la forme de l'étiquette       | C'est lui, et lui seul, qui déclenche la numérotation.                  |

Le relevé, `value` valant 1, 2, 3 :

| `type` posé | Ce qui s'affiche | Verdict                                      |
| ----------- | ---------------- | -------------------------------------------- |
| `"1"`       | `0.` `1.` `2.`   | **décalé d'un rang** — inutilisable tel quel |
| `"a"`       | `a.` `b.`        | correct                                      |
| `"I"`       | `I.` `II.`       | correct                                      |
| absent      | `•` `•`          | puce, quelle que soit la valeur de `value`   |

D'où notre choix : **le numéro reste dans le texte de l'item**. On accepte la redondance
visible — une puce suivie d'un numéro, « • 5. » — parce qu'un premier point affiché « 0. »
serait faux dans un document où l'ordre est la consigne.

Même raisonnement pour les cases à cocher, qui sortent en `☑︎` / `☐︎` dans le texte : sans
cela, une liste de tâches perdrait l'état de chaque ligne sans que rien ne le signale.

La voie native, `sendChecklist`, est fermée d'un cran plus haut : elle répond
`PREMIUM_ACCOUNT_REQUIRED` et exige un `business_connection_id`, donc un compte Business
connecté — hors de portée d'un bot ordinaire.

---

## Les cellules de tableau

`RichBlockTableCell` : `text?`, `is_header?`, `colspan?`, `rowspan?`, `align`, `valign`.

- `text` omis rend la cellule **invisible** — utile pour une grille creuse, jamais nécessaire
  ici.
- `align` et `valign` sont déclarés **obligatoires** par la spec comme par les types de la
  bibliothèque. **Ils ne le sont pas** : l'API accepte une cellule sans eux, et le client la
  rend. On les a donc rendus optionnels localement, et on ne pose `align` que là où le
  Markdown le demande — les deux-points de la ligne de séparation.
- `is_header` est ce qui distingue une ligne d'en-tête. Sans la ligne d'alignement du
  Markdown, il n'y a pas d'en-tête à déclarer : la première ligne est une ligne comme une
  autre.
- `is_bordered` n'est pas décoratif. Sans lui, un tableau se lit comme des mots posés côte à
  côte.

---

## Les entités en ligne

Vingt-cinq types de `RichText`. Le texte d'une entité est lui-même du `RichText` : **elles
s'emboîtent**, et l'emboîtement se cumule — mesuré, et l'ordre est sans effet.

| Employées                         | Ce qu'on en fait                                                  |
| --------------------------------- | ----------------------------------------------------------------- |
| `bold`, `italic`, `strikethrough` | `**`, `*` ou `_`, `~~`                                            |
| `code`                            | accents graves                                                    |
| `marked`                          | **emboîté autour de `code`** — voir plus bas                      |
| `url`                             | liens `http(s)` et `mailto` seulement ; le reste dégrade en texte |

Le cas de `marked` mérite d'être gardé, parce qu'il vaut au-delà de lui : `code` seul est
rendu en chasse fixe teintée, ce qui suffit sur un grand écran et se perd sur un téléphone.
`marked` ajoute un **fond** — une différence de _surface_, non de couleur —, et c'est ce qui
traverse la réduction d'échelle. On envoie donc `marked(code)`.

Les autres, disponibles et inutilisées : `underline`, `spoiler`, `subscript`, `superscript`,
`custom_emoji`, `mathematical_expression`, `date_time`, `text_mention`, `mention`, `hashtag`,
`cashtag`, `bot_command`, `email_address`, `phone_number`, `bank_card_number`, `anchor`,
`anchor_link`, `reference`, `reference_link`.

**Aucune ne porte de couleur, de fond ni de style.** Le champ `type` désigne une sémantique,
et chaque client la peint avec son propre thème — le même contenu n'a pas la même apparence
dans une bulle et dans l'_Instant View_. Ce qu'on choisit, c'est ce qu'une chose **est**,
jamais à quoi elle **ressemble**.

---

## La méthode, si ce fichier doit être complété

Ne rien conclure d'une absence d'erreur. L'API répond `ok: true` à des blocs qu'elle ignore,
et le client dessine ce qu'il veut de ce qu'il reçoit. Une hypothèse ne vaut que vérifiée à
l'écran, et le relevé se note ici avec ce qui a été essayé — c'est ce qui a fait gagner le
plus de temps sur ce chantier, et ce qui en fera gagner à la relecture suivante.
