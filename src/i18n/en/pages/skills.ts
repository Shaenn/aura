import type { MessageSchema } from '../../fr';

const skills: MessageSchema['pages']['skills'] = {
  title: 'Skills',
  subtitle: 'Personal skills (~/.claude/skills/<name>/SKILL.md) — know-how loaded on demand.',
  empty: "I don't see any personal skill.",
  placeholder: 'Select a skill to show it here.',
  noDescription: "No description: Claude falls back to the body's first paragraph.",
  deleteTitle: 'Delete this skill?',
  deleteNote:
    'The whole folder is deleted, reference files included. A timestamped backup is taken first.',
};

export default skills;
