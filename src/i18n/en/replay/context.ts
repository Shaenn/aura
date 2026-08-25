import type { MessageSchema } from '../../fr'

const context: MessageSchema['replay']['context'] = {
  drawer: {
    open: 'Context',
    title: 'Context window',
    close: 'Close the context',
  },

  empty: 'No context data for this session. Turns without a usage record (synthetic models, interrupted sessions) produce none.',
  emptyPhase:
    'Nothing has been played since the compaction. What enters this window will show up on the first turn; earlier phases stay available above.',
  emptyInjections: 'Nothing was injected during this phase.',

  fillLimit: '/ {n}',
  captionLast: 'Context sent to the model on the last turn of the phase — exact figure.',
  captionAfterCompaction: 'Window as the compaction left it — exact figure. No turn has been played in this phase yet.',
  captionPending: 'The compaction has not yet said how large the new window is; it will be known at the end of the turn.',

  costFloor: 'at least —',
  costNote: 'API list price, not what a subscription bills',

  phaseLegend: 'Phase',
  phaseCurrent: 'Current',
  viewLegend: 'View',
  views: {
    category: 'By category',
    ranked: 'By size',
    flat: 'Flat',
    byTurn: 'By turn',
  },

  byTurnCaption: '{exact} growth of the window at each turn; the detail names, as an estimate, what we can attribute to it.',
  byTurnExact: 'Exact',
  byTurnLiveOrder: 'Most recent first.',

  turnLink: 'Turn {n}',
  goToTurn: 'Go to turn {n}',
  rowError: 'error',
  copyPath: 'Copy {path}',
  split: 'in ~{in} · out ~{out}',

  baseline: 'Startup baseline',
  baselineNote:
    'The system prompt and the tool schemas, already there before your first word. Derived from the first turn’s window: that figure is {exact}.',
  baselineExact: 'exact',
  residual: 'Unexplained remainder',
  residualNote: 'Message formatting, injections we cannot read yet, and the estimator’s margin — four characters per token underestimates code.',
  residualCompacted: 'This session having been compacted, the re-injected history summary adds to it.',

  estimateNote:
    'The total and the baseline are exact. Values prefixed with “~” are {estimated} at about 4 characters per token: they give an order of magnitude, not a count.',
  estimateEmphasis: 'estimated',

  categories: {
    memory: 'CLAUDE.md & rules',
    skills: 'Skills',
    files: 'Files',
    tools: 'Tools — inputs and outputs',
    thinking: 'Thinking & replies',
    userMessage: 'Your messages',
    harness: 'Harness',
  },
  pills: {
    memory: 'CLAUDE.md',
    skills: 'Skill',
    files: 'File',
    tools: 'Tool',
    thinking: 'Reply',
    userMessage: 'You',
    harness: 'Harness',
    rule: 'Rule',
  },
  rows: {
    thinking: 'Thinking',
    answer: 'Reply',
  },
}

export default context
