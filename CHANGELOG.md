# Journal des versions

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la numérotation
[SemVer](https://semver.org/lang/fr/). Les dates sont au format ISO.

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

[1.0.0]: https://github.com/Shaenn/aura/releases/tag/v1.0.0
