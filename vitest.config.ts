import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

// Le parseur et l'accumulateur de contexte sont du Node pur : ils lisent des
// fichiers et rendent des objets. Rien à monter, aucun DOM. Les composants Vue
// ne sont pas couverts ici — Playwright, lancé à la main, s'en charge.
//
// L'alias reprend celui de Quasar (voir `.quasar/tsconfig.json`), pour qu'un
// helper client testable — sans dépendance au DOM — s'importe tel quel. Seuls les
// imports de *valeur* se résolvent au runtime ; les `import type` sont effacés.
//
// Un seul depuis Quasar 3, qui a retiré `src`, `components`, `app` et les autres.
export default defineConfig({
  resolve: {
    alias: {
      '@': `${root}src`,
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
