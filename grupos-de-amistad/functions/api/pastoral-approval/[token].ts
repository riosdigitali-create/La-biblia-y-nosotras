import type { Env } from '../../../src/lib/env';
import { json, fail, sameOrigin, clientIp, methodNotAllowed } from '../../../src/lib/http';
import { nowIso, peppered, isExpired } from '../../../src/lib/crypto';
import { canTransition } from '../../../src/lib/states';
import { audit } from '../../../src/lib/audit';

/**
 * GET  /api/pastoral-approval/:token  → información MÍNIMA para decidir
 * POST /api/pastoral-approval/:token  → registra la decisión
 *
 * Reglas que este archivo hace cumplir:
 *  · El token es de un solo uso, con vencimiento, y solo se guarda su hash.
 *  · Un token usado, revocado o vencido nunca vuelve a servir.
 *  · El enlace NO da acceso al panel ni a datos privados.
 *  · LA APROBACIÓN PASTORAL NUNCA PUBLICA: lleva a PENDING_FINAL_APPROVAL.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  const token = String(params.token ?? '');
  if (!token) return fail('bad_token', 'Enlace no válido.', 400);

  const tokenHash = await peppered(token, env.HASH_PEPPER);

  const approval = await env.DB.prepare(
    `SELECT pa.id, pa.application_id, pa.expires_at, pa.used_at, pa.revoked_at,
            ga.status, ga.zone_public, ga.municipio, ga.estado, ga.modality,
            ga.weekday, ga.time_start, ga.capacity, ga.group_name, ga.motivation,
            l.full_name AS leader_name, l.church_name, l.pastors_name
       FROM pastoral_approvals pa
       JOIN group_applications ga ON ga.id = pa.application_id
       JOIN leaders l             ON l.id  = ga.leader_id
      WHERE pa.token_hash = ?`,
  ).bind(tokenHash).first<{
    id: string; application_id: string; expires_at: string;
    used_at: string | null; revoked_at: string | null; status: string;
    zone_public: string; municipio: string; estado: string; modality: string;
    weekday: string; time_start: string; capacity: number;
    group_name: string | null; motivation: string;
    leader_name: string; church_name: string | null; pastors_name: string | null;
  }>();

  // Mismo mensaje para inexistente, usado, revocado y vencido:
  // así el enlace no revela nada por diferencia de respuesta.
  const invalid = !approval || approval.used_at || approval.revoked_at || isExpired(approval?.expires_at);
  if (invalid) {
    return fail(
      'link_invalid',
      'Este enlace ya no está disponible. Si necesitas revisarlo de nuevo, pídenos uno nuevo.',
      410,
    );
  }

  // ── GET: información mínima necesaria para decidir ──────────
  if (request.method === 'GET') {
    return json({
      ok: true,
      solicitud: {
        lider: approval.leader_name,
        iglesia: approval.church_name,
        pastores: approval.pastors_name,
        zona: approval.zone_public,
        municipio: approval.municipio,
        estado: approval.estado,
        modalidad: approval.modality,
        dia: approval.weekday,
        horario: approval.time_start,
        capacidad: approval.capacity,
        nombre_grupo: approval.group_name,
        motivo: approval.motivation,
      },
      // Se dice de forma explícita para que nadie asuma lo contrario.
      aviso: 'Tu respuesta no publica el grupo. Después de tu confirmación, el equipo hace una aprobación final.',
    });
  }

  if (request.method !== 'POST') return methodNotAllowed(['GET', 'POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad_json', 'No pudimos leer tu respuesta.');
  }

  const decision = String(body.decision ?? '');
  if (!['approved', 'rejected', 'more_info'].includes(decision)) {
    return fail('bad_decision', 'Elige una de las tres opciones.');
  }
  const responderName = String(body.responder_name ?? '').trim();
  if (responderName.length < 3) {
    return fail('missing_name', 'Escribe tu nombre para dejar constancia de quién responde.', 422);
  }

  const ip = clientIp(request);
  const ts = nowIso();

  const nextStatus =
    decision === 'approved' ? 'PASTORAL_APPROVED'
    : decision === 'rejected' ? 'PASTORAL_REJECTED'
    : 'NEEDS_CORRECTIONS';

  // El pastorado primero mueve a PASTORAL_REVIEW y de ahí a su decisión.
  const toReview = await canTransition(
    env, approval.application_id, approval.status as never, 'PASTORAL_REVIEW', 'pastor',
  );
  if (!toReview.allowed) {
    return fail('bad_state', 'Esta solicitud ya fue atendida.', 409);
  }
  const toDecision = await canTransition(
    env, approval.application_id, 'PASTORAL_REVIEW', nextStatus as never, 'pastor',
  );
  if (!toDecision.allowed) {
    return fail('bad_state', toDecision.reason ?? 'Cambio de estado no permitido.', 409);
  }

  // Transacción: registrar decisión, quemar el token y mover el estado.
  const statements = [
    env.DB.prepare(
      `UPDATE pastoral_approvals
          SET used_at = ?, decision = ?, responder_name = ?, comments = ?, responder_ip_hash = ?
        WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`,
    ).bind(
      ts, decision, responderName,
      (body.comments as string)?.slice(0, 1200) ?? null,
      ip ? await peppered(ip, env.HASH_PEPPER) : null,
      approval.id,
    ),
    env.DB.prepare(
      `UPDATE group_applications SET status = ?, updated_at = ? WHERE id = ?`,
    ).bind(nextStatus, ts, approval.application_id),
  ];

  // Aprobación pastoral → PENDING_FINAL_APPROVAL. Nunca a PUBLISHED.
  if (decision === 'approved') {
    statements.push(
      env.DB.prepare(
        `UPDATE group_applications SET status = 'PENDING_FINAL_APPROVAL', updated_at = ? WHERE id = ?`,
      ).bind(ts, approval.application_id),
    );
  }

  await env.DB.batch(statements);

  await audit(env, {
    actorType: 'pastor', action: `pastoral.${decision}`,
    entityType: 'group_application', entityId: approval.application_id,
    before: { status: approval.status },
    after: { status: decision === 'approved' ? 'PENDING_FINAL_APPROVAL' : nextStatus },
    ip,
  });

  try {
    await env.JOBS?.send({
      type: 'pastoral.decided',
      applicationId: approval.application_id,
      decision,
      jobKey: `pastoral:${approval.id}`,
    });
  } catch (e) {
    console.warn('queue_send_failed', String(e).slice(0, 120));
  }

  return json({
    ok: true,
    decision,
    mensaje:
      decision === 'approved'
        ? 'Gracias. Registramos tu confirmación. El equipo hará la aprobación final antes de publicar el grupo.'
        : decision === 'more_info'
        ? 'Gracias. Le pediremos a la líder la información adicional que señalaste.'
        : 'Gracias. Registramos tu respuesta.',
  });
};
