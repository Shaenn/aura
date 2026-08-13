export default {
  /**
   * Explication courte de chaque outil intégré, affichée en tooltip sur son chip.
   *
   * Les clés sont les noms d'outils de Claude Code : ce sont des identifiants,
   * ils ne se traduisent pas et ne changent pas d'une langue à l'autre.
   */
  info: {
    // Lecture seule
    Read: 'Lire le contenu d’un fichier (texte, image, PDF, notebook).',
    Grep: 'Chercher un motif (regex) dans le contenu des fichiers.',
    Glob: 'Trouver des fichiers par motif de chemin, ex. `src/**/*.ts`.',
    WebFetch: 'Récupérer une URL et en analyser le contenu.',
    WebSearch: 'Interroger un moteur de recherche web.',
    NotebookRead: 'Lire les cellules et sorties d’un notebook Jupyter.',
    BashOutput: 'Relire la sortie d’une commande lancée en arrière-plan.',
    LSP: 'Interroger le serveur de langage : définitions, références, diagnostics.',
    // Écriture / exécution
    Edit: 'Remplacer une portion de texte exacte dans un fichier existant.',
    Write: 'Créer un fichier ou écraser entièrement son contenu.',
    Bash: 'Exécuter des commandes shell POSIX.',
    PowerShell: 'Exécuter des commandes PowerShell (Windows).',
    NotebookEdit: 'Modifier, insérer ou supprimer des cellules d’un notebook.',
    TodoWrite: 'Tenir à jour la liste des tâches de la session.',
    SlashCommand: 'Déclencher une commande slash existante.',
    KillShell: 'Arrêter un shell lancé en arrière-plan.',
    // Délégation
    Agent: 'Lancer un sous-agent, avec son propre contexte et ses propres outils.',
    Skill: 'Charger un skill et suivre ses instructions.',
  },
  mcpTool: 'Outil « {tool} » du serveur MCP « {server} ».',
  mcpAll: 'Tous les outils du serveur MCP « {server} ».',
  bashRestricted: 'Bash, restreint aux commandes : {arg}.',
  agentRestricted: 'Délégation restreinte au sous-agent : {arg}.',
  restricted: '{base}, restreint à : {arg}.',
  unknown: 'Outil hors du socle intégré.',
};
