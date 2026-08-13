import { defineBoot } from '#q-app/wrappers';
import { i18n } from 'src/i18n';

// Installe vue-i18n sur l'application. La langue effective n'est pas choisie
// ici : c'est une préférence, chargée depuis le BFF par le boot `settings`, qui
// s'exécute juste après. Ce boot doit donc précéder `settings` dans
// `quasar.config.ts` — l'instance doit exister avant qu'on lui pose une langue.
export default defineBoot(({ app }) => {
  app.use(i18n);
});
