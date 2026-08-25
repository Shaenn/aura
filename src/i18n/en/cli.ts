import type { MessageSchema } from '../fr'

const cli: MessageSchema['cli'] = {
  defaultTitle: 'Command to run',
  copyAria: 'Copy the command',
  copied: 'Command copied.',
  copyFailed: "I couldn't copy: the browser denies me the clipboard.",
  hint: 'To be run in Claude Code (or in a terminal with {cmd}).',
}

export default cli
