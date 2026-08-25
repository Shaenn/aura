import type { MessageSchema } from '../../fr'

import context from './context'
import cost from './cost'
import thread from './thread'
import tools from './tools'

const replay: MessageSchema['replay'] = {
  ...thread,
  context,
  cost,
  tools,
}

export default replay
