import type { Catalog } from './index.ts';
import diagnostics from './en-diagnostics.ts';

// Anglais du BFF. La charte `docs/voice.md` s'applique : sobre et direct, jamais
// de `please`, jamais de `sorry`, et une erreur qui dit ce qui reste possible.

const en: Catalog = {
  diagnostics,
  errors: {
    notFound: 'Not found.',
    fileNotFound: 'File not found.',
    entryNotFound: 'Entry not found.',
    backupNotFound: 'Backup not found.',
    planNotFound: 'Plan not found.',
    unknownSession: 'Unknown session.',
    processNotFound:
      'I cannot find that process among Claude’s. It may have just exited — reload the list.',
    cannotKillSelf:
      'I do not terminate myself. Use the shutdown: it stops the Workshop sessions first.',
    paramRequired: 'The "{name}" parameter is required.',
    paramsRequired: 'The "{first}" and "{second}" parameters are required.',
    bodyExpected: 'Expected body: {shape}.',
    dateFormat: 'Dates are expected in YYYY-MM-DD format.',
    dateOrder: '"from" must come before "to".',
    projectAndIdRequired: '`project` and `id` are both required.',
    unknownRules: 'Unknown rule: {names}.',
    invalidPreferences: 'Invalid preferences.',
    serverNameRequired: 'A server name is required.',
    workdirRequired: 'A working folder is required.',
    tooManySessions:
      'I am not opening another session: {max} are already running, and each holds a process. Close one and I will open this one.',
    emptyMessage: 'Empty message.',
    attachmentsShape: 'I could not read the attached images. The turn was not sent.',
    attachmentType:
      'I cannot attach an image of type {type}. The turn was not sent — PNG, JPEG, GIF and WebP work.',
    attachmentTooBig:
      'This image is over 5 MB, which the API refuses. The turn was not sent; a smaller capture will go through.',
    unknownAttachment: 'This image is no longer in memory. It remains in the transcript.',
    /** La sortie d'un shell de fond : le fichier est temporaire, il s'efface. */
    unknownShell: "I can't find this shell's output. The temporary file is gone.",
    permissionModeRequired: 'A permission mode is required.',
    purgeTargetRequired: 'I do not delete a backup without knowing which one.',
    unexpected: 'I could not see this operation through. The details are in my log.',
    permissionModeUnknown: 'I do not open a session in {mode} mode.',
    decisionExpected: 'Expected answer: allow, allow-always or deny.',
    answersExpected: 'One answer per question is expected.',
    alreadyDecided: 'This request has already been decided.',
    questionAlreadyDecided: 'This question has already been answered.',
    accessDenied: 'Access denied.',
  },

  guard: {
    outsideRoot: 'Path outside the managed folder: {path}',
    notWritable: "I don't write outside the editable resources: {path}",
    fileChanged: 'The file changed on disk since the preview.',
    claudeJsonChanged: '~/.claude.json changed on disk since the preview.',
    badHost: 'I only answer a request addressed to this machine.',
    crossSite: 'I do not answer a request coming from another site.',
  },

  mcp: {
    argsMustBeStrings: 'args must be a list of strings.',
    unknownTransport: 'Unknown transport: give either a command (stdio) or a URL (http).',
  },

  agent: {
    permissionTimeout:
      'Nobody answered this permission request within fifteen minutes; I am denying it by default.',
    sessionStopped: 'Session stopped.',
    deniedFromAtelier: 'Denied from the Workshop.',
    sessionEnded: 'The session stopped: {message}',
    cleared:
      'I am opening a new session. The context is empty; the previous exchange stays on disk.',
    clearedByCommand:
      'I am opening a new session: /clear emptied the context. The previous exchange stays on disk.',
    pickerUnavailable: 'No folder picker available on {platform}.',
    noPowerShell: 'No PowerShell host found.',
  },

  /** What AURA says in a messaging app. See the French catalogue for the why. */
  passerelle: {
    accueil: 'I drive the Claude Code Workshop from this conversation.',
    accueilProjets: 'I know {n} projects.',
    accueilUnProjet: 'I know one project.',
    accueilAucunProjet: 'Claude Code has not worked on any project here yet.',
    accueilSession: 'A session is already open here, on {cwd}.',
    accueilTravaux: '{n} sessions are running right now.',
    accueilUnTravail: 'One session is running right now.',
    menuProjets: 'Projects',
    menuSessions: 'Sessions',
    menuAide: 'Help',
    aideEntete: 'I drive the Workshop from this conversation.',
    aidePied: 'Any other message goes to the session as a turn.',
    aideConsulter: 'Browsing, without starting anything:',
    aideTravailler: 'Working:',
    aideArgument: '<n>',
    commandes: {
      projets: 'The projects Claude Code knows, numbered.',
      projet: 'A project’s tree: you walk down folder by folder.',
      voir: 'The contents of a file from the last list.',
      atelier: 'I open a session on that project.',
      etat: 'Where this conversation’s session stands, and its context window.',
      compacter: 'I compact the conversation without waiting for the window to fill.',
      sessions: 'What is running right now.',
      stop: 'I interrupt the current turn.',
      fin: 'I close this conversation’s session.',
      aide: 'I repeat what I can do.',
    },
    sessionOuverte: 'Session open on {cwd}. Tell me what needs doing.',
    projets: 'The projects I know. The number works with /projet and /atelier.',
    aucunProjet: 'Claude Code has not worked on any project here yet.',
    projetInconnu: 'I do not recognise that project. /projets lists the ones I open, numbered.',
    dossier: '{ou} — {total} files.',
    ouvrirIci: '▶ Open the Workshop here',
    retourProjets: '◀ Projects',
    remonter: '◀ Parent folder',
    navigationPerimee: 'This list predates my restart. Run /projets again.',
    projetVide: 'I find nothing to read in {nom}.',
    aucuneListe: 'Pick a project first with /projet <n>.',
    fichierInconnu: 'That number matches no file in the last list.',
    pageDe: '{fichier} — page {page} of {total}',
    precedent: '◀ Previous',
    suivant: 'Next ▶',
    aucunFil: 'No session is open here. Open one with /atelier <folder>.',
    aucuneSession: 'Nothing is running right now.',
    sessionsAtelier: 'Opened by AURA — I can talk to these:',
    sessionsAilleurs: 'Opened elsewhere — I can see them, I do not drive them:',
    sessionFinie: 'The session ended.',
    sessionEchouee: 'The session stopped: {message}',
    etatEntete: '{cwd} — {modele}, {mode} mode',
    etatModeleInconnu: 'unknown model',
    etatFenetre: 'Window: {tokens} / {limite} tokens — {pourcent}%',
    etatSansReleve: 'No turn has answered yet: I have no reading of the window.',
    compaction: 'I compacted the conversation: {avant} tokens brought down to {apres}.',
    compactionResume: 'What I kept from the conversation',
    fenetrePleine: 'The window is {pourcent}% full — a compaction is coming.',
    permission: 'I would like to use {outil}.',
    autoriser: 'Allow',
    plan: 'Here is the plan I propose. I write nothing before you approve it.',
    approuver: 'Approve',
    refuser: 'Deny',
    refuseDeLoin: 'Denied from the messaging app.',
    questionEtape: '{header} — question {n} of {total}',
    questionMultiple: 'Several answers are expected.',
    questionLibre: 'Tap an option, or write your own answer.',
    questionValider: 'Confirm',
    questionExpiree: 'Nobody answered this question within fifteen minutes; I let it go.',
    commandeInconnue: 'I do not know {commande}. /aide lists what I can do.',
    /** The ephemeral bubble shown while a turn is working. */
    activite: {
      ligne: '{quoi} — {duree}',
      requesting: 'Request in flight',
      thinking: 'Thinking',
      writing: 'Writing',
      compacting: 'Compacting context',
      retrying: 'Retry {attempt}/{max}',
      toolUnnamed: 'Tool running',
      secondes: '{n}s',
      minutes: '{min}m {s}s',
    },
  },

  hooks: {
    failed: 'The hook failed (code {code}).',
    blocked: 'The hook stopped the turn from continuing.',
  },

  context: {
    preamble: '(preamble)',
    skillNamed: 'Skill {names}',
    skillInvoked: 'Skill invoked',
    deferredTools: 'Deferred tools ({count})',
    hookBlocked: 'Hook {name} — blocked',
    todoReminder: 'Task reminder ({count})',
    turnReasoning: 'Turn {turn} — reasoning and answer',
  },

  storage: {
    projects: 'Conversation transcripts',
    'file-history': 'History of edited files',
    telemetry: 'Pending telemetry',
    'paste-cache': 'Paste cache',
    'shell-snapshots': 'Shell snapshots',
    plans: 'Generated plans',
  },
};

export default en;
