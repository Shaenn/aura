// L'API de l'Atelier (`/api/agent/*`) : créer une session, la suivre, lui parler.
//
// Un flux descendant (SSE) et des ordres montants (POST). Pas de WebSocket : il
// n'y a rien à négocier ici que le navigateur ne fasse déjà avec `EventSource`,
// et le reste du BFF pousse déjà ses changements de cette façon
// (`routes/events.ts`, dont ce fichier reprend les en-têtes et le battement).

import type { FastifyInstance, FastifyReply } from 'fastify';
import { t } from '../i18n/index.ts';
import type {
  AgentUpsert,
  CreateSessionBody,
  PermissionAnswer,
  PromptAttachment,
  RespondAskBody,
  RespondPermissionBody,
  SendBody,
  SetPermissionModeBody,
} from '../../shared/agent.ts';
import { isPermissionMode } from '../../shared/agent.ts';
import {
  atCapacity,
  createRunner,
  getRunner,
  listSessions,
  MAX_SESSIONS,
  removeRunner,
} from '../agent/registry.ts';
import { pickFolder, PickerUnavailable } from '../agent/folder.ts';
import { listProjectFiles } from '../agent/files.ts';
import { readTail } from '../agent/shells.ts';
import { str } from '../json.ts';
import { publicMessage } from '../errors.ts';

/** Même valeur que `routes/events.ts` : un commentaire tient la socket éveillée. */
const HEARTBEAT_MS = 25_000;

/**
 * Ce qu'une image jointe a le droit de peser, une fois décodée.
 *
 * Cinq mégaoctets est la limite de l'API elle-même : au-delà, le tour partirait
 * pour être refusé plus loin, et l'utilisateur verrait l'échec après l'attente
 * plutôt qu'au moment du collage. Le `bodyLimit` de Fastify (8 Mo) borne de son
 * côté le lot entier.
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Ce que le presse-papier peut donner et que le modèle sait lire. */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Les pièces jointes d'un tour, ou l'erreur qui dit pourquoi elles sont refusées.
 *
 * Refuser ici plutôt que plus loin : une image trop lourde ou d'un type que le
 * modèle ne lit pas ferait échouer le tour entier après l'avoir attendu.
 */
function readAttachments(input: unknown): PromptAttachment[] | string {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return t('errors.attachmentsShape');

  const out: PromptAttachment[] = [];
  for (const raw of input) {
    const item = (raw ?? {}) as Partial<PromptAttachment>;
    const mediaType = str(item.mediaType);
    const data = str(item.data);
    if (!data) continue;
    if (!IMAGE_TYPES.has(mediaType)) return t('errors.attachmentType', { type: mediaType || '?' });
    if (Buffer.byteLength(data, 'base64') > MAX_IMAGE_BYTES) return t('errors.attachmentTooBig');
    out.push({ mediaType, data });
  }
  return out;
}

function notFound(reply: FastifyReply): unknown {
  return reply.code(404).send({ error: t('errors.unknownSession') });
}

export function registerAgent(app: FastifyInstance): void {
  app.get('/api/agent/sessions', () => ({ sessions: listSessions() }));

  /**
   * Ouvre le sélecteur de dossier du système et rend le chemin choisi.
   *
   * `{ path: null }` veut dire « annulé », et c'est un succès : le front referme
   * sans rien dire. Un `501` veut dire que la plateforme n'a pas de sélecteur —
   * le champ de saisie reste alors la seule voie, et le front le montre.
   */
  app.post('/api/agent/pick-folder', async (req, reply) => {
    const from = str((req.body as { startFrom?: string } | undefined)?.startFrom);
    try {
      return { path: await pickFolder(from || undefined) };
    } catch (e) {
      if (e instanceof PickerUnavailable) return reply.code(501).send({ error: e.message });
      return reply.code(500).send({ error: publicMessage(e) });
    }
  });

  app.post('/api/agent/sessions', (req, reply) => {
    const body = (req.body ?? {}) as CreateSessionBody;
    const cwd = str(body.cwd);
    if (!cwd) return reply.code(400).send({ error: t('errors.workdirRequired') });

    // Avant tout le reste : ce refus-là ne dépend d'aucune donnée du corps, et
    // il vaut mieux le dire sans avoir décodé cinq mégaoctets d'image d'abord.
    // `429` et non `409` : ce n'est pas un conflit d'état, c'est un plafond —
    // la même demande passera dès qu'une session sera fermée.
    if (atCapacity()) {
      return reply.code(429).send({ error: t('errors.tooManySessions', { max: MAX_SESSIONS }) });
    }

    // Avant `createRunner`, et non après : une image refusée doit se dire pendant
    // qu'on ouvre la session, pas laisser derrière elle un runner amputé de son
    // premier tour et une image disparue sans un mot.
    const attachments = readAttachments(body.attachments);
    if (typeof attachments === 'string') return reply.code(400).send({ error: attachments });

    // Le mode se vérifie ici, pas seulement dans l'écran qui le propose : la
    // route est ouverte, et `bypassPermissions` ouvrirait une session qui
    // exécute sans jamais rien demander. Voir `PERMISSION_MODES`.
    const mode = str(body.permissionMode);
    if (mode && !isPermissionMode(mode)) {
      return reply.code(400).send({ error: t('errors.permissionModeUnknown', { mode }) });
    }

    const runner = createRunner({
      cwd,
      model: str(body.model) || undefined,
      permissionMode: mode || undefined,
      resume: str(body.resume) || undefined,
    });
    // Le premier tour part sans attendre `init` : en entrée streamée, `init`
    // n'est émis qu'après lecture du premier message, et l'attendre bloquerait
    // les deux côtés.
    const prompt = str(body.prompt);
    if (prompt) runner.send(prompt, attachments);
    return reply.code(201).send({ session: runner.session });
  });

  app.get('/api/agent/sessions/:runId/stream', (req, reply) => {
    const { runId } = req.params as { runId: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    // On garde la socket : ni sérialisation ni fermeture par Fastify.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const send = (upsert: AgentUpsert): void => {
      reply.raw.write(`event: ${upsert.kind}\ndata: ${JSON.stringify(upsert)}\n\n`);
    };

    const unsubscribe = runner.subscribe(send);
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), HEARTBEAT_MS);

    // Se désabonner n'arrête pas la session : c'est tout l'intérêt du registre.
    const close = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.raw.on('close', close);
    req.raw.on('error', close);
    return reply;
  });

  /**
   * Les commandes `/` de la session.
   *
   * Appelée à la demande — au premier `/` tapé — et non à l'ouverture de
   * l'écran : c'est elle qui démarre le processus du CLI si rien ne l'a encore
   * fait, et une session qu'on abandonne sans un mot ne doit rien coûter.
   */
  app.get('/api/agent/sessions/:runId/commands', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    return { commands: await runner.commands() };
  });

  /**
   * Les fichiers du projet, pour l'autocomplétion du `@`.
   *
   * Aucun paramètre de chemin, et c'est le point : la racine est le `cwd` de la
   * session, fixé à son ouverture. Cette route ne peut donc pas être détournée
   * pour lister ailleurs — il n'y a rien à lui demander d'autre.
   *
   * La liste part entière et se filtre dans le navigateur : une frappe ne coûte
   * alors aucune requête, et l'écran répond à la vitesse du clavier.
   */
  app.get('/api/agent/sessions/:runId/files', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    return listProjectFiles(runner.session.cwd);
  });

  /**
   * La sortie d'un shell lancé en arrière-plan.
   *
   * Même principe que la route des fichiers : **le client ne fournit aucun
   * chemin**. Il donne un `runId` et un identifiant de shell ; le chemin sort du
   * suiveur de la session, qui l'a lu dans le flux du CLI, et `isOutputPath` le
   * vérifie avant qu'il ne serve.
   *
   * `from` est un curseur en octets — le panneau redemande la suite plutôt que
   * tout le fichier. Un serveur de dev qui tourne depuis une heure en écrit des
   * mégaoctets, dont personne ne relira le début.
   */
  app.get('/api/agent/sessions/:runId/shells/:shellId/output', async (req, reply) => {
    const { runId, shellId } = req.params as { runId: string; shellId: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    const path = runner.shellOutputPath(shellId);
    if (!path) return reply.code(404).send({ error: t('errors.unknownShell') });

    try {
      return await readTail(path, Number((req.query as { from?: string }).from) || 0);
    } catch {
      return reply.code(404).send({ error: t('errors.unknownShell') });
    }
  });

  app.post('/api/agent/sessions/:runId/send', (req, reply) => {
    const { runId } = req.params as { runId: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    const body = (req.body ?? {}) as SendBody;
    const prompt = str(body.prompt);
    if (!prompt) return reply.code(400).send({ error: t('errors.emptyMessage') });

    const attachments = readAttachments(body.attachments);
    if (typeof attachments === 'string') return reply.code(400).send({ error: attachments });

    runner.send(prompt, attachments);
    return { ok: true };
  });

  /**
   * Les octets d'une image collée.
   *
   * Elle n'est pas encore dans un transcript — le CLI ne l'y écrira qu'en
   * traitant le tour — et le fil ne transporte jamais de base64. Elle vient donc
   * d'ici, tant que la session vit. `immutable` : l'identifiant est unique par
   * image, son contenu ne changera pas.
   */
  app.get('/api/agent/sessions/:runId/attachment', (req, reply) => {
    const { runId } = req.params as { runId: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    const found = runner.attachment(str((req.query as { id?: string }).id));
    if (!found) return reply.code(404).send({ error: t('errors.unknownAttachment') });

    reply.header('Content-Type', found.mediaType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(found.bytes);
  });

  /**
   * La réponse à une demande de permission.
   *
   * `410` et non `404` quand la demande n'est plus en vol : elle a existé, mais
   * un autre onglet, l'échéance ou une interruption l'a déjà tranchée. Le front
   * doit retirer le bandeau, pas signaler une erreur.
   */
  app.post('/api/agent/sessions/:runId/permissions/:id', (req, reply) => {
    const { runId, id } = req.params as { runId: string; id: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    const body = (req.body ?? {}) as RespondPermissionBody;
    const answer = str(body.answer) as PermissionAnswer;
    if (answer !== 'allow' && answer !== 'allow-always' && answer !== 'deny') {
      return reply.code(400).send({ error: t('errors.decisionExpected') });
    }

    if (!runner.answerPermission(id, answer, str(body.reason) || undefined)) {
      return reply.code(410).send({ error: t('errors.alreadyDecided') });
    }
    return { ok: true };
  });

  /** La réponse à une question de l'agent — un formulaire, pas une autorisation. */
  app.post('/api/agent/sessions/:runId/ask/:id', (req, reply) => {
    const { runId, id } = req.params as { runId: string; id: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    const body = (req.body ?? {}) as RespondAskBody;
    const answers = body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return reply.code(400).send({ error: t('errors.answersExpected') });
    }

    if (!runner.answerAsk(id, answers, str(body.notes) || undefined)) {
      return reply.code(410).send({ error: t('errors.questionAlreadyDecided') });
    }
    return { ok: true };
  });

  app.post('/api/agent/sessions/:runId/permission-mode', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    const mode = str((req.body as SetPermissionModeBody | undefined)?.permissionMode);
    if (!mode) return reply.code(400).send({ error: t('errors.permissionModeRequired') });
    if (!isPermissionMode(mode)) {
      return reply.code(400).send({ error: t('errors.permissionModeUnknown', { mode }) });
    }

    await runner.setPermissionMode(mode);
    return { ok: true };
  });

  app.post('/api/agent/sessions/:runId/interrupt', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const runner = getRunner(runId);
    if (!runner) return notFound(reply);

    await runner.interrupt();
    return { ok: true };
  });

  app.delete('/api/agent/sessions/:runId', (req, reply) => {
    const { runId } = req.params as { runId: string };
    if (!removeRunner(runId)) return notFound(reply);
    return { ok: true };
  });
}
