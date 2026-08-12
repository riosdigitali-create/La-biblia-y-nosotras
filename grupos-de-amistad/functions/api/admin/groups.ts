import type { Env } from '../../../src/lib/env';
import { json, methodNotAllowed } from '../../../src/lib/http';
import { guardAdmin } from '../../../src/lib/guard';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const g = await guardAdmin(request, env, { roles: ['admin', 'owner', 'viewer'] });
  if (!g.ok) return g.response;

  const q = new URL(request.url).searchParams;
  const estado = q.get('estado');
  const where = ['g.archived_at IS NULL'];
  const binds: unknown[] = [];
  if (estado) { where.push('g.editorial_status = ?'); binds.push(estado); }

  const rows = await env.DB.prepare(
    `SELECT g.id, g.public_name, g.editorial_status, g.is_visible, g.is_active,
            g.estado, g.municipio, g.zone_public, g.modality, g.weekday, g.time_start,
            g.capacity, g.occupied, g.published_at, l.full_name AS lider
       FROM groups g JOIN leaders l ON l.id = g.leader_id
      WHERE ${where.join(' AND ')}
      ORDER BY g.published_at DESC LIMIT 100`,
  ).bind(...binds).all();

  return json({ ok: true, items: rows.results ?? [] });
};
