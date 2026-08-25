import type { MessageSchema } from '../fr'

const diagnostics: MessageSchema['diagnostics'] = {
  severity: {
    critical: 'Critical',
    warn: 'Worth watching',
    info: 'For information',
  },
}

export default diagnostics
