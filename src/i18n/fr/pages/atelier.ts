// L'Atelier : l'écran d'ouverture, puis la session en direct. Le fil parle dans
// `replay/`, et les surfaces qui accompagnent l'agent dans `agent.ts`.

export default {
  title: 'Atelier',
  lead: 'Je lance l’agent et je le tiens : chaque outil qu’il veut employer passe par vous, sans terminal.',

  /** L'adresse désignait une session que le registre en mémoire a perdue. */
  gone: {
    what: 'Cette session n’est plus ouverte — le serveur a redémarré depuis, ou elle a été arrêtée. Son déroulé est conservé, et la conversation peut reprendre là où elle s’est arrêtée.',
    resume: 'Reprendre',
    replay: 'Rejeu',
  },

  /**
   * Les sessions qu'AURA tient ouvertes en ce moment.
   *
   * Sans cette liste, une session dont on a fermé l'onglet sans garder son lien
   * tourne sans être joignable : son `runId` est la seule adresse qui y mène.
   *
   * En-tête, états et nom du bouton restent nominaux. Ce sont une étiquette de
   * section, des libellés de données et le nom accessible d'un contrôle — trois
   * surfaces où la charte demande qu'AURA se taise.
   */
  live: {
    head: 'Sessions en cours',
    working: 'Travaille',
    waiting: 'En attente',
    idle: 'Au repos',
    ended: 'Terminée',
    failed: 'En échec',
    join: 'Rejoindre la session de {folder}',
    stop: 'Arrêter la session de {folder}',
  },

  where: 'Où travailler',
  projectSessions: '{n} session | {n} sessions',
  folder: 'Dossier de travail',
  folderAria: 'Dossier de travail de la session',
  browse: 'Parcourir…',
  picking: 'Le sélecteur est ouvert — il peut être passé derrière cette fenêtre.',

  resume: 'Reprendre une session de ce dossier',
  untitled: 'Sans titre',
  resumeTurns: '{n} tour | {n} tours',
  noResume: "Je n'ai enregistré aucune session pour ce dossier.",

  modelLabel: 'Modèle',
  modelAria: 'Modèle de la session',
  /** Au survol de la puce : l'identifiant exact, et d'où il vient. */
  modelPlanned: 'Modèle prévu : {id}. Je le confirmerai au premier tour.',
  modelChosen: 'Modèle employé : {id}',
  modelInherited: 'Modèle employé, hérité de vos réglages : {id}',
  permissionsLabel: 'Permissions',
  permissionsAria: 'Mode de permission de la session',
  open: 'Ouvrir la session',
  launchError: 'Erreur',

  /** Le premier segment reprend ce que `settings.json` fixe déjà. */
  models: {
    settings: 'Réglages',
    settingsTip: 'Le modèle de vos réglages : {model}.',
    settingsNone: "Vos réglages ne fixent pas de modèle : c'est Claude Code qui choisit.",
  },
  modes: {
    default: 'Demander',
    defaultTip: 'Tout ce qui est risqué vous est soumis.',
    auto: 'Automatique',
    autoTip: 'Un classifieur tranche le tout-venant ; ce qui est ambigu vous est soumis.',
    acceptEdits: 'Éditions',
    acceptEditsTip: 'Les éditions de fichiers passent seules ; le reste vous est soumis.',
    plan: 'Plan',
    planTip: 'L’agent réfléchit et n’exécute rien.',
    /** Ce qui s'ajoute à l'infobulle du mode que vos réglages fixent. */
    fromSettings: '{tip} C’est le mode de vos réglages.',
  },

  status: {
    idle: 'Prête',
    working: 'Au travail',
    waiting: 'En attente de vous',
    ended: 'Terminée',
    failed: 'Arrêtée sur erreur',
  },
  resumed: 'reprise',
  autoScroll: 'Auto-défilement',
  followLive: 'Suivre le direct',
  fullReplay: 'Rejeu complet',
  stop: 'Arrêter',

  empty: 'Session ouverte sur {cwd}. Rien n’a encore été demandé — l’agent ne démarre qu’au premier message.',

  askMany: '{n} questions attendent',
  askOne: "L'agent attend une réponse",
  answer: 'Répondre',
  composer: 'Parler à l’agent',

  aside: 'Suivi, contexte et ressources',
  tasks: 'Tâches',
  workCollapse: 'Réduire le suivi',
  workExpand: 'Déplier le suivi',
  panelAria: 'Contexte et ressources du projet',
  tabContext: 'Fenêtre de contexte',
  tabResources: 'Ressources',
  contextPending: 'La fenêtre de contexte se lit sur le transcript : elle apparaîtra à la fin du premier tour.',
}
