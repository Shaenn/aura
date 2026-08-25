import type { MessageSchema } from '../fr'

const layout: MessageSchema['layout'] = {
  skipToContent: 'Skip to content',
  breadcrumb: 'Breadcrumb',
  connection: {
    online: 'connected',
    offline: 'offline',
    onlineTitle: 'BFF connected',
    offlineTitle: 'BFF unreachable',
  },
  live: {
    count: '{n} running',
    open: '{n} session running — open the tracker | {n} sessions running — open the tracker',
  },
  help: {
    close: 'Close help',
    forSection: 'Help: {section}',
    generic: 'Help',
    empty: "I don't have a manual page for this screen.",
    full: 'Full manual',
  },
  theme: {
    toLight: 'Switch to light mode',
    toDark: 'Switch to dark mode',
    light: 'Light mode',
    dark: 'Dark mode',
  },
  locale: {
    switch: 'Passer en français',
  },
  sessions: {
    busy: '{n} working | {n} working',
    waiting: '{n} waiting on you',
  },
}

export default layout
