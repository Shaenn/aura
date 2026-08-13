import type { MessageSchema } from '../fr';

const formats: MessageSchema['formats'] = {
  bytes: { b: 'B', kb: 'KB', mb: 'MB', gb: 'GB' },
  duration: { ms: 'ms', s: 's', min: 'min', h: 'h' },
  justNow: 'just now',
};

export default formats;
