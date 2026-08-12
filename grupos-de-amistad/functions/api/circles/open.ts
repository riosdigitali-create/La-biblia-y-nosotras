import type { Env } from '../../../src/lib/env';
import { json, fail, sameOrigin, clientIp, methodNotAllowed } from '../../../src/lib/http';
import { verifyTurnstile } from '../../../src/lib/turnstile';
import { openCircle } from '../../../src/lib/services/circles';

/**
 * POST /api/circles/open
 *
 * «Quiero abrir mi círculo». El camino principal del sitio.
 *
 * Igual que el resto de endpoints, esta función solo hace de portero:
 * método, origen, Turnstile y forma del cuerpo. Las reglas viven en
 * services/circles.ts.
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

  const r = await openCircle(env, body, {
    ip,
    userAgent: request.headers.get('User-Agent') ?? '',
    origen: 'formulario',
  });

  if (!r.ok) {
    if (r.code === 'validation_failed') {
      return fail('validation_failed', 'Revisa los campos marcados.', 422, r.errors);
    }
    return fail('write_failed', 'No pudimos guardar tu registro. Vuelve a intentarlo.', 500);
  }

  return json(
    { ok: true, folio: r.folio, ...(r.returning ? { returning: true } : {}) },
    r.returning ? 200 : 201,
  );
};
