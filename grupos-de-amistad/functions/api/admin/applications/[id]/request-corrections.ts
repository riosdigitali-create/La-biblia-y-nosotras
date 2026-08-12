import type { Env } from '../../../../../src/lib/env';
import { json, fail, methodNotAllowed } from '../../../../../src/lib/http';
import { guardAdmin } from '../../../../../src/lib/guard';
import { nowIso } from '../../../../../src/lib/crypto';
import { canTransition } from '../../../../../src/lib/states';
import { audit } from '../../../../../src/lib/audit';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const g = await guardAdmin(request, env, { mutating: true });
  if (!g.ok) return g.response;

  const id = String(params.id);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = String(body.notes ?? '').trim();
  if (notes.length < 10) {
    return fail('missing_notes', 'Explica qué necesita corregir la líder, para que sepa qué hacer.', 422);
  }

  const app = await env.DB.prepare(`SELECT status FROM group_applications WHERE id = ?`)
    .bind(id).first<{ status: string }>();
  if (!app) return fail('not_found', 'No encontramos esa solicitud.', 404);

  const check = await canTransition(env, id, app.status as never, 'NEEDS_CORRECTIONS', 'admin');
  if (!check.allowed) return fail('bad_state', check.reason ?? 'Cambio no permitido.', 409);

  await env.DB.prepare(
    `UPDATE group_applications SET status = 'NEEDS_CORRECTIONS', review_notes = ?, updated_at = ? WHERE id = ?`,
  ).bind(notes.slice(0, 2000), nowIso(), id).run();

  await audit(env, {
    actorType: 'admin', actorId: g.session.user.id, action: 'application.corrections_requested',
    entityType: 'group_application', entityId: id,
    before: { status: app.status }, after: { status: 'NEEDS_CORRECTIONS' },
  });

  try {
    await env.JOBS?.send({ type: 'application.corrections', applicationId: id, jobKey: `corr:${id}:${nowIso()}` });
  } catch { /* la solicitud ya quedó guardada */ }

  return json({ ok: true, estado: 'NEEDS_CORRECTIONS' });
};
