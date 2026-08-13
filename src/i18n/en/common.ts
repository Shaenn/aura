import type { MessageSchema } from '../fr';

const common: MessageSchema['common'] = {
  copy: 'Copy',
  copied: 'Copied',
  loading: 'Loading…',
  delete: 'Delete',
  cancel: 'Cancel',
  retry: 'Retry',
  refresh: 'Reload',
  search: 'Search…',
  close: 'Close',
  collapse: 'Collapse {label}',
  expand: 'Expand {label}',
  enabled: 'On',
  disabled: 'Off',
  unsaved: 'unsaved',
  propose: 'Preview…',
  proposeError: "I couldn't prepare the change",
  readOnly: 'read only',
  noDetail: "I couldn't see it through.",
};

export default common;
