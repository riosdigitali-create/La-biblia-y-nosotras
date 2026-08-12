import type { Env } from '../../../src/lib/env';
import { json, methodNotAllowed } from '../../../src/lib/http';
import { guardAdmin } from '../../../src/lib/guard';

/** GET /api/admin/applications?status=&q=&page= */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const g = await guardAdmin(request, env, { roles: ['admin', 'owner', 'viewer'] });
  if (!g.ok) return g.response;

  const q = new URL(request.url).searchParams;
  const status = q.get('status');
  const search = (q.get('q') ?? '').trim().slice(0, 60);
  const page = Math.max(1, Number(q.get('page') ?? 1) || 1);
  const perPage = 25;

  const where = ['ga.archived_at IS NULL'];
  const binds: unknown[] = [];
  if (status) { where.push('ga.status = ?'); binds.push(status); }
  if (search) {
    where.push('(ga.folio LIKE ? OR ga.municipio LIKE ? OR l.full_name LIKE ?)');
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const rows = await env.DB.prepare(
    `SELECT ga.id, ga.folio, ga.status, ga.estado, ga.municipio, ga.zone_public,
            ga.modality, ga.weekday, ga.time_start, ga.capacity, ga.created_at,
            l.full_name AS lider, l.church_type
       FROM group_applications ga
       JOIN leaders l ON l.id = ga.leader_id
      WHERE ${where.join(' AND ')}
      ORDER BY ga.created_at DESC
      LIMIT ? OFFSET ?`,
  ).bind(...binds, perPage, (page - 1) * perPage).all();

  const total = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM group_applications ga
       JOIN leaders l ON l.id = ga.leader_id
      WHERE ${where.join(' AND ')}`,
  ).bind(...binds).first<{ n: number }>();

  return json({ ok: true, page, per_page: perPage, total: total?.n ?? 0, items: rows.results ?? [] });
};
