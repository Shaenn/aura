import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';
import { documentTitle, titleForRouteName } from './titles';
import { clearBreadcrumbs } from 'src/composables/useBreadcrumbs';

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter(() => {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    // Changer d'écran remonte en haut ; réécrire sa propre query, non.
    //
    // Plusieurs pages inscrivent leur état dans l'adresse sans changer de
    // chemin : le Manuel y met la section lue (`?s=`), Sessions la session et la
    // piste choisies (`?sel=`, `?agent=`), l'Atelier la session ouverte. Un
    // `replace` de ce genre passe ici comme une navigation ordinaire, et le
    // retour en haut annulait alors le défilement que le clic venait de
    // demander — visiblement dans le Manuel, dont la page fait trente écrans.
    scrollBehavior: (to, from) => (to.path === from.path ? false : { left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  // Le fil d'Ariane repart de zéro à chaque navigation. Ce nettoyage vivait
  // dans MainLayout, qui ne le voyait donc pas quand il était lui-même démonté :
  // passer par la 404 gardait l'ancien fil, et l'écran suivant s'ouvrait sous le
  // nom du projet précédent. Le routeur, lui, est là à toutes les navigations.
  Router.beforeEach(() => {
    clearBreadcrumbs();
  });

  // Le titre de l'onglet suit la navigation. Ce n'est que le repli : dès que le
  // layout est monté, il réaccorde le titre sur le fil d'Ariane, qui sait le nom
  // du projet ou de la session. Ici on couvre l'arrivée directe et les écrans
  // hors layout (404), et on évite le clignotement d'un titre périmé.
  Router.afterEach((to) => {
    if (typeof document === 'undefined') return;
    document.title =
      to.matched.length > 1 ? titleForRouteName(to.name) : documentTitle(['Page introuvable']);
  });

  return Router;
});
