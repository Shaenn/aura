import type { MessageSchema } from '../../fr';

const maintenance: MessageSchema['pages']['maintenance'] = {
  title: 'Maintenance & system',
  subtitle: 'storage · orphan plans · processes',
  reload: 'Reload',
  storage: 'Storage',
  purge: 'Purge',
  protected: 'protected',
  backupsArea: 'AURA backups',
  orphanPlans: 'Plans with no project',
  purged: 'Area purged.',
  confirm: {
    transcriptsTitle: 'Delete every transcript',
    transcriptsMessage:
      'I’m about to delete the whole “projects” folder — the transcripts of every one of your conversations. No session will be replayable again, and I won’t be able to undo it.',
    areaMessage: 'I’m about to delete “{area}”. I won’t be able to undo it.',
    deleteAll: 'Delete everything',
  },
  errors: {
    storage: "I couldn't measure storage",
    purge: "I couldn't purge this area",
    processes: "I couldn't read the processes",
    kill: "I couldn't terminate that process",
  },

  processes: {
    head: 'Claude processes',
    intro:
      'The disk does not declare everything: a daemon, a pty host or the Chrome extension bridge write no session file. They show up here, and nowhere else.',
    unsupported:
      'I do not know how to enumerate processes on this system. The list stays empty, which does not mean nothing is running.',
    empty: 'I see no Claude process at all, not even my own — which is surprising.',
    orphan: 'orphan',
    self: 'me',
    kind: {
      aura: 'AURA',
      atelier: 'Workshop',
      interactive: 'Terminal',
      'bg-job': 'Job',
      'pty-host': 'Pty host',
      daemon: 'Daemon',
      'native-host': 'Chrome bridge',
      other: 'Other',
    },
    stop: 'Terminate process {pid}',
    confirm: {
      title: 'Terminate this process?',
      tree: 'I’m about to terminate {pid} and the {n} processes beneath it. Cutting a job without its host would see it reborn at once, which is why I take the whole tree.',
      single: 'I’m about to terminate process {pid}. It will not restart on its own.',
      ok: 'Terminate',
    },
    killed: 'Terminated: {n} processes.',
  },
  orphans: {
    intro:
      'These plans could not be tied back to the project that produced them: their session carries no {field}. This is the only place they can be read and deleted — every other plan is reached from its project.',
    retry: 'Try again',
    empty: 'No orphan plan: every plan is tied to a project.',
    preview: 'Plan preview',
    placeholder: 'Select a plan to show it here.',
    deleteTitle: 'Delete this plan?',
    deleted: 'Plan deleted.',
    deleteError: "I couldn't delete this plan",
  },
};

export default maintenance;
