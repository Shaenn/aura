// Ce que l'Atelier dit pendant qu'un agent travaille : la ligne d'activité, le
// formulaire de question, la zone de saisie. Ce que l'écran dit autour vit dans
// `pages/atelier.ts`.

export default {
  activity: {
    // `tool` n'a pas de libellé : la phase se nomme de ses outils.
    requesting: 'Requête en cours',
    thinking: 'Réflexion',
    writing: 'Rédaction',
    compacting: 'Compactage du contexte',
    retrying: 'Nouvelle tentative',
    retryAttempt: 'Nouvelle tentative {attempt}/{max}',
    toolUnnamed: 'Outil en cours',
    /** Le décompte avant la prochaine tentative. */
    retryNow: 'maintenant',
    retryIn: 'dans {n} s',
    thinkingTokens: '~{n} tokens',
    outputTooltip: 'Tokens écrits par le modèle depuis le début du tour',
  },
  ask: {
    title: "L'agent attend une réponse",
    close: 'Fermer pour relire la conversation',
    closeHint: 'Fermer pour relire la conversation — vos réponses sont gardées',
    multiSelect: 'choix multiple',
    notes: 'Précision (facultatif)',
    notesAria: 'Précision à joindre à la réponse',
    previous: 'Précédent',
    next: 'Suivant',
    submit: 'Répondre',
    missing: '{n} question sans réponse | {n} questions sans réponse',
  },
  /** Le bandeau d'autorisation, quand l'agent demande à employer un outil. */
  permission: {
    detail: "Voir l'appel complet",
    allow: 'Autoriser',
    always: 'Toujours autoriser',
    deny: 'Refuser',
  },

  composer: {
    aria: "Message à l'agent",
    interrupt: 'Interrompre',
    send: 'Envoyer',
    ended: 'Session terminée.',
    working: "Écrire pendant que l'agent travaille…",
    idle: 'Message à l’agent…',
    /** Les images collées depuis le presse-papier, avant d'être envoyées. */
    images: {
      aria: 'Images jointes à ce message',
      alt: 'Image collée {n}',
      drop: 'Retirer {name}',
      type: 'Je ne sais pas joindre une image de type {type}. PNG, JPEG, GIF et WebP passent.',
      tooBig: "Cette image dépasse 5 Mo, ce que l'API refuse. Une capture réduite passera.",
    },
    /** Le menu ouvert par une barre oblique en tête de message. */
    commands: {
      aria: 'Commandes disponibles',
      loading: 'Je cherche les commandes de cette session.',
      none: 'Aucune commande ne porte ce nom.',
    },
    /** Le menu ouvert par une arobase, n'importe où dans le message. */
    files: {
      aria: 'Fichiers du dossier de travail',
      loading: 'Je parcours le dossier de travail.',
      none: 'Aucun fichier du projet ne correspond.',
      expand: 'Déplier ce dossier',
      collapse: 'Replier ce dossier',
      hidden: '{n} fichier | {n} fichiers',
      truncated: 'Le dossier est trop grand : je n’en montre qu’une partie.',
    },
  },
};
