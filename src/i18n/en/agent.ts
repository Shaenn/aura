import type { MessageSchema } from '../fr';

const agent: MessageSchema['agent'] = {
  activity: {
    requesting: 'Requesting',
    thinking: 'Thinking',
    writing: 'Writing',
    compacting: 'Compacting context',
    retrying: 'Retrying',
    retryAttempt: 'Retry {attempt}/{max}',
    toolUnnamed: 'Tool running',
    retryNow: 'now',
    retryIn: 'in {n}s',
    thinkingTokens: '~{n} tokens',
    outputTooltip: 'Tokens written by the model since the turn began',
  },
  ask: {
    title: 'The agent is waiting for an answer',
    close: 'Close to re-read the conversation',
    closeHint: 'Close to re-read the conversation — your answers are kept',
    multiSelect: 'multiple choice',
    notes: 'Note (optional)',
    notesAria: 'Note to attach to the answer',
    previous: 'Previous',
    next: 'Next',
    submit: 'Answer',
    missing: '{n} question unanswered | {n} questions unanswered',
  },
  permission: {
    detail: 'See the full call',
    allow: 'Allow',
    always: 'Always allow',
    deny: 'Deny',
  },

  composer: {
    aria: 'Message to the agent',
    interrupt: 'Interrupt',
    send: 'Send',
    ended: 'Session ended.',
    working: 'Write while the agent works…',
    idle: 'Message the agent…',
    images: {
      aria: 'Images attached to this message',
      alt: 'Pasted image {n}',
      drop: 'Remove {name}',
      type: 'I cannot attach an image of type {type}. PNG, JPEG, GIF and WebP work.',
      tooBig: 'This image is over 5 MB, which the API refuses. A smaller capture will go through.',
    },
    commands: {
      aria: 'Available commands',
      loading: 'Looking up this session’s commands.',
      none: 'No command by that name.',
    },
    files: {
      aria: 'Files in the working folder',
      loading: 'Walking the working folder.',
      none: 'No file in the project matches.',
      expand: 'Expand this folder',
      collapse: 'Collapse this folder',
      hidden: '{n} file | {n} files',
      truncated: 'The folder is too large: I am showing only part of it.',
    },
  },
};

export default agent;
