import type { Env } from '../../../../src/lib/env';
import { json, fail, methodNotAllowed } from '../../../../src/lib/http';
import { guardAdmin } from '../../../../src/lib/guard';
import { nowIso } from '../../../../src/lib/crypto';
import { audit } from '../../../../src/lib/audit';

/**
 * GET   /api/admin/applications/:id   detalle completo (incluye datos privados)
 * PATCH /api/admin/applications/:id   corrige capacidad, zona o notas internas
 *
 * El detalle es el único punto donde se devuelven dirección y contacto
 * pastoral, y solo a una sesión administrativa válida.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  const id = String(params.id);

  if (request.method === 'GET') {
    const g = await guardAdmin(request, env, { roles: ['admin', 'owner', 'viewer'] });
    if (!g.ok) return g.response;

    const app = await env.DB.prepare(
      `SELECT ga.*, l.full_name, l.email, l.phone_e164, l.church_type, l.church_name,
              l.pastors_name, l.pastoral_contact,
              l.public_name, l.public_name_authorized
         FROM group_applications ga
         JOIN leaders l ON l.id = ga.leader_id
        WHERE ga.id = ?`,
    ).bind(id).first();
    if (!app) return fail('not_found', 'No encontramos esa solicitud.', 404);

    const approvals = await env.DB.prepare(
      `SELECT id, sent_to, sent_at, expires_at, used_at, revoked_at,
              decision, responder_name, comments
         FROM pastoral_approvals WHERE application_id = ? ORDER BY sent_at DESC`,
    ).bind(id).all();

    const history = await env.DB.prepare(
      `SELECT action, actor_type, before_summary, after_summary, created_at
         FROM audit_logs
        WHERE entity_type = 'group_application' AND entity_id = ?
        ORDER BY created_at DESC LIMIT 50`,
    ).bind(id).all();

    return json({
      ok: true,
      solicitud: app,
      aprobaciones_pastorales: approvals.results ?? [],
      historial: history.results ?? [],
    });
  }

  if (request.method === 'PATCH') {
    const g = await guardAdmin(request, env, { mutating: true });
    if (!g.ok) return g.response;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fields: string[] = [];
    const binds: unknown[] = [];

    if (body.capacity !== undefined) {
      const c = Number(body.capacity);
      if (!Number.isInteger(c) || c < 2 || c > 200) {
        return fail('bad_capacity', 'La capacidad debe estar entre 2 y 200.', 422);
      }
      fields.push('capacity = ?'); binds.push(c);
    }
    if (typeof body.zone_public === 'string') {
      fields.push('zone_public = ?'); binds.push(body.zone_public.slice(0, 90));
    }
    if (typeof body.review_notes === 'string') {
      fields.push('review_notes = ?'); binds.push(body.review_notes.slice(0, 2000));
    }
    if (!fields.length) return fail('nothing_to_update', 'No hay cambios que guardar.', 400);

    fields.push('updated_at = ?'); binds.push(nowIso());
    await env.DB.prepare(
      `UPDATE group_applications SET ${fields.join(', ')} WHERE id = ?`,
    ).bind(...binds, id).run();

    await audit(env, {
      actorType: 'admin', actorId: g.session.user.id, action: 'application.updated',
      entityType: 'group_application', entityId: id,
      after: { capacity: body.capacity, zone_public: body.zone_public },
    });

    return json({ ok: true });
  }

  return methodNotAllowed(['GET', 'PATCH']);
};
