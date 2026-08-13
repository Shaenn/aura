// Qui a le droit d'appeler l'API.
//
// AURA n'écoute que la boucle locale : personne, hors de cette machine, ne peut
// ouvrir une socket vers elle. Cela règle le voisin de réseau, pas le navigateur
// — qui, lui, est sur la machine, et exécute le code de tous les sites visités.
// Deux portes restaient donc ouvertes.
//
//  1. **Le rebinding DNS.** Le `Host` de la requête n'était pas regardé. Un site
//     visité fait pointer son propre domaine vers `127.0.0.1` après le premier
//     chargement ; le navigateur considère alors ses requêtes comme de même
//     origine, et sa politique de sécurité tombe d'elle-même. L'adresse d'où
//     vient la requête est bien la boucle locale — c'est votre navigateur. Seul
//     le `Host` porte encore le nom du site, et c'est lui qui le démasque.
//
//  2. **Le CSRF.** Une requête `POST` sans corps est une requête « simple » : le
//     navigateur ne demande aucune permission avant de l'envoyer.
//     `/api/backups/purge` et `/api/system/shutdown` s'atteignaient ainsi depuis
//     n'importe quel onglet ouvert. `Sec-Fetch-Site` dit ce que le navigateur,
//     lui, sait de l'origine, et une page ne peut pas le falsifier.
//
// Ce qui n'est pas gardé ici : tout ce qui ne vise pas `/api/*`. Servir
// l'interface est sans conséquence — elle ne porte aucune donnée, et n'obtient
// rien sans franchir ce qui précède.

import type { FastifyInstance } from 'fastify';
import { t } from './i18n/index.ts';

/** Les noms sous lesquels cette machine accepte d'être appelée. */
const LOCAL_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Le nom d'hôte d'un en-tête `Host`, sans le port. */
function hostname(header: string | undefined): string {
  if (!header) return '';
  // `[::1]:8800` — les crochets tiennent l'adresse IPv6 d'un seul tenant.
  if (header.startsWith('[')) return header.slice(0, header.indexOf(']') + 1).toLowerCase();
  const i = header.lastIndexOf(':');
  return (i === -1 ? header : header.slice(0, i)).toLowerCase();
}

/** Branche la garde sur toutes les requêtes `/api/*`. */
export function registerGuard(app: FastifyInstance): void {
  app.addHook('onRequest', (req, reply, done) => {
    if (!req.url.startsWith('/api/')) return done();

    if (!LOCAL_NAMES.has(hostname(req.headers.host))) {
      void reply.code(403).send({ error: t('guard.badHost') });
      return;
    }

    // `none` est le cas d'une requête qui ne vient d'aucune page : la barre
    // d'adresse, ou un outil en ligne de commande. Un en-tête absent est celui
    // des clients qui ne sont pas des navigateurs — ils ne portent pas de
    // cookie d'une autre origine, et n'ont donc rien à usurper.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const site = req.headers['sec-fetch-site'];
      if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') {
        void reply.code(403).send({ error: t('guard.crossSite') });
        return;
      }
    }

    done();
  });
}
