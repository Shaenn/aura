// Configuration for your app
// https://quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app';

export default defineConfig((ctx) => {
  return {
    // https://quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://quasar.dev/quasar-cli-vite/boot-files
    boot: ['fonts', 'i18n', 'settings'],

    // https://quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v6',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
    ],

    // Full list of options: https://quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        browser: 'baseline-widely-available',
        node: 'node24',
      },

      // `shared/` vit à la racine, hors de `src/`. Le seul alias que Quasar 3
      // injecte est `@/`, qui pointe sur `src/` : sans celui-ci, les types du
      // fil s'importeraient par `@/../shared/…`, un chemin qui remonte hors de
      // son propre périmètre pour désigner ce que les deux côtés partagent.
      alias: {
        shared: ctx.appPaths.resolve.app('shared'),
      },

      typescript: {
        strict: true,
        vueShim: true,
        // extendTsConfig (tsConfig) {}
      },

      // 'history' et non 'hash' : le BFF sert le build et renvoie `index.html`
      // sur toute route inconnue hors `/api/` (`server/index.ts`), et le serveur
      // de dev Vite fait le même repli. Rien n'a donc besoin du `#`, qui ne
      // faisait qu'alourdir les adresses partagées.
      vueRouterMode: 'history', // available values: 'hash', 'history'
      // vueRouterBase,
      // vueDevtools,

      // publicPath: '/',
      // env: {},
      // define: {}, // valeurs à passer par JSON.stringify()
      // defineEnv: {},
      // ignorePublicFolder: true,
      // minify: false,
      // distDir

      // extendViteConf (viteConf) {},
      // viteVuePluginOptions: {},

      vitePlugins: [
        [
          'vite-plugin-checker',
          {
            vueTsc: true,
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{ts,js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],
      ],
    },

    // Full list of options: https://quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // https: true,
      open: true, // opens browser window automatically
      // L'adresse annoncée, donc celle qu'ouvre `open` et que le terminal
      // affiche. `127.0.0.1` et non `localhost` pour la raison décrite sous
      // `proxy` : ce nom coûte ~300 ms par requête au navigateur.
      host: '127.0.0.1',
      // 9100/8800 rather than the usual 9000/8788: a sibling app on this
      // machine is packaged around those and must keep them.
      port: 9100,
      // Fail loudly instead of sliding to the next free port: a silent shift
      // would leave the browser and dev.ps1 pointing at a different app.
      strictPort: true,
      // Same-origin /api → the Fastify BFF (server/), which holds the secrets
      // and proxies to the external services. Kills CORS in dev.
      //
      // `127.0.0.1` et non `localhost` : ce nom se résout d'abord en `::1`, que
      // rien n'écoute ici, et l'attente avant le repli IPv4 coûte ~300 ms par
      // requête — mesuré, et quinze fois le temps de réponse du BFF lui-même.
      proxy: {
        '/api': { target: 'http://127.0.0.1:8800', changeOrigin: true },
      },
    },

    // https://quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {},

      // iconSet: 'material-icons', // Quasar icon set

      // Le texte que Quasar produit lui-même — pagination des q-table (« Records
      // per page », « 1 - 15 of 46 »), libellés de q-date, messages par défaut
      // des champs — ne passe par aucun de nos composants : il n'est traduisible
      // que par son pack de langue.
      //
      // C'est la langue de *départ*, celle du bundle initial, pas la langue
      // effective : `src/i18n/applyLocale()` recharge le pack quand la
      // préférence en demande un autre. Le français plutôt que l'anglais, parce
      // que c'est la langue de référence d'AURA et le défaut de la préférence —
      // partir de l'autre ferait clignoter l'interface au chargement.
      lang: 'fr',

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: ['Notify', 'Dialog', 'Loading', 'Dark'],
    },

    // animations: 'all', // --- includes all animations
    // https://quasar.dev/options/animations
    animations: [],

    // AURA ne connaît qu'un mode : la SPA, servie par son propre BFF. Les blocs
    // d'échafaudage des modes SSR, PWA, Electron, Cordova, Capacitor et BEX ont
    // été retirés — Quasar 3 en a renommé la moitié des options, si bien qu'ils
    // ne documentaient plus rien d'exact. `quasar mode add` les régénère à jour
    // le jour où l'un d'eux servirait.
    //
    // `sourceFiles` part pour la même raison : il ne faisait que réécrire les
    // défauts, dont les chemins des modes absents.
  };
});
