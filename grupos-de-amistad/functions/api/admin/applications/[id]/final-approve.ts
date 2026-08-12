import type { Env } from '../../../../../src/lib/env';
import { json, fail, methodNotAllowed } from '../../../../../src/lib/http';
import { guardAdmin } from '../../../../../src/lib/guard';
import { randomId, nowIso } from '../../../../../src/lib/crypto';
import { canTransition, type AppStatus } from '../../../../../src/lib/states';
import { audit } from '../../../../../src/lib/audit';

interface ApplicationForPublication {
  id: string;
  status: AppStatus;
  leader_id: string;
  group_name: string | null;
  public_name_authorized: number;
  full_name: string;
  estado: string;
  municipio: string;
  postal_code: string;
  colonia: string;
  zone_public: string;
  address_private: string | null;
  modality: string;
  weekday: string;
  time_start: string;
  capacity: number;
}

/**
 * POST /api/admin/applications/:id/final-approve
 *
 * Acepta y publica una solicitud en una sola operación administrativa.
 * La escritura del grupo y el cambio de estado se ejecutan juntas en D1;
 * cuando esta respuesta confirma el éxito, la búsqueda pública ya puede
 * encontrar el grupo por código postal.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);

  const guarded = await guardAdmin(request, env, {
    mutating: true,
    roles: ['admin', 'owner'],
  });
  if (!guarded.ok) return guarded.response;

  const id = String(params.id);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.confirm !== true) {
    return fail('confirmation_required', 'Confirma que quieres aceptar y publicar este grupo.', 428);
  }

  const application = await env.DB.prepare(
    `SELECT ga.id, ga.status, ga.leader_id, ga.group_name, ga.estado,
            ga.municipio, ga.postal_code, ga.colonia, ga.zone_public,
            ga.address_private, ga.modality, ga.weekday, ga.time_start,
            ga.capacity, l.public_name_authorized, l.full_name
       FROM group_applications ga
       JOIN leaders l ON l.id = ga.leader_id
      WHERE ga.id = ? AND ga.archived_at IS NULL`,
  ).bind(id).first<ApplicationForPublication>();

  if (!application) return fail('not_found', 'No encontramos esa solicitud.', 404);

  const transition = await canTransition(
    env,
    id,
    application.status,
    'PUBLISHED',
    'admin',
  );
  if (!transition.allowed) {
    return fail('not_allowed', transition.reason ?? 'Esta solicitud no se puede publicar.', 409);
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM groups WHERE application_id = ?`,
  ).bind(id).first<{ id: string }>();
  if (existing) return fail('already_published', 'Este grupo ya fue publicado.', 409);

  const groupId = randomId();
  const timestamp = nowIso();
  const publicName = application.group_name
    ?? (application.public_name_authorized
      ? `Grupo de ${application.full_name.split(/\s+/)[0] ?? ''}`.trim()
      : 'Grupo de amistad');

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO groups
          (id, application_id, leader_id, editorial_status, is_visible, is_active,
           public_name, estado, municipio, postal_code, colonia, zone_public,
           address_private, modality, weekday, time_start, capacity, occupied,
           published_at, published_by, created_at, updated_at)
         VALUES (?,?,?, 'PUBLISHED', 1, 1, ?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`,
      ).bind(
        groupId,
        id,
        application.leader_id,
        publicName,
        application.estado,
        application.municipio,
        application.postal_code,
        application.colonia,
        application.zone_public,
        application.address_private,
        application.modality,
        application.weekday,
        application.time_start,
        application.capacity,
        timestamp,
        guarded.session.user.id,
        timestamp,
        timestamp,
      ),
      env.DB.prepare(
        `UPDATE group_applications
            SET status = 'PUBLISHED', reviewed_by = ?, reviewed_at = ?, updated_at = ?
          WHERE id = ? AND status = ?`,
      ).bind(
        guarded.session.user.id,
        timestamp,
        timestamp,
        id,
        application.status,
      ),
    ]);
  } catch (error) {
    console.error(JSON.stringify({
      message: 'group_publish_failed',
      application_id: id,
      error: error instanceof Error ? error.message : String(error),
    }));
    return fail('write_failed', 'No pudimos publicar el grupo. Vuelve a intentarlo.', 500);
  }

  await audit(env, {
    actorType: 'admin',
    actorId: guarded.session.user.id,
    action: 'application.accepted_and_published',
    entityType: 'group',
    entityId: groupId,
    before: { status: application.status },
    after: { status: 'PUBLISHED', application_id: id },
  });

  try {
    await env.JOBS?.send({
      type: 'group.published',
      groupId,
      applicationId: id,
      jobKey: `pub:${groupId}`,
    });
  } catch (error) {
    console.warn(JSON.stringify({
      message: 'queue_send_failed',
      application_id: id,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return json({
    ok: true,
    group_id: groupId,
    estado: 'PUBLISHED',
    searchable_now: true,
  });
};
