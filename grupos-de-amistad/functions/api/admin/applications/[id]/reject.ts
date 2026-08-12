import type { Env } from '../../../../../src/lib/env';
import { json, fail, methodNotAllowed } from '../../../../../src/lib/http';
import { guardAdmin } from '../../../../../src/lib/guard';
import { nowIso } from '../../../../../src/lib/crypto';
import { canTransition } from '../../../../../src/lib/states';
import { audit } from '../../../../../src/lib/audit';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const g = await guardAdmin(request, env, { mutating: true, roles: ['admin', 'owner'] });
  if (!g.ok) return g.response;

  const id = String(params.id);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.confirm !== true) return fail('confirmation_required', 'Confirma que quieres rechazar esta solicitud.', 428);

  const reason = String(body.reason ?? '').trim();
  if (reason.length < 10) return fail('missing_reason', 'Escribe el motivo para dejar constancia.', 422);

  const app = await env.DB.prepare(`SELECT status FROM group_applications WHERE id = ?`)
    .bind(id).first<{ status: string }>();
  if (!app) return fail('not_found', 'No encontramos esa solicitud.', 404);

  const check = await canTransition(env, id, app.status as never, 'REJECTED', 'admin');
  if (!check.allowed) return fail('bad_state', check.reason ?? 'Cambio no permitido.', 409);

  // Archivado, no borrado.
  await env.DB.prepare(
    `UPDATE group_applications
        SET status = 'REJECTED', rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?`,
  ).bind(reason.slice(0, 1000), g.session.user.id, nowIso(), nowIso(), id).run();

  await audit(env, {
    actorType: 'admin', actorId: g.session.user.id, action: 'application.rejected',
    entityType: 'group_application', entityId: id,
    before: { status: app.status }, after: { status: 'REJECTED' },
  });

  return json({ ok: true, estado: 'REJECTED' });
};
