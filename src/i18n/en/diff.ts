import type { MessageSchema } from '../fr'

const diff: MessageSchema['diff'] = {
  title: 'Confirm the write',
  newFile: 'new file',
  noChange: 'I see nothing to change: the file is already in this state.',
  apply: 'Apply',
  applied: 'Change applied.',
  conflict: 'The file changed on disk since I showed it to you. Reload before applying again.',
  failed: "I couldn't write the file.",
}

export default diff
