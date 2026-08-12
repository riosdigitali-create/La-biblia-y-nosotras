import type { Env } from '../../../../src/lib/env';
import { json, fail, sameOrigin, clientIp, methodNotAllowed } from '../../../../src/lib/http';
import { requestGroupJoin } from '../../../../src/lib/services/groups';
import { verifyJoinAuthorization } from '../../../../src/lib/crypto';

/**
 * POST /api/groups/:id/join
 *
 * Portero. La reserva atómica del cupo y el alta en group_join_requests
 * viven en services/groups.ts, compartidas con la conversación.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  const ip = clientIp(request);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad_json', 'No pudimos leer los datos enviados.');
  }

  const participantId = String(body.participant_id ?? '');
  if (!participantId) {
    return fail('missing_participant', 'Primero necesitamos tus datos para apartar tu lugar.');
  }

  const authorized = await verifyJoinAuthorization(
    String(body.join_token ?? ''),
    participantId,
    env.SESSION_PEPPER,
  );
  if (!authorized) {
    return fail('join_authorization_failed', 'La autorización para unirte caducó. Vuelve a empezar.', 403);
  }

  const r = await requestGroupJoin(env, String(params.id), participantId, ip);

  if (!r.ok) {
    if (r.code === 'unknown_participant') {
      return fail('unknown_participant', 'No encontramos tu registro. Vuelve a empezar.', 404);
    }
    if (r.code === 'group_unavailable') {
      return fail(
        'group_unavailable',
        'Este grupo acaba de quedarse sin lugares. Te mostramos otras opciones cercanas.',
        409,
      );
    }
    return fail('write_failed', 'No pudimos apartar tu lugar. Vuelve a intentarlo.', 500);
  }

  return json({ ok: true, estado: r.estado, ...(r.duplicate ? { duplicate: true } : {}) }, r.duplicate ? 200 : 201);
};
