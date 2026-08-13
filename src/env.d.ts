/// <reference types="vite/client" />
// Brings in `import.meta.glob`, used by the help registry to bundle
// `src/help/sections/*.md` at build time.

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: string;
    VUE_ROUTER_MODE: 'hash' | 'history' | 'abstract' | undefined;
    VUE_ROUTER_BASE: string | undefined;
  }
}
