// La garde d'appel, prise par les deux portes qu'elle ferme.
//
// Elles se ressemblent de loin et n'ont rien à voir. Le rebinding DNS traverse
// une écoute en boucle locale, parce que c'est le navigateur de la victime qui
// émet la requête : seul le `Host` garde trace du site d'origine. Le CSRF, lui,
// passe par une requête `POST` sans corps — « simple » au sens du navigateur,
// donc envoyée sans rien demander — et c'est `Sec-Fetch-Site` qui le nomme.

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerGuard } from '../server/guard.ts';

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify();
  registerGuard(app);
  app.get('/api/lecture', () => ({ ok: true }));
  app.post('/api/ecriture', () => ({ ok: true }));
  app.get('/rien', () => ({ ok: true }));
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('Host', () => {
  it('accepte les noms de cette machine', async () => {
    for (const host of ['127.0.0.1:8800', 'localhost:8800', '[::1]:8800', 'LOCALHOST:9100']) {
      const r = await app.inject({ method: 'GET', url: '/api/lecture', headers: { host } });
      expect(r.statusCode).toBe(200);
    }
  });

  it('refuse un domaine rebindé sur la boucle locale', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/lecture',
      headers: { host: 'evil.example:8800' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('ne garde que /api', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/rien',
      headers: { host: 'evil.example' },
    });
    expect(r.statusCode).toBe(200);
  });
});

describe('Sec-Fetch-Site', () => {
  const url = '/api/ecriture';
  const host = '127.0.0.1:8800';

  it('refuse une écriture demandée par un autre site', async () => {
    for (const site of ['cross-site', 'same-site']) {
      const r = await app.inject({
        method: 'POST',
        url,
        headers: { host, 'sec-fetch-site': site },
      });
      expect(r.statusCode).toBe(403);
    }
  });

  it('accepte l’interface elle-même, la barre d’adresse et les clients hors navigateur', async () => {
    for (const headers of [
      { host, 'sec-fetch-site': 'same-origin' },
      { host, 'sec-fetch-site': 'none' },
      { host },
    ]) {
      const r = await app.inject({ method: 'POST', url, headers });
      expect(r.statusCode).toBe(200);
    }
  });

  it('ne s’applique pas à une lecture', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/lecture',
      headers: { host, 'sec-fetch-site': 'cross-site' },
    });
    expect(r.statusCode).toBe(200);
  });
});
