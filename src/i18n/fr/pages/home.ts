// L'accueil nomme les mêmes modules que le fil d'Ariane : ses libellés viennent
// de `nav`, et seules les descriptions vivent ici.

export default {
  kicker: 'ASSISTANT UNIFIÉ DES RESSOURCES AGENTIQUES',
  /** `~/.claude` est composé en chasse fixe, d'où le slot. */
  desc: "Je tiens votre environnement Claude Code. Chaque module lit et modifie {path} — je vous montre toute écriture avant de l'appliquer.",
  sessionsLabel: 'Sessions en cours',
  noSession: 'Je ne vois aucune session active.',
  sessionsMore: '+{n} · suivi live',
  sessionsAll: 'Suivi live des sessions',
  groups: { resources: 'Ressources', system: 'Système' },
  primaries: {
    projectsHint: 'Vos projets Claude Code — ressources .claude et rejeu des sessions.',
    projectsCta: 'Ouvrir',
    atelierHint: "Lancer une session et travailler avec l'agent, sans terminal.",
    atelierCta: 'Démarrer',
  },
  hints: {
    agents: 'Subagents personnels et leurs prompts.',
    skills: 'Capacités réutilisables déclenchées à la demande.',
    plugins: 'Plugins installés et marketplaces.',
    memory: 'Instructions permanentes et mémoires par projet.',
    hooks: 'Automatiser des actions aux moments-clés.',
    mcp: 'Serveurs MCP connectés et configurés.',
    settings: 'Permissions, plugins, langue, effort, interface.',
    backups: 'Restaurer une version antérieure de tout fichier.',
    usage: 'Tokens consommés, coût estimé, poids des sous-agents.',
    diagnostic: "Où part l'argent, et quoi faire.",
    maintenance: 'Stockage, purge des caches, plans générés.',
    help: 'Une page par module, et les concepts communs.',
  },
}
