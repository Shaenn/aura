import type { MessageSchema } from '../fr'

const rules: MessageSchema['rules'] = {
  empty: 'No rule.',
  add: 'Add',
  placeholder: 'e.g. Bash(npm run *)',
  removeAria: 'Remove rule {rule}',
  addAria: 'Add a rule to {label}',
}

export default rules
