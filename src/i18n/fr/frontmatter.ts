// Le vocabulaire des frontmatters que Claude Code lit — SKILL.md, agents/<nom>.md,
// et les règles de projet. Trois choses par clé : son nom d'affichage, ce qu'elle
// fait, et ce que Claude Code suppose quand elle est absente.
//
// La structure des clés (type, valeurs admises, obligation) reste dans
// `src/utils/resourceFrontmatter.ts` : elle ne dépend pas de la langue. Seuls
// les mots vivent ici.

export default {
  /** Clé qu'aucun vocabulaire ne documente. */
  unknown: 'Clé non documentée par Claude Code pour ce type de ressource : elle sera ignorée.',
  ignored: 'ignorée',
  undefinedKeys: '{n} clé non définie | {n} clés non définies',
  defaultsNote: '— valeurs appliquées par défaut',
  requiredCount: '{n} requise | {n} requises',
  skill: {
    name: {
      label: 'Nom',
      info: 'Nom affiché du skill. Ne change pas la commande /nom, qui suit le nom du dossier.',
      fallback: 'nom du dossier',
    },
    description: {
      label: 'Description',
      info: 'Ce que fait le skill et quand l’utiliser. Claude s’en sert pour décider de le déclencher. 1 536 caractères au total avec when_to_use.',
      fallback: 'premier paragraphe du corps',
    },
    when_to_use: {
      label: 'Quand l’utiliser',
      info: 'Contexte de déclenchement supplémentaire : phrases-clés, exemples de demandes. S’ajoute à la description.',
      fallback: 'la description seule',
    },
    'argument-hint': {
      label: 'Indice d’arguments',
      info: 'Affiché à l’autocomplétion pour montrer les arguments attendus, ex. [issue-number].',
      fallback: 'aucun indice',
    },
    arguments: {
      label: 'Arguments nommés',
      info: 'Arguments positionnels nommés, substitués par $nom dans le corps du skill.',
      fallback: 'seulement $ARGUMENTS, $0, $1…',
    },
    'allowed-tools': {
      label: 'Outils autorisés',
      info: 'Outils utilisables sans demander de permission tant que le skill est actif.',
      fallback: 'permissions habituelles',
    },
    'disallowed-tools': {
      label: 'Outils retirés',
      info: 'Outils retirés du pool pendant le skill. La restriction tombe au message suivant : pour un blocage durable, passer par les permissions de settings.json.',
      fallback: 'aucun outil retiré',
    },
    'user-invocable': {
      label: 'Invocable par l’utilisateur',
      info: 'À false, le skill est masqué du menu / : seul Claude peut le charger.',
      fallback: 'true',
    },
    'disable-model-invocation': {
      label: 'Invocation auto désactivée',
      info: 'À true, Claude ne déclenche jamais le skill de lui-même : demande explicite requise.',
      fallback: 'false',
    },
    model: {
      label: 'Modèle',
      info: 'Modèle utilisé tant que le skill est actif ; la session reprend le sien au prompt suivant.',
      fallback: 'modèle de la session',
    },
    effort: {
      label: 'Effort',
      info: 'Niveau de raisonnement pendant le skill.',
      fallback: 'effort de la session',
    },
    context: {
      label: 'Contexte',
      info: 'À fork, le skill s’exécute dans un sous-agent isolé : son contenu devient le prompt.',
      fallback: 'contexte principal',
    },
    agent: {
      label: 'Type de sous-agent',
      info: 'Sous-agent utilisé quand context vaut fork. Sans effet autrement.',
      fallback: 'general-purpose',
    },
    paths: {
      label: 'Chemins',
      info: 'Globs qui restreignent l’activation : Claude ne charge le skill que pour les fichiers correspondants.',
      fallback: 'actif partout',
    },
    shell: {
      label: 'Shell',
      info: 'Interpréteur des commandes inline (!`cmd`) du corps du skill.',
      fallback: 'bash',
    },
    hooks: {
      label: 'Hooks',
      info: 'Hooks de cycle de vie actifs uniquement pendant ce skill.',
      fallback: 'aucun hook',
    },
  },
  agent: {
    name: {
      label: 'Nom',
      info: 'Identifiant unique de l’agent (minuscules + tirets), transmis aux hooks comme agent_type. Le nom du fichier n’a pas à correspondre.',
      fallback: 'champ requis',
    },
    description: {
      label: 'Description',
      info: 'Quand déléguer à cet agent. Claude s’en sert pour décider si une tâche lui correspond ; « use proactively » encourage la délégation automatique.',
      fallback: 'champ requis',
    },
    tools: {
      label: 'Outils',
      info: 'Liste blanche des outils de l’agent. Accepte les patterns MCP (mcp__serveur__*) et Agent(worker, researcher) pour restreindre les agents qu’il peut lancer.',
      fallback: 'hérite des outils du parent',
    },
    disallowedTools: {
      label: 'Outils refusés',
      info: 'Liste noire, appliquée avant `tools`. Pratique pour retirer quelques outils hérités sans tous les énumérer.',
      fallback: 'aucun outil refusé',
    },
    model: {
      label: 'Modèle',
      info: 'Modèle de l’agent. Un ID complet (claude-opus-4-8) est aussi accepté.',
      fallback: 'inherit — le modèle du parent',
    },
    effort: {
      label: 'Effort',
      info: 'Niveau de raisonnement de l’agent. Surcharge celui de la session.',
      fallback: 'effort de la session',
    },
    permissionMode: {
      label: 'Mode de permission',
      info: 'Gestion des demandes de permission. Un parent en bypassPermissions ou acceptEdits l’emporte et ne peut pas être surchargé. Ignoré pour les agents de plugin.',
      fallback: 'mode du parent',
    },
    maxTurns: {
      label: 'Tours maximum',
      info: 'Nombre de cycles que l’agent peut effectuer avant de s’arrêter.',
      fallback: 'illimité',
    },
    isolation: {
      label: 'Isolation',
      info: 'À worktree, l’agent travaille dans une copie git isolée, branchée depuis la branche par défaut. Le worktree est nettoyé s’il n’a rien changé.',
      fallback: 'aucune isolation',
    },
    memory: {
      label: 'Mémoire',
      info: 'Mémoire persistante entre conversations : user (~/.claude/agent-memory), project (versionnable), local (hors versionnement).',
      fallback: 'aucune mémoire persistante',
    },
    skills: {
      label: 'Skills préchargés',
      info: 'Skills injectés en entier dans le contexte au démarrage. Un skill en disable-model-invocation ne peut pas être préchargé.',
      fallback: 'aucun skill préchargé',
    },
    mcpServers: {
      label: 'Serveurs MCP',
      info: 'Serveurs MCP disponibles pour l’agent : une référence partage la connexion du parent, une définition inline est ouverte puis fermée avec l’agent. Ignoré pour les agents de plugin.',
      fallback: 'aucun serveur supplémentaire',
    },
    hooks: {
      label: 'Hooks',
      info: 'Hooks actifs seulement pendant cet agent. Stop devient SubagentStop à l’exécution. Ignoré pour les agents de plugin.',
      fallback: 'aucun hook',
    },
    background: {
      label: 'Arrière-plan forcé',
      info: 'À true, l’agent s’exécute toujours en arrière-plan, même si Claude attend son résultat.',
      fallback: 'Claude choisit',
    },
    color: {
      label: 'Couleur',
      info: 'Couleur d’affichage dans la liste des tâches et la transcription.',
      fallback: 'couleur par défaut',
    },
    initialPrompt: {
      label: 'Prompt initial',
      info: 'Auto-soumis comme premier tour quand l’agent tient lieu de session principale (--agent). Préfixé au prompt de l’utilisateur.',
      fallback: 'aucun prompt initial',
    },
  },
  rule: {
    paths: {
      label: 'Chemins',
      info: 'Motifs de fichiers auxquels cette règle se rapporte.',
      fallback: 'aucun chemin déclaré',
    },
  },
}
