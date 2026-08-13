// Token usage and estimated cost (`/api/usage`). Read-only: this surface never
// writes, it only aggregates the transcripts under `~/.claude/projects`.

import type { FastifyInstance } from 'fastify';
import { t } from '../i18n/index.ts';
import { getUsage } from '../usage.ts';
import { str } from '../json.ts';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar day, not just a `\d{4}-\d{2}-\d{2}` shape. Bounds are compared
 * lexicographically, so `2026-13-99` would pass a shape check and then silently
 * match every day — the caller would believe they had filtered.
 */
function isDay(v: string): boolean {
  if (!DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  // An out-of-range date parses to Invalid Date; `toISOString()` would throw.
  if (Number.isNaN(d.getTime())) return false;
  // Rejects overflow that JS would silently roll over (e.g. 2026-02-31 → Mar 3).
  return d.toISOString().startsWith(v);
}

export function registerUsage(app: FastifyInstance): void {
  /** Aggregated usage. `from`/`to` are inclusive `YYYY-MM-DD` bounds. */
  app.get('/api/usage', async (req, reply) => {
    const q = req.query as Record<string, unknown>;
    const from = str(q.from);
    const to = str(q.to);

    if ((from && !isDay(from)) || (to && !isDay(to))) {
      return reply.code(400).send({ error: t('errors.dateFormat') });
    }
    if (from && to && from > to) {
      return reply.code(400).send({ error: t('errors.dateOrder') });
    }

    return await getUsage(from || undefined, to || undefined);
  });
}
