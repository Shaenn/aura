import type { MessageSchema } from '../../fr';

const sessions: MessageSchema['pages']['sessions'] = {
  title: 'Live sessions',
  empty: 'I see no Claude Code session running on this machine.',
  reloadAria: 'Reload the session list',
  filter: 'Filter project or session…',
  filterAria: 'Filter sessions by project or by name',
  noMatch: 'No session matches your filter.',
  groupCount: '{n} session | {n} sessions',
  groupLive: ', {n} active',
  unknownStatus: '—',
  noProject: 'no project',
  fallbackName: 'session',

  stream: 'Session stream',
  pick: 'Pick a session to follow its stream live.',
  noTranscript: "I can't find the transcript for this session.",
  copyPath: 'Click to copy the path',
  copyPathAria: 'Copy the project path: {path}',
  pathCopied: 'Path copied.',
  copyFailed: "I couldn't copy: the browser denies me the clipboard.",
  autoScroll: 'Auto-scroll',
  followLive: 'Follow live',
  badge: {
    live: 'LIVE',
    wait: 'PERMISSION',
    idle: 'idle',
  },

  emptyMain: 'The main thread carries no message — all the work is in the tracks above.',
  emptyTrack: "I haven't received anything from this session yet.",
  error: 'Transcript unreadable.',

  permission: {
    title: 'Waiting for your permission',
    generic:
      "The request (a folder access, for instance) is handled in the session's terminal and does not show up on the file side — I don't know its detail.",
    hint: "Answer in the session's terminal: I don't click “yes” on your behalf, but I can pre-approve to avoid these interruptions later.",
    allow: 'Always allow…',
    manage: 'Manage permissions',
  },

  aside: 'Session tasks and context',
  tasks: 'Tasks',
  panelAria: 'Project context and resources',
  tabContext: 'Context window',
  tabResources: 'Resources',

  allow: {
    title: 'Pre-approve an action',
    desc: 'Adds a rule to {allow} in {file}. Further actions matching this pattern will no longer ask for permission. Does not affect the pending request.',
    label: 'Permission rule',
    hint: 'e.g. Bash(npm test:*) · Read · WebFetch(domain:*)',
    preview: 'Preview the write',
    duplicate: 'This rule is already in permissions.allow.',
    added: 'Rule added to settings.json.',
    addedNote: 'It applies to further requests, not to this one.',
  },
};

export default sessions;
