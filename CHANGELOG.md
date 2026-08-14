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

[1.1.0]: https://github.com/Shaenn/aura/releases/tag/v1.1.0
[1.0.0]: https://github.com/Shaenn/aura/releases/tag/v1.0.0
