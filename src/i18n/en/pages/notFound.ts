import type { MessageSchema } from '../../fr'

const notFound: MessageSchema['pages']['notFound'] = {
  title: 'Page not found',
  kicker: 'ERROR 404',
  message: "I can't find this address.",
  detail: "It doesn't exist, or the screen it pointed to has been renamed.",
  home: 'Back to the overview',
  help: 'Open the manual',
}

export default notFound
