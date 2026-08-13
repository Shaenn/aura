// Single source of truth for the on-disk locations the BFF *owns* (AURA's own
// data — not the managed .claude dir, which is resolved in claude/paths.ts).
//
// Why centralise: esbuild collapses every server module into one bundle, so
// `import.meta.url` is identical everywhere at runtime. Resolve the app root
// once, in a way that works both from source (tsx) and as a delivered bundle.

import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const self = fileURLToPath(import.meta.url);

/** The delivered bundle is named `aura.server.mjs`; from source it's `paths.ts`. */
const isBundle = basename(self) === 'aura.server.mjs';

/** True when running as the delivered single-file bundle (vs from source in dev). */
export const IS_BUNDLE = isBundle;

/** Folder that anchors all app data: the bundle's own dir, or the repo root. */
export const APP_DIR = isBundle ? dirname(self) : join(dirname(self), '..');

/** AURA's own mutable data (UI preferences, and the safety backups of edits). */
export const LOCAL_DIR = join(APP_DIR, '.local');

/** Timestamped backups taken before every write into .claude. */
export const BACKUPS_DIR = join(LOCAL_DIR, 'backups');
