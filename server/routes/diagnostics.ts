// Diagnostic de coût (`/api/diagnostics`). Lecture seule, comme `/api/usage` :
// cette surface n'écrit jamais, elle relit les transcripts de `~/.claude/projects`.

import type { FastifyInstance } from 'fastify';
import { t } from '../i18n/index.ts';
import {
  diagnose,
  diagnoseSession,
  getPace,
  RULE_NAMES,
  type RuleName,
} from '../diagnostics/index.ts';
import { str } from '../json.ts';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Un vrai jour du calendrier, pas seulement la forme `\d{4}-\d{2}-\d{2}`. Les
 * bornes sont comparées lexicographiquement : `2026-13-99` passerait un contrôle
 * de forme puis vaudrait toutes les dates, et l'appelant croirait avoir filtré.
 * Même règle que sur `/api/usage`.
 */
function isDay(v: string): boolean {
  if (!DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().startsWith(v);
}

/** Une liste passée en `?a=x&a=y` ou en `?a=x,y`, réduite aux valeurs connues. */
function list(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((v) => str(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function registerDiagnostics(app: FastifyInstance): void {
  /** Rapport complet. `from`/`to` sont des bornes `AAAA-MM-JJ` inclusives. */
  app.get('/api/diagnostics', async (req, reply) => {
    const q = req.query as Record<string, unknown>;
    const from = str(q.from);
    const to = str(q.to);

    if ((from && !isDay(from)) || (to && !isDay(to))) {
      return reply.code(400).send({ error: t('errors.dateFormat') });
    }
    if (from && to && from > to) {
      return reply.code(400).send({ error: t('errors.dateOrder') });
    }

    // Une règle inconnue est refusée plutôt qu'ignorée : un client qui croit avoir
    // désactivé une règle et la voit revenir n'a aucun moyen de comprendre.
    const disabled = list(q.disabled);
    const unknown = disabled.filter((r) => !(RULE_NAMES as readonly string[]).includes(r));
    if (unknown.length) {
      return reply.code(400).send({ error: `Règle inconnue : ${unknown.join(', ')}.` });
    }

    return await diagnose({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(disabled.length ? { disabled: disabled as RuleName[] } : {}),
      ...(list(q.ignore).length ? { ignore: list(q.ignore) } : {}),
    });
  });

  /**
   * Le rythme : la fenêtre de 5 h en cours, et les sessions menées de front.
   *
   * Sans paramètre, et sur tout le parc : une fenêtre glissante ne connaît pas
   * les bornes de période qu'on lui donnerait — elle compte les cinq dernières
   * heures, un point c'est tout. Le stream l'interroge en boucle, d'où le cache
   * court côté `pace.ts`.
   */
  app.get('/api/diagnostics/pace', async () => await getPace());

  /**
   * Le diagnostic d'une session : son coût décomposé, sa place dans le parc, et
   * les constats qui la visent. Le lecteur de transcripts s'en sert.
   *
   * Le slug et l'identifiant sont pris en query plutôt qu'en segments : un slug
   * de projet contient des `-` et des `.` mais aussi, sur d'autres postes, des
   * caractères qu'un segment d'URL rendrait ambigus. Ils ne servent ici qu'à
   * retrouver un relevé déjà calculé — aucun chemin n'en est construit.
   */
  app.get('/api/diagnostics/session', async (req, reply) => {
    const q = req.query as Record<string, unknown>;
    const project = str(q.project);
    const id = str(q.id);
    if (!project || !id) {
      return reply.code(400).send({ error: t('errors.projectAndIdRequired') });
    }
    return await diagnoseSession(project, id);
  });
}
