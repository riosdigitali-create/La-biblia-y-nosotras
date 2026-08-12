import type { Env } from '../../../src/lib/env';
import { json, methodNotAllowed } from '../../../src/lib/http';
import { guardAdmin } from '../../../src/lib/guard';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const g = await guardAdmin(request, env, { roles: ['admin', 'owner'] });
  if (!g.ok) return g.response;

  const q = new URL(request.url).searchParams;
  const entity = q.get('entity_type');
  const page = Math.max(1, Number(q.get('page') ?? 1) || 1);

  const where = entity ? 'WHERE entity_type = ?' : '';
  const binds: unknown[] = entity ? [entity] : [];

  const rows = await env.DB.prepare(
    `SELECT id, actor_type, actor_id, action, entity_type, entity_id,
            before_summary, after_summary, created_at
       FROM audit_logs ${where}
      ORDER BY created_at DESC LIMIT 50 OFFSET ?`,
  ).bind(...binds, (page - 1) * 50).all();

  return json({ ok: true, page, items: rows.results ?? [] });
};
