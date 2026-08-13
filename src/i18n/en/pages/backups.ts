import type { MessageSchema } from '../../fr';

const backups: MessageSchema['pages']['backups'] = {
  title: 'Backups & restore',
  sub: '.local/backups · {n} version · {size} | .local/backups · {n} versions · {size}',
  purgeAll: 'Purge all',
  empty: "I haven't backed up anything yet. I take one automatically before each write.",
  pickFile: 'Pick a file to see its versions.',
  restore: 'Restore…',
  purgeOneAria: 'Purge the {date} version',
  restored: 'Version restored.',
  purgeMessage:
    "I'm about to delete all {n} backups. After that, I won't be able to undo any past write.",
  purgeOk: 'Delete all',
  purgeOneTitle: 'Delete this version',
  purgeOneMessage:
    "I'm about to delete the {date} version of {file}. This copy is the only one, and I won't be able to get it back.",
  purgeOneOk: 'Delete',
  purgedOne: 'Version deleted.',
  readError: "I couldn't read the backups",
  prepareError: "I couldn't prepare the restore",
  deleteError: "I couldn't delete this version",
  purgeError: "I couldn't purge the backups",
};

export default backups;
