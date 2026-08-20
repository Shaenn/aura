# Journal des versions

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la numérotation
[SemVer](https://semver.org/lang/fr/). Les dates sont au format ISO.

## Ce que les trois nombres veulent dire ici

SemVer parle d'API publique. AURA n'en a pas : elle a une interface, un contrat avec
`~/.claude`, et un socle qu'elle exige. Sans traduction, chaque version se déciderait au cas
par cas.

- **Majeur** — ce qui casse une installation qui marchait : socle exigé relevé, écriture d'un
  fichier de `~/.claude` sous une autre forme, écran ou route retirés.
- **Mineur** — ce que vous voyez apparaître ou changer : un écran, une capacité, un livrable.
- **Correctif** — ce qui répare ou entretient sans rien changer de visible. Les montées de
  dépendances en font partie, y compris leurs majeures : c'est le socle d'AURA qui bouge,
  pas AURA.

Une version se pose quand il y a quelque chose à annoncer, pas à chaque fusion. Une journée
entière de montées de dépendances n'en produit aucune.

## [1.3.0] — 2026-08-20

Une version d'une seule capacité, et elle est grande : la **Passerelle**, qui relie une
messagerie à l'Atelier pour lancer, surveiller et débloquer une session quand on n'est pas
devant le poste. Elle est éteinte par défaut et le reste tant qu'on ne la configure pas.

### Ce qui change pour vous

- **Piloter l'Atelier depuis Telegram.** On écrit à un bot, AURA ouvre une session sur un
  projet connu ou transmet le message à celle qui travaille déjà, et rend sa réponse. Une
  conversation tient une session à la fois. `/sessions`, `/etat`, `/stop`, `/fin` disent et
  font le reste ; tout autre message part comme un tour, sans syntaxe à retenir.
- **Consulter un projet sans ouvrir de session.** `/projets` donne un écran de navigation qui
  descend l'arborescence dossier par dossier et ouvre un fichier — même inventaire et mêmes
  gardes que la page Projet, aucun processus lancé, aucun jeton dépensé.
- **Les documents arrivent en documents.** Markdown traduit en messages riches — titres,
  listes, citations, code coloré et vrais tableaux —, découpés en pages quand ils sont longs,
  la coupe tombant sur une fin de ligne. Ce qui n'est pas du Markdown reste en chasse fixe.
- **Décider de loin.** Une demande de permission arrive avec ses deux boutons ; un plan arrive
  entier, mis en forme, avant d'être approuvé. Une question de l'agent se pose comme à
  l'écran, à choix simple ou multiple, et se répond aussi en écrivant. L'échéance du quart
  d'heure de l'Atelier s'applique ici : sans réponse, la demande est refusée, jamais l'inverse.
- **Voir la fenêtre de contexte, et agir dessus.** `/etat` donne le compte exact et son
  dénominateur, `/compacter` compacte sans attendre le débordement. AURA prévient quand la
  fenêtre a été compactée — résumé replié à l'appui — et une fois quand elle passe les 80 %.
- **Savoir que ça travaille.** Le temps d'un tour, une bulle éphémère dit quels outils tournent
  et depuis combien de temps, avec les mêmes libellés qu'à l'écran.

### Ce qu'il faut peser avant de l'allumer

- **La Passerelle est faite pour un usage personnel.** Ce qui transite passe par les serveurs
  de la messagerie, sans chiffrement de bout en bout : elle n'est **pas recommandée en
  contexte professionnel**. Une forme sans tiers est cherchée — un réseau privé rendant
  l'Atelier joignable depuis un téléphone — mais elle n'existe pas aujourd'hui.
- **Ce qu'elle n'ouvre pas.** Aucun port : l'échange est sortant, le serveur continue de
  n'écouter que `127.0.0.1`, et les gardes de l'API ne bougent pas.
- **Ce qu'elle accorde.** Un accès distant au poste. La liste blanche des conversations est la
  serrure : elle est obligatoire, la Passerelle refuse de démarrer sans elle, et un message
  venu d'ailleurs reste sans réponse. [SECURITY.md](SECURITY.md) détaille le reste.

## [1.2.0] — 2026-08-18

Une version de la fiche projet : son volet de ressources retient enfin ce qu'on lui montre,
au lieu de tout oublier dès qu'on tourne la tête.

### Ce qui change pour vous

- **Le fichier ouvert survit au rechargement.** La visionneuse ne gardait sa sélection qu'en
  mémoire : un F5 sur la fiche d'un projet ramenait au `CLAUDE.md` racine, quelle que soit la
  page qu'on était en train de lire. Le fichier ouvert vit maintenant dans l'adresse, ce qui
  rend le lien partageable au passage. Et si ce fichier a disparu entre-temps — retiré du
  disque, ou d'un dossier qu'on vient d'exclure — la sélection automatique reprend la main
  plutôt que d'ouvrir un panneau vide.
- **Le volet des ressources se recharge sans quitter l'écran.** Pour voir une ressource
  éditée hors d'AURA, il fallait sortir de la page et y revenir. Un bouton la recharge sur
  place, et sans faire perdre le fichier qu'on lisait.
- **Les dossiers inclus se voient aussi dans le volet des sessions.** Ils étaient dans la
  réponse du serveur, mais pas à l'écran. Un dossier qu'on a demandé à voir se voit
  maintenant partout où l'arbre du projet se montre, sinon l'inclusion n'a de sens que sur un
  écran.

### Ce qui a été entretenu

Le SDK d'agent, qui embarque le binaire de Claude Code et change donc le moteur qui écrit les
transcripts — jugé en le faisant produire, pas en le compilant. Puis fastify, highlight.js,
pinia et globals.

Une conséquence est à connaître, et elle vient du moteur, pas d'AURA : **les listes de tâches
ne s'écrivent plus dans les transcripts nouveaux.** Les outils qui les tenaient sont sortis de
la surface par défaut des modèles récents. Le rejeu continue de les afficher partout où elles
ont déjà été enregistrées ; il n'aura simplement plus rien à montrer sur ce point pour les
sessions à venir.

## [1.1.0] — 2026-08-14

Rien de neuf dans l'application : cette version est celle du socle, et de deux choses que
vous verrez tout de même.

### Ce qui change pour vous

- **Le manuel se lit sans installer.** AURA a une vitrine —
  [shaenn.github.io/aura](https://shaenn.github.io/aura/) — qui republie les dix-huit pages du
  manuel, en français et en anglais, depuis la même source que l'aide de l'application.
- **La coloration des diffs est réparée.** L'en-tête d'un fragment aux nombres non appariés
  — `@@ -1 +1,2 @@` — n'était pas coloré du tout, et un diff collé sans nom de fichier
  n'était pas reconnu pour ce qu'il est. `for await` et `sizeof` retrouvent au passage leur
  couleur de mot-clé.

### Le socle exigé

- **Node.js 24, et lui seul.** La 1.0.0 annonçait `^28 || ^26 || ^24 || ^22.12` — une plage
  que rien ne vérifiait : `@quasar/app-vite` refuse en dur en dessous de 22.22, et seule la
  24 était testée. La déclaration disait donc faux ; elle dit maintenant vrai. Aucune
  configuration qui fonctionnait ne cesse de fonctionner.

### Ce qui a été entretenu

Quatre majeures franchies — Quasar 3, TypeScript 6, ESLint 10, pinia 4 — et le SDK d'agent,
qui embarque le binaire de Claude Code et change donc le moteur qui écrit les transcripts.
Chacune a été jugée en la faisant produire, pas en la compilant.

### Ce qui garde la porte

- **Aucune dépendance publiée depuis moins de 24 heures n'est installée**, et le refus est
  désormais franc : la garde de pnpm se désactivait d'elle-même et inscrivait sa propre
  dérogation. Dependabot, de son côté, ne propose plus rien de plus frais que trois jours.
- **La CI vérifie le fichier de verrou contre ces règles**, ce qu'elle ne faisait pas.
- Quatre avis de sécurité fermés — tous logés dans la chaîne d'outils de la vitrine, aucun
  dans l'application.

## [1.0.0] — 2026-08-13

Première version publique. AURA était jusqu'ici un outil personnel ; ce qui suit est ce
qu'elle sait faire au moment où elle s'ouvre.

### Ce que l'application montre

- **Vue d'ensemble** — l'état du dossier `~/.claude` d'un coup d'œil : ressources présentes,
  sessions récentes, ce qui a bougé.
- **Rejeu** — un transcript de session relu comme une conversation : Markdown, diffs,
  coloration syntaxique, diagrammes Mermaid, images, appels d'outils repliables, sous-agents
  suivis dans leur propre fil.
- **Projets** — l'inventaire du `.claude` de chaque projet, ses CLAUDE.md, ses plans, et les
  dossiers de documentation que vous choisissez d'ouvrir.
- **Usage** — les jetons et le coût estimé par session, par projet, par jour. Les prix sont
  ceux de l'API à la liste : le chiffre répond à « combien cette session aurait coûté en
  API », pas à « combien vous avez payé ».
- **Diagnostic** — ce que ces chiffres veulent dire, et ce qu'il y aurait à faire : seuils
  calibrés sur le parc réel, recommandations plutôt que notes.
- **Manuel** — l'aide, en tiroir contextuel et en page complète, depuis une seule source.

### Ce qu'elle sait changer

- **Agents, Skills, Mémoire, Hooks, MCP, Plugins, Réglages** — lecture pour tous, écriture
  gardée pour les ressources éditables.
- **Toute écriture est prévisualisée** : le serveur renvoie un diff, vous confirmez,
  l'écriture se fait avec sauvegarde et refus si le fichier a changé entre-temps.
- **Sauvegardes** — les instantanés pris avant chaque écriture, relisibles et restaurables.
- **Maintenance** — le poids du dossier par zone, les sessions vivantes, les processus
  `claude` en cours, l'extinction ordonnée du serveur.

### L'Atelier

Les sessions qu'AURA lance elle-même, par opposition à celles qu'elle observe : demandes de
permission présentées à l'écran, plans, sous-agents, commandes en arrière-plan, images
collées, reprise d'une session existante.

### Le socle

- Interface bilingue français / anglais, thème sombre et clair.
- Application **locale et mono-utilisateur** : le BFF n'écoute que `127.0.0.1`, aucun service
  externe, aucun secret dans le navigateur. Voir [SECURITY.md](SECURITY.md).
- Windows, exclusivement — la seule plateforme sur laquelle l'application a tourné.

[1.3.0]: https://github.com/Shaenn/aura/releases/tag/v1.3.0
[1.2.0]: https://github.com/Shaenn/aura/releases/tag/v1.2.0
[1.1.0]: https://github.com/Shaenn/aura/releases/tag/v1.1.0
[1.0.0]: https://github.com/Shaenn/aura/releases/tag/v1.0.0
