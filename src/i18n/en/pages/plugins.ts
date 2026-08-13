import type { MessageSchema } from '../../fr';

const plugins: MessageSchema['pages']['plugins'] = {
  title: 'Plugins & Marketplaces',
  marketplaces: 'Marketplaces',
  badges: { pending: 'pending', added: 'added', builtin: 'built-in' },
  removeMarketplaceAria: 'Remove marketplace {name}',
  sourcePlaceholder: 'owner/repo · https://…/repo.git · ./local-path',
  sourceAria: 'Marketplace source',
  sourceRequired: 'Source required',
  getCommand: 'Get the command',
  marketplaceHint:
    'Adding and removing marketplaces goes through Claude Code, which manages those files. I give you the exact command to run.',
  installed: 'Installed plugins',
  empty: "I don't see any installed plugin.",
  stateAria: 'State of {id}',
  uninstallAria: 'Uninstall {id}',
  removeFromConfig: 'Remove from the config too',
  uninstallTitle: 'Uninstall the plugin',
  uninstallNote: 'Uninstalling removes the plugin and clears its cache — handled by Claude Code.',
  addTitle: 'Add a marketplace',
  addNote: 'Claude Code will clone or copy the marketplace, then make it available.',
  removeTitle: 'Remove the marketplace',
  removeNote: 'This command also uninstalls the marketplace plugins and deletes its local clone.',
  readError: "I couldn't read your plugin settings",
};

export default plugins;
