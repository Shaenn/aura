// Map a file path to a highlight.js language name, and split paths for display.
//
// Only languages that `highlight.js/lib/common` actually registers are named
// here (plus `powershell`, which `utils/markdown.ts` registers on top of it).
// An unknown name makes `highlightCode` fall back to `highlightAuto`, which
// guesses — and guesses badly on short snippets. An empty string is honest.

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  vue: 'xml', // Single-file components highlight best as markup.
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  json: 'json',
  jsonl: 'json',
  json5: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  pl: 'perl',
  r: 'r',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  psm1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  diff: 'diff',
  patch: 'diff',
};

/** Files whose whole name — not extension — decides the language. */
const BY_NAME: Record<string, string> = {
  dockerfile: 'bash',
  makefile: 'makefile',
  gemfile: 'ruby',
  rakefile: 'ruby',
};

/** Split on both separators: transcripts carry Windows and POSIX paths alike. */
function segments(path: string): string[] {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/);
}

/** Last path segment, e.g. `server/usage.ts` → `usage.ts`. */
export function basename(path: string): string {
  const parts = segments(path);
  return parts[parts.length - 1] ?? path;
}

/** Everything before the last segment, e.g. `server/usage.ts` → `server`. */
export function dirname(path: string): string {
  const parts = segments(path);
  return parts.slice(0, -1).join('/');
}

/** highlight.js language for a path, or `''` when we cannot tell. */
export function langOf(path: string): string {
  const name = basename(path).toLowerCase();
  const byName = BY_NAME[name];
  if (byName) return byName;
  if (name.startsWith('.env')) return 'bash';

  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return BY_EXTENSION[name.slice(dot + 1)] ?? '';
}

/**
 * What to print on the badge — the file's own language, not the grammar we
 * colour it with. A `.vue` file highlights as `xml`, but calling it XML in the
 * header is just confusing; likewise `.svelte`, `.html`, `.toml`.
 */
const LABEL_BY_EXTENSION: Record<string, string> = {
  vue: 'vue',
  svelte: 'svelte',
  html: 'html',
  htm: 'html',
  svg: 'svg',
  tsx: 'tsx',
  jsx: 'jsx',
  mts: 'typescript',
  cts: 'typescript',
  toml: 'toml',
  cfg: 'ini',
  sass: 'sass',
  zsh: 'zsh',
  psm1: 'powershell',
  jsonl: 'jsonl',
  json5: 'json5',
  mdx: 'mdx',
  pl: 'perl',
  patch: 'diff',
};

export function langLabel(path: string): string {
  const name = basename(path).toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1) : '';
  return LABEL_BY_EXTENSION[ext] ?? langOf(path);
}

/** True when the file renders better as prose than as code. */
export function isMarkdown(path: string): boolean {
  return langOf(path) === 'markdown';
}
