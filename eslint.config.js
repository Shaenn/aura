import js from '@eslint/js'
import vitestConfig from '@lehoczky/eslint-config-vitest'
import pluginQuasar from '@quasar/app-vite/eslint'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginPrettier from 'eslint-plugin-prettier/recommended'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import importOrder from './eslint-rules/import-order.js'

export default [
  {
    // `pluginQuasar.configs.recommended()` ignore déjà node_modules, .quasar et dist.
    // Restent les dossiers que le dépôt ne versionne pas — le harnais Playwright, le
    // site vitrine et les notes de travail : les relire n'apprendrait rien, et leur
    // donner un tsconfig pour que les règles typées s'y exécutent en apprendrait moins
    // encore.
    name: 'aura/hors-perimetre',
    ignores: ['harness/**', 'site/**', 'llm règles/**', 'idea/**', '.local/**'],
  },

  ...pluginQuasar.configs.recommended(),

  // Les règles cœur d'ESLint. En configuration à plat, ESLint n'active RIEN de
  // lui-même : sans cette ligne, `no-debugger`, `no-duplicate-case`,
  // `no-constant-condition` et une quarantaine d'autres ne tournent tout
  // simplement pas.
  js.configs.recommended,

  // Tout ce qui touche aux règles TYPÉES passe à l'intérieur de
  // `defineConfigWithVueTs`, y compris nos propres surcharges.
  //
  // Ce n'est pas cosmétique. Le paquet énumère les .vue sans bloc <script> et y
  // éteint les règles typées, parce qu'un fichier sans script n'a pas de types à
  // consulter. Une surcharge posée APRÈS l'appel les rallume sur ces fichiers-là,
  // et ESLint ne démarre plus du tout :
  //   « Error while loading rule '@typescript-eslint/no-floating-promises':
  //     You have used a rule which requires type information… »
  // Passées à l'intérieur, elles sont extraites et réinsérées au bon rang.
  ...defineConfigWithVueTs([
    pluginVue.configs['flat/essential'],
    vueTsConfigs.recommendedTypeChecked,

    {
      name: 'aura/regles-typees',
      files: ['**/*.ts', '**/*.vue'],
      rules: {
        '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      },
    },
  ]),

  {
    name: 'socle/langage',
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        // Sans cette ancre, le service TypeScript se résout depuis le répertoire
        // courant. En ligne de commande c'est la racine du projet et tout va bien ;
        // dans un worker — vite-plugin-checker, l'IDE — ce n'en est pas un, aucun
        // tsconfig n'est trouvé, et les règles typées se mettent à voir chaque type
        // importé comme un type d'erreur. Des diagnostics que la même commande en
        // CLI ne reproduit pas, donc que personne ne sait reproduire.
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node, // SSR, Electron, fichiers de configuration
      },
    },
    rules: {
      'prefer-promise-reject-errors': 'off',

      // Le débogueur reste permis pendant le développement.
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    },
  },

  {
    // Le BFF est du Node, pas du navigateur. Ses types viennent de
    // `server/tsconfig.json`, que le `projectService` d'ESLint trouve seul.
    name: 'aura/bff',
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  ...vitestConfig(),

  {
    // Vitest accepte `expect(valeur, libellé)` : le second argument nomme le cas qui
    // échoue, ce dont vivent les boucles sur le corpus réel. Le greffon garde le défaut
    // de Jest — `maxArgs: 1` — et refuse donc une API qui existe. On l'accorde à
    // l'outil plutôt que de retirer les libellés. À porter au socle.
    name: 'aura/vitest-deux-arguments',
    rules: {
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },

  {
    name: 'rules/projet',
    plugins: {
      local: { rules: { 'import-order': importOrder } },
    },
    rules: {
      'local/import-order': 'warn',
    },
  },

  {
    name: 'personalisation/projet',
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],

      // Oblige à mettre des === et des !== au lieu des == et != (Type checking)
      eqeqeq: 'error',
      // La même chose dans le template.
      'vue/eqeqeq': 'error',

      // Permet de s'assurer qu'il ne reste pas de console.log dans le code.
      'no-console': 'warn',

      'vue/define-emits-declaration': ['error', 'type-based'],

      'vue/attributes-order': 'error',

      // Oblige à mettre des accolades sur tous les blocs de contrôle (if, else, for, while…).
      // `eslint-config-prettier` éteint `curly`, et on la rallume ici : le conflit avec Prettier
      // ne concerne que les options `multi-line` et `multi-or-nest`. `all` est le cas sûr —
      // ne pas « aligner » cette valeur sur une autre sans revérifier ce point.
      curly: ['error', 'all'],

      // Oblige à déclarer les fonctions nommées avec function plutôt qu'avec const + arrow.
      'func-style': ['error', 'declaration'],
    },
  },

  // En dernier : `eslint-plugin-prettier/recommended` éteint les règles de mise en
  // forme qui entreraient en conflit, puis rallume Prettier comme une règle ESLint.
  // La mise en forme se vérifie donc au même endroit que le reste, et se corrige par
  // le même `--fix`.
  pluginPrettier,
]
