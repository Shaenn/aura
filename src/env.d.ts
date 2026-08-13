/// <reference types="vite/client" />
// Brings in `import.meta.glob`, used by the help registry to bundle
// `src/help/sections/*.md` at build time.
//
// Plus de `NodeJS.ProcessEnv` ici : Quasar 3 a retiré `process.env` du code
// client au profit d'`import.meta.env`, dont il génère lui-même les types dans
// `.quasar/`. Déclarer une variable ici la ferait exister pour TypeScript sans
// qu'aucune valeur ne la remplace au build.
