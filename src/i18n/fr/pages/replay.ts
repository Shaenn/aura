// Le Rejeu d'une session : son en-tête chiffré, sa barre de flux, sa colonne de
// droite. Le fil lui-même parle dans `replay/`, partagé avec l'Atelier et les
// Sessions actives.

export default {
  untitled: 'Session',
  named: 'nommée',
  subagents: 'sous-agents',
  error: 'Transcript illisible.',

  stats: {
    turns: 'Tours',
    turnsTip: 'Messages {you} / réponses de {claude}',
    you: 'vous',
    claude: 'Claude',
    tools: 'Outils',
    toolsTip: "Nombre total d'appels d'outils (Bash, Read, Edit…) sur la session",
    tokensIn: 'Tokens ↓',
    tokensInTip: 'Tokens d’{in} : le contexte envoyé au modèle (hors cache)',
    in: 'entrée',
    tokensOut: 'Tokens ↑',
    tokensOutTip: 'Tokens de {out} : le texte généré par Claude',
    out: 'sortie',
    cache: 'Cache',
    cacheTip: 'Tokens lus depuis le {cache} de contexte (réutilisés, facturés à prix réduit)',
    cacheWord: 'cache',
    duration: 'Durée',
    durationTip: 'Temps écoulé entre le premier et le dernier message de la session',
  },

  /** Ce que la barre du flux annonce : quelle piste on lit. */
  scope: {
    main: 'Fil principal — les sous-agents ont leur piste',
    all: 'Session complète — tout est affiché',
    track: 'Piste de {agent} — {turns}',
    turns: '{n} tour | {n} tours',
    unnamed: 'sous-agent',
  },
  expandAll: 'Tout déplier',
  collapseAll: 'Tout replier',

  emptyMain: 'Le fil principal ne porte aucun message — tout le travail est dans les pistes ci-dessus.',
  emptyTrack: 'Aucun message dans cette piste.',

  aside: 'Suivi, contexte et diagnostic de la session',
  tasks: 'Tâches',
  context: 'Fenêtre de contexte',
  diagnostic: 'Diagnostic de la session',
}
