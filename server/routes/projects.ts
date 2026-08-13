// First-class Projects endpoints (`/api/projects/*`): list, detail (source
// .claude inventory + CLAUDE.md memories + transcripts), read one resource, read
// one memory, parse one transcript.
// All read-only — this surface never writes.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { t } from '../i18n/index.ts';
import {
  listProjects,
  getProjectDetail,
  getProjectResources,
  listFolderCandidates,
  listProjectPlans,
  listProjectSessions,
  readProjectResource,
  readProjectIncludedFile,
  readProjectMemory,
  readProjectTranscript,
  readProjectToolResult,
  readProjectTranscriptImage,
  ProjectError,
} from '../projects';
import { str } from '../json.ts';
import { publicMessage } from '../errors.ts';

function fail(reply: FastifyReply, e: unknown): unknown {
  if (e instanceof ProjectError) {
    const status = e.code === 'not-found' || e.code === 'no-source' ? 404 : 403;
    return reply.code(status).send({ error: e.message, code: e.code });
  }
  const err = e as NodeJS.ErrnoException;
  if (err?.code === 'ENOENT') return reply.code(404).send({ error: t('errors.notFound') });
  return reply.code(500).send({ error: publicMessage(err) });
}

/**
 * Le client détient-il déjà cette version ?
 *
 * `If-None-Match` peut porter plusieurs empreintes séparées par des virgules, et
 * `*` vaut « n'importe laquelle ». Un intermédiaire peut aussi retirer le préfixe
 * `W/` d'une empreinte faible : on compare donc aussi les valeurs nues.
 */
function matchesEtag(header: string | string[] | undefined, etag: string): boolean {
  if (typeof header !== 'string' || !header) return false;
  const bare = (v: string): string => v.trim().replace(/^W\//, '');
  if (header.trim() === '*') return true;
  return header.split(',').some((candidate) => bare(candidate) === bare(etag));
}

export function registerProjects(app: FastifyInstance): void {
  app.get('/api/projects', async () => ({ projects: await listProjects() }));

  app.get('/api/projects/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    try {
      return await getProjectDetail(slug);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // L'inventaire seul. Distinct du détail parce qu'il ne touche ni aux hooks ni
  // aux transcripts : c'est ce qui le rend appelable depuis un écran en direct.
  app.get('/api/projects/:slug/resources', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    try {
      return await getProjectResources(slug);
    } catch (e) {
      return fail(reply, e);
    }
  });

  /**
   * Les sessions d'un projet, et rien d'autre.
   *
   * `getProjectDetail` les rend déjà, mais accompagnées de l'inventaire des
   * ressources, des CLAUDE.md et des hooks. L'Atelier n'a besoin que de la
   * liste, et la demande à chaque fois qu'on change de projet dans l'écran
   * d'ouverture : lui faire payer le reste serait lire un arbre entier pour
   * afficher six lignes.
   */
  app.get('/api/projects/:slug/sessions', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    try {
      return { sessions: await listProjectSessions(slug) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get('/api/projects/:slug/plans', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    try {
      return { plans: await listProjectPlans(slug) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get('/api/projects/:slug/resource', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const path = str((req.query as Record<string, unknown>).path);
    if (!path) return reply.code(400).send({ error: t('errors.paramRequired', { name: 'path' }) });
    try {
      return await readProjectResource(slug, path);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Separate from /resource: a memory lives in the source tree, not in .claude,
  // and its sandbox admits only files named CLAUDE.md.
  app.get('/api/projects/:slug/memory', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const path = str((req.query as Record<string, unknown>).path);
    if (!path) return reply.code(400).send({ error: t('errors.paramRequired', { name: 'path' }) });
    try {
      return await readProjectMemory(slug, path);
    } catch (e) {
      return fail(reply, e);
    }
  });

  /**
   * Un document d'un dossier inclus.
   *
   * Le bac à sable est la liste d'inclusion elle-même, relue sur le disque à
   * chaque appel : sans inclusion, cette route n'ouvre rien.
   */
  app.get('/api/projects/:slug/included', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const path = str((req.query as Record<string, unknown>).path);
    if (!path) return reply.code(400).send({ error: t('errors.paramRequired', { name: 'path' }) });
    try {
      return await readProjectIncludedFile(slug, path);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Ce qu'AURA propose d'inclure. Une mesure — le nombre de documents d'un
  // sous-arbre —, jamais une décision : elle ne sait pas distinguer un document
  // à lire d'un gabarit que le programme consomme.
  app.get('/api/projects/:slug/folder-candidates', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    try {
      return { candidates: await listFolderCandidates(slug) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  /**
   * Un transcript sérialisé pèse jusqu'à plusieurs mégaoctets, et ne change que
   * lorsqu'une ligne s'y ajoute. On l'accompagne donc de son empreinte : le
   * navigateur la renvoie en `If-None-Match`, et un fichier inchangé coûte alors
   * un `304` vide au lieu du transfert entier.
   *
   * `no-cache` ne veut pas dire « ne garde rien » mais « garde, et revalide avant
   * de servir » : c'est exactement ce qu'il faut d'un fichier qui grandit.
   */
  app.get('/api/projects/:slug/transcript', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const id = str((req.query as Record<string, unknown>).id);
    if (!id) return reply.code(400).send({ error: t('errors.paramRequired', { name: 'id' }) });
    try {
      const { body, etag } = await readProjectTranscript(slug, id);
      reply.header('ETag', etag);
      reply.header('Cache-Control', 'no-cache');
      if (matchesEtag(req.headers['if-none-match'], etag)) return reply.code(304).send();
      // Le transcript arrive déjà sérialisé du thread qui l'a lu. Le type doit
      // être posé à la main : sans lui, Fastify voit des octets, répond
      // `application/octet-stream`, et le `res.json()` du front échoue — et s'il
      // voyait un objet, il le re-sérialiserait sur la boucle d'événements,
      // c'est-à-dire exactement le travail qu'on vient d'en sortir.
      reply.header('Content-Type', 'application/json; charset=utf-8');
      return reply.send(body);
    } catch (e) {
      return fail(reply, e);
    }
  });

  /**
   * Une image du transcript, servie à part de lui.
   *
   * Le transcript ne transporte que son adresse ; les octets viennent ici. Le
   * contenu d'une ligne déjà écrite ne changera plus : `immutable` dit au
   * navigateur de ne jamais revalider, et la timeline peut rendre la même
   * capture dix fois sans dix requêtes.
   */
  app.get('/api/projects/:slug/transcript/image', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const query = req.query as Record<string, unknown>;
    const id = str(query.id);
    const uuid = str(query.uuid);
    if (!id || !uuid) {
      return reply
        .code(400)
        .send({ error: t('errors.paramsRequired', { first: 'id', second: 'uuid' }) });
    }
    try {
      const { body, mediaType } = await readProjectTranscriptImage(
        slug,
        id,
        uuid,
        Number(str(query.index, '0')),
        str(query.agentId),
      );
      reply.header('Content-Type', mediaType);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(body);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Outputs too large for the transcript live beside it, one file per tool call.
  app.get('/api/projects/:slug/tool-result', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const query = req.query as Record<string, unknown>;
    const id = str(query.id);
    const toolUseId = str(query.toolUseId);
    if (!id || !toolUseId) {
      return reply
        .code(400)
        .send({ error: t('errors.paramsRequired', { first: 'id', second: 'toolUseId' }) });
    }
    try {
      return await readProjectToolResult(slug, id, toolUseId);
    } catch (e) {
      return fail(reply, e);
    }
  });
}
