import type { MessageSchema } from '../../fr'

const atelier: MessageSchema['pages']['atelier'] = {
  title: 'Workshop',
  lead: 'I launch the agent and I hold it: every tool it wants to use goes through you, with no terminal.',

  gone: {
    what: 'This session is no longer open — the server has restarted since, or it was stopped. Its transcript is kept, and the conversation can pick up where it left off.',
    resume: 'Resume',
    replay: 'Replay',
  },

  live: {
    head: 'Open sessions',
    working: 'Working',
    waiting: 'Waiting',
    idle: 'Idle',
    ended: 'Ended',
    failed: 'Failed',
    join: 'Join the {folder} session',
    stop: 'Stop the {folder} session',
  },

  where: 'Where to work',
  projectSessions: '{n} session | {n} sessions',
  folder: 'Working folder',
  folderAria: 'Working folder for the session',
  browse: 'Browse…',
  picking: 'The picker is open — it may have slipped behind this window.',

  resume: 'Resume a session from this folder',
  untitled: 'Untitled',
  resumeTurns: '{n} turn | {n} turns',
  noResume: "I haven't recorded any session for this folder.",

  modelLabel: 'Model',
  modelAria: 'Model for the session',
  modelPlanned: 'Model planned: {id}. I will confirm it on the first turn.',
  modelChosen: 'Model in use: {id}',
  modelInherited: 'Model in use, inherited from your settings: {id}',
  permissionsLabel: 'Permissions',
  permissionsAria: 'Permission mode for the session',
  open: 'Open the session',
  launchError: 'Error',

  models: {
    settings: 'Settings',
    settingsTip: 'The model from your settings: {model}.',
    settingsNone: 'Your settings pin no model: Claude Code picks one.',
  },
  modes: {
    default: 'Ask',
    defaultTip: 'Anything risky is put to you.',
    auto: 'Automatic',
    autoTip: 'A classifier settles the routine cases; anything ambiguous is put to you.',
    acceptEdits: 'Edits',
    acceptEditsTip: 'File edits go through on their own; the rest is put to you.',
    plan: 'Plan',
    planTip: 'The agent thinks and runs nothing.',
    fromSettings: '{tip} This is the mode from your settings.',
  },

  status: {
    idle: 'Ready',
    working: 'At work',
    waiting: 'Waiting for you',
    ended: 'Ended',
    failed: 'Stopped on error',
  },
  resumed: 'resumed',
  lost: 'I’ve lost contact',
  autoScroll: 'Auto-scroll',
  followLive: 'Follow live',
  fullReplay: 'Full replay',
  stop: 'Stop',

  empty: 'Session open on {cwd}. Nothing has been asked yet — the agent only starts on the first message.',

  askMany: '{n} questions are waiting',
  askOne: 'The agent is waiting for an answer',
  answer: 'Answer',
  composer: 'Talk to the agent',

  aside: 'Tasks, context and resources',
  tasks: 'Tasks',
  workCollapse: 'Collapse the tracker',
  workExpand: 'Expand the tracker',
  panelAria: 'Project context and resources',
  tabContext: 'Context window',
  tabResources: 'Resources',
  contextPending: 'The context window is read from the transcript: it will show up at the end of the first turn.',
}

export default atelier
