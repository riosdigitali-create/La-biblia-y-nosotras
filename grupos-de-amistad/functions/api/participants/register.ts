import type { Env } from '../../../src/lib/env';
import { json, fail, sameOrigin, clientIp, methodNotAllowed } from '../../../src/lib/http';
import { verifyTurnstile } from '../../../src/lib/turnstile';
import { saveParticipant } from '../../../src/lib/services/participants';
import { createJoinAuthorization } from '../../../src/lib/crypto';

/**
 * POST /api/participants/register
 *
 * Esta función solo hace de portero: método, origen, Turnstile y forma del
 * cuerpo. Las reglas de negocio viven en services/participants.ts, que es
 * la misma implementación que usa la conversación. Así el chat no puede
 * registrar a nadie con menos validaciones que el formulario.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  const ip = clientIp(request);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad_json', 'No pudimos leer los datos enviados.');
  }

  if (!(await verifyTurnstile(env, body.turnstile_token as string | undefined, ip))) {
    return fail('turnstile_failed', 'No pudimos verificar que eres una persona. Vuelve a intentarlo.', 403);
  }

  const r = await saveParticipant(env, body, {
    ip,
    userAgent: request.headers.get('User-Agent') ?? '',
    origen: 'formulario',
  });

  if (!r.ok) {
    if (r.code === 'validation_failed') {
      return fail('validation_failed', 'Revisa los campos marcados.', 422, r.errors);
    }
    return fail('write_failed', 'No pudimos guardar tus datos. Vuelve a intentarlo.', 500);
  }

  return json(
    {
      ok: true,
      participant_id: r.participantId,
      join_token: await createJoinAuthorization(r.participantId, env.SESSION_PEPPER),
      ...(r.returning ? { returning: true } : {}),
    },
    r.returning ? 200 : 201,
  );
};
