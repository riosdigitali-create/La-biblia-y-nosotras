import type { Env } from '../../../src/lib/env';
import { json, methodNotAllowed } from '../../../src/lib/http';
import { guardAdmin } from '../../../src/lib/guard';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const g = await guardAdmin(request, env, { roles: ['admin', 'owner', 'viewer'] });
  if (!g.ok) return g.response;

  const q = new URL(request.url).searchParams;
  const onlyWaitlist = q.get('espera') === '1';

  const rows = await env.DB.prepare(
    `SELECT p.id, p.full_name, p.estado, p.municipio, p.colonia, p.postal_code,
            p.pref_modality, p.pref_weekdays, p.pref_times,
            p.age_range, p.has_community, p.community_name,
            p.is_waitlisted, p.created_at,
            (SELECT COUNT(*) FROM group_join_requests r WHERE r.participant_id = p.id) AS solicitudes
       FROM participants p
      WHERE p.archived_at IS NULL ${onlyWaitlist ? 'AND p.is_waitlisted = 1' : ''}
      ORDER BY p.created_at DESC LIMIT 200`,
  ).all();

  return json({ ok: true, items: rows.results ?? [] });
};
