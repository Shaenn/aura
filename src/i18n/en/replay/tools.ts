import type { MessageSchema } from '../../fr'

const tools: MessageSchema['replay']['tools'] = {
  call: {
    status: {
      ok: 'ok',
      error: 'error',
      running: 'running',
      none: 'no result',
    },
    tokensTip: 'About {n} tokens added to the context (estimated from the character count).',
    tokensTipImages:
      'About {n} tokens added to the context (estimated from the character count, and from the dimensions for the image). | About {n} tokens added to the context (estimated from the character count, and from the dimensions for the images).',
  },

  output: {
    error: 'Error',
    result: 'Result',
    lines: '{n} line | {n} lines',
    loadFull: 'Load the full output',
    seeAll: 'See all ({n} lines)',
    reduce: 'Collapse',
    copy: 'Copy the result',
    status: {
      ok: 'ok',
      error: 'failed',
      empty: 'empty',
    },
    noReload: 'The file cannot be re-read from this view.',
    tooBig: 'File too large: only the beginning is shown.',
    unreadable: "I couldn't read this file.",
  },

  code: {
    copy: 'Copy {what}',
    theCode: 'the code',
  },

  diff: {
    caption: 'Differences for {file}:',
    identical: 'identical',
    perOccurrence: 'per occurrence',
    replaceAll: 'replace all',
    copyNew: 'Copy the new text',
    editedFile: 'the edited file',
  },

  params: {
    empty: '— no parameter —',
  },

  paths: {
    count: '{n} file | {n} files',
    overflow: '{n} further file not shown. | {n} further files not shown.',
  },

  service: {
    identicalTo: 'Result identical to an earlier `{tool}` call — the CLI did not send it back a second time.',
    dontAsk: 'the session was running without asking for confirmation',
  },

  summary: {
    lineRange: 'l. {from}-{to}',
    lineFrom: 'l. {from}…',
    everywhere: 'everywhere',
    planSubmitted: 'Plan submitted for approval',
    planMode: 'Entering plan mode',
    shutdownAsk: 'shutdown request',
    shutdownYes: 'shutdown approved',
    shutdownNo: 'shutdown refused',
  },

  chips: {
    pattern: 'pattern',
    in: 'in',
    glob: 'glob',
    type: 'type',
    mode: 'mode',
    caseInsensitive: 'insensitive',
    yes: 'yes',
    symbol: 'symbol',
    agent: 'agent',
    model: 'model',
    isolation: 'isolation',
    to: 'to',
    team: 'team',
    request: 'request',
    task: 'task',
    background: 'background',
    delay: 'delay',
    stop: 'stop',
    seconds: '{n}s',
    allowedDomains: 'allowed domains',
    blockedDomains: 'blocked domains',
  },

  views: {
    agent: {
      state: {
        running: 'at work',
        completed: 'completed',
        failed: 'failed',
        unknown: 'no news',
      },
      turns: '{n} turn | {n} turns',
      files: '{n} file | {n} files',
      follow: 'Follow the agent’s track',
      open: 'Open the agent’s track',
      prompt: 'Brief sent to the agent',
      report: 'Agent report',
      async: 'Agent launched in the background. Its reply does not arrive here: it comes back later, in a turn of its own.',
    },

    enterPlan: {
      what: 'The model goes read-only: it explores and proposes a plan, it does not write.',
    },

    glob: {
      sameAsBefore: 'Same result as an earlier {tool} call.',
      empty: 'No file matches.',
      order: 'oldest to most recent',
      cutSome: '{rest} more are not listed, out of {total} in total: the list keeps the oldest, the recent changes are missing.',
      cutAll: 'The list is truncated: it keeps the oldest, the recent changes are missing.',
    },

    grep: {
      empty: '— no match —',
      modes: {
        files_with_matches: 'files only',
        count: 'count',
      },
      overflow: '{n} further match not shown. | {n} further matches not shown.',
      paged: 'Paged search: {parts} — there may be others.',
      pagedOffset: 'the first {n} were skipped',
      pagedLimit: 'at most {n} are shown',
    },

    lsp: {
      failed: 'The language server did not answer.',
      refused: 'Call refused by the user.',
      noResult: 'No result.',
      indexing: 'A language server that has not finished indexing the project answers the same way.',
      line: 'l.',
      callAt: 'call at {at}',
      countIn: '{n} {what} in {files} files',
      count: '{n} {what}',
      kinds: {
        Property: 'property',
        Method: 'method',
        Constant: 'constant',
        Variable: 'variable',
        Class: 'class',
        Function: 'function',
        File: 'file',
        Namespace: 'namespace',
        Module: 'module',
        Field: 'field',
        Interface: 'interface',
        Enum: 'enum',
        Struct: 'struct',
        Constructor: 'constructor',
      },
      empty: {
        findReferences: 'No reference to this symbol.',
        hover: 'No information available at this position.',
        documentSymbol: 'No symbol in this file.',
        workspaceSymbol: 'No symbol by that name in the project.',
        goToDefinition: 'No definition found.',
        goToImplementation: 'No implementation found.',
        prepareCallHierarchy: 'No call hierarchy at this position.',
        incomingCalls: 'No incoming call.',
        outgoingCalls: 'No outgoing call.',
      },
      what: {
        reference: 'reference | references',
        symbol: 'symbol | symbols',
        definition: 'definition | definitions',
        implementation: 'implementation | implementations',
        incomingCall: 'incoming call | incoming calls',
        outgoingCall: 'outgoing call | outgoing calls',
      },
    },

    plan: {
      allowed: 'Pre-approved commands',
      edited: 'Changes made by the user',
      approved: 'Plan approved.',
    },

    read: {
      display: 'Display of the file read',
      preview: 'Preview',
      trailer: 'Notes appended to the result',
    },

    write: {
      display: 'Display of the file written',
    },

    search: {
      query: 'Search',
      found: 'Tools found',
      loaded: 'Tools loaded',
      noMatch: 'No deferred tool matches this search.',
      noSuchName: 'No deferred tool goes by this name — nothing was loaded. | No deferred tool goes by these names — nothing was loaded.',
      asked: 'Load requested',
      notKept: "The transcript didn't keep the result of this search.",
      reserve: '{n} tool still in reserve. | {n} tools still in reserve.',
    },

    sendMessage: {
      kind: {
        shutdown_request: 'shutdown request',
        shutdown_response: 'reply to a shutdown request',
      },
      askStop: 'Asks to stop.',
      askStopWhy: 'Asks to stop — {reason}.',
      approved: 'Shutdown approved.',
      refused: 'Shutdown refused.',
      unreachable: 'No agent named “{name}” is reachable.',
      delivered: 'Dropped into {who}’s inbox.',
      queued: 'Queued: {who} will get it on its next tool round.',
      noTask: 'had no active task',
      wasStopped: 'was stopped ({why})',
      resumed: 'The agent {state}: resumed in the background from its transcript, with this message.',
      stopSent: 'Shutdown request sent to {who}.',
      stopDone: 'Shutdown approved: {who} has been told, and agent {agent} is exiting.',
    },

    shell: {
      unsandboxed: 'outside the sandbox',
      silent: 'The command wrote nothing.',
      launched: 'Launched in the background, id {id}. Its output goes to a file, outside the transcript.',
      touched: '{n} file already read that the command modified: | {n} files already read that the command modified:',
      exit: 'exit code {code}',
      exitMeaning: 'exit code {code} · {meaning}',
      meaning: {
        '1': 'failure',
        '2': 'usage or syntax',
        '126': 'not executable',
        '127': 'command not found',
        '130': 'interrupted',
      },
      refused: 'Command not run: permission was denied.',
      declined: 'Command not run: the call was refused.',
      cancelled: 'Command not run: the call was cancelled.',
    },

    skill: {
      allowed: 'Tools allowed for the duration of the skill',
    },

    task: {
      stopAgent: 'Stopping a subagent launched in the background.',
      stopCommand: 'Stopping a command launched in the background.',
    },

    web: {
      failed: 'The page did not answer — its content was not read.',
      redirected: 'Redirected to another host — the content was not read.',
      weight: '{size} fetched',
    },

    webSearch: {
      denied: 'The search was not allowed — {why}.',
      results: '{n} result | {n} results',
    },
  },
}

export default tools
