import type { Env } from '../../../../../src/lib/env';
import { json, fail, methodNotAllowed } from '../../../../../src/lib/http';
import { guardAdmin } from '../../../../../src/lib/guard';
import { randomId, randomToken, nowIso, isoPlus, peppered } from '../../../../../src/lib/crypto';
import { canTransition } from '../../../../../src/lib/states';
import { audit } from '../../../../../src/lib/audit';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /api/admin/applications/:id/send-pastoral-approval
 *
 * Genera un token nuevo, guarda SOLO su hash e invalida el anterior.
 * El token en claro se devuelve una única vez para poder enviarlo.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const g = await guardAdmin(request, env, { mutating: true });
  if (!g.ok) return g.response;

  const id = String(params.id);
  const app = await env.DB.prepare(
    `SELECT ga.status, ga.pastoral_contact_authorized, l.pastoral_contact
       FROM group_applications ga JOIN leaders l ON l.id = ga.leader_id
      WHERE ga.id = ?`,
  ).bind(id).first<{ status: string; pastoral_contact_authorized: number; pastoral_contact: string | null }>();

  if (!app) return fail('not_found', 'No encontramos esa solicitud.', 404);
  if (!app.pastoral_contact_authorized || !app.pastoral_contact) {
    return fail('no_pastoral_contact', 'Esta líder no autorizó el contacto pastoral, o no dejó un contacto.', 409);
  }

  const check = await canTransition(env, id, app.status as never, 'PENDING_PASTORAL_APPROVAL', 'admin');
  if (!check.allowed) return fail('bad_state', check.reason ?? 'Cambio de estado no permitido.', 409);

  const token = randomToken(32);
  const tokenHash = await peppered(token, env.HASH_PEPPER);
  const ts = nowIso();

  await env.DB.batch([
    // Invalidar cualquier token abierto anterior.
    env.DB.prepare(
      `UPDATE pastoral_approvals SET revoked_at = ?
        WHERE application_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
    ).bind(ts, id),
    env.DB.prepare(
      `INSERT INTO pastoral_approvals
         (id, application_id, token_hash, sent_to, sent_at, expires_at, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(randomId(), id, tokenHash, app.pastoral_contact, ts, isoPlus(TTL_MS), ts),
    env.DB.prepare(
      `UPDATE group_applications SET status = 'PENDING_PASTORAL_APPROVAL', updated_at = ? WHERE id = ?`,
    ).bind(ts, id),
  ]);

  await audit(env, {
    actorType: 'admin', actorId: g.session.user.id, action: 'pastoral.sent',
    entityType: 'group_application', entityId: id,
    before: { status: app.status }, after: { status: 'PENDING_PASTORAL_APPROVAL' },
  });

  try {
    await env.JOBS?.send({ type: 'pastoral.send_link', applicationId: id, token, jobKey: `pastsend:${id}:${ts}` });
  } catch (e) {
    console.warn('queue_send_failed', String(e).slice(0, 120));
  }

  // Se devuelve una sola vez, para que administración pueda enviarlo a mano
  // mientras el proveedor de correo no esté configurado.
  return json({
    ok: true,
    enlace: `${env.APP_ORIGIN}/aprobacion/?t=${token}`,
    vence: isoPlus(TTL_MS),
    aviso: 'Este enlace se muestra una sola vez y es de un solo uso.',
  });
};
