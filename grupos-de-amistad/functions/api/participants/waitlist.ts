import type { Env } from '../../../src/lib/env';
import { json, fail, sameOrigin, clientIp, methodNotAllowed } from '../../../src/lib/http';
import { joinWaitlist } from '../../../src/lib/services/participants';

/**
 * POST /api/participants/waitlist
 * Lista de espera. El lenguaje nunca es de rechazo: es acompañamiento.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad_json', 'No pudimos leer los datos enviados.');
  }

  const id = String(body.participant_id ?? '');
  if (!id) return fail('missing_participant', 'Primero necesitamos tus datos.');

  const r = await joinWaitlist(env, id, clientIp(request));
  if (!r.ok) return fail('unknown_participant', 'No encontramos tu registro.', 404);

  return json({
    ok: true,
    mensaje:
      'Todavía no encontramos un grupo disponible en tu zona. Tus datos quedaron registrados y te contactaremos cuando se abra una opción cercana.',
  });
};
