import type { MessageSchema } from '../../fr'

const help: MessageSchema['pages']['help'] = {
  title: 'Manual',
  kicker: 'MANUAL',
  intro: 'One page per module. From any screen, the {icon} button in the status bar opens the matching page directly.',
  searchAria: 'Search the manual',
  tocAria: 'Manual contents',
  count: '{n} manual page. | {n} manual pages.',
  found: 'No page found. | One page found. | {n} pages found.',
  noMatch: 'I see no page for “{query}”.',
}

export default help
