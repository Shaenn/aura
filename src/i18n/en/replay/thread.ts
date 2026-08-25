import type { MessageSchema } from '../../fr'

type Thread = Omit<MessageSchema['replay'], 'context' | 'cost' | 'tools'>

const thread: Thread = {
  tracks: {
    aria: 'Session tracks',
    main: 'Main',
    mainCount: '{n} message | {n} messages',
    subagent: 'Subagent',
    turns: '{n} turn | {n} turns',
    id: 'id {id}',
    status: {
      running: 'running',
      completed: 'completed',
      failed: 'failed',
      unknown: 'state unknown',
    },
  },

  timeline: {
    phase: 'Phase {n}',
    compacted: '{before} → {after} tokens',
    silent: '{n} hook run with no effect · {total} in total | {n} hook runs with no effect · {total} in total',
    silentNote: 'These hooks ran without returning anything to Claude or reporting an error.',
  },

  loose: {
    summary: 'Summary',
    system: 'System',
    systemSub: 'System · {sub}',
  },

  turn: {
    tools: '{n} tool | {n} tools',
    thinking: 'thinking',
    windowTip: '⧉ Context window at the end of the card: {n}',
    deltaTip: '+ {n} added on this card',
    outputTip: '↑ {n} tokens generated on this turn',
    mark: 'Turn {n}',
    injected: '{n} injected | {n} injected',
    redacted: 'Thinking — not kept in the transcript',
    image: '🖼 [image]',
    sysMeta: 'System (context)',
    sysReport: 'Subagent report',
    sysToAgent: 'Message received by the agent',
    sysOrigin: 'System · {origin}',
  },

  thinking: {
    title: 'Thinking',
  },

  fillCurve: {
    caption: 'Fill over {turns} turns — peak {peak} / {limit}{compactions}',
    compactions: '· {n} compaction | · {n} compactions',
  },

  user: {
    you: 'You',
    brief: 'Brief sent to the agent',
    copyMine: 'Copy your message',
    copyBrief: 'Copy the brief',
    queued: 'mid-turn',
    queuedHint: 'Written while the agent was working: the CLI queued it, then handed it over in the middle of its reply.',
    imageLabel: 'Image attached to the message',
    imageMissing: '🖼 [image attached]',
  },

  live: {
    label: 'Turn in progress',
    hint: "Claude Code only writes a turn once it has settled. I won't have the rest until the end, in one block.",
  },

  images: {
    unloadable: '{n} image — cannot be loaded from this view | {n} images — cannot be loaded from this view',
    byTool: 'Image rendered by {tool}',
    alt: 'Transcript image',
    open: 'Open',
    full: 'Transcript image, full size',
  },

  hook: {
    status: {
      ok: 'ran',
      context: 'context injected',
      error: 'failed',
      blocked: 'turn blocked',
    },
    injected: "Context injected into Claude's thread",
    blocked: 'Turn blocked',
    error: 'Error',
    command: 'Command',
    stderr: 'Error output',
    exit: 'code {n}',
  },

  ask: {
    free: 'free answer:',
    note: 'note:',
    rejected: '— question dropped —',
    pending: '— waiting for an answer —',
    none: '— no question asked —',
    afk: 'No answer after {n}s — what followed was decided without it.',
  },

  compaction: {
    title: 'Context compacted',
    auto: 'automatic — the window was full',
    manual: 'manual — /compact',
    pending: 'The size afterwards is not known yet',
    unit: 'tokens',
    removed: '{amount} removed from the context{percent}{duration}',
    removedAmount: '{n} tokens',
    removedPercent: '({p})',
    removedIn: ', in {d}',
    note: 'Claude no longer sees the detail of what came before, only its summary.',
    pendingNote:
      'Claude no longer sees the detail of what came before, only its summary. The size of the new window will be known at the end of the turn.',
    summary: 'Summary kept after the compaction',
    summaryTokens: '~{n} tokens',
  },

  planMode: {
    enter: 'Plan mode',
    exit: 'Left plan mode',
    reentry: 'Back to the plan',
    scope: '{n} turn | {n} turns',
    whatExit: 'The model can write again.',
    whatReentry: 'The session picks up the plan already started.',
    whatResume: 'Read-only: the model resumes an existing plan, it writes nothing else.',
    whatNew: 'Read-only: the model explores and proposes a plan, it writes nothing else.',
  },

  command: {
    output: 'Command output',
  },

  skillDoc: {
    loaded: 'loaded into the context',
    lines: '{n} line | {n} lines',
    origin: {
      bundled: 'bundled with the CLI',
      plugin: 'plugin',
      project: 'project',
      personal: 'personal',
    },
  },

  tasks: {
    pastOne: 'Previous plan',
    pastMany: 'Previous plans',
    planN: 'Plan {n}',
    planTasks: 'Tasks of plan {n}',
    currentPlan: 'Tasks of the current plan',
    sessionTasks: 'Session tasks',
    planAria: 'Work plan laid out',
    planLabel: 'work plan',
  },

  /** Commands the session launched in the background. */
  shells: {
    title: 'Background',
    past: 'One finished command | {count} finished commands',
    goto: 'See the call in the thread',
    done: 'finished',
    failed: 'finished, code {code}',
    stopped: 'stopped',
    lastWrite: 'nothing written for {ago}',
    noOutput: 'no output',
    loading: 'Reading output…',
    empty: 'This shell has written nothing yet.',
    skipped: '[… {n} bytes above]',
  },

  report: {
    empty: 'No report returned by the agent.',
    details: 'Technical details',
    file: 'file',
  },

  teammate: {
    unknown: 'a teammate',
    empty: 'Empty message.',
    notice: {
      idle_notification: 'Has nothing in progress.',
      shutdown_request: 'Asks to stop.',
      shutdown_approved: 'Shutdown approved.',
      teammate_terminated: 'Has stopped.',
    },
  },
}

export default thread
