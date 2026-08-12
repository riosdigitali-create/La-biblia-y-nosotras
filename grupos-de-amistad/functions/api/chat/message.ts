import type { Env } from '../../../src/lib/env';
import { json, fail, sameOrigin, clientIp, methodNotAllowed } from '../../../src/lib/http';
import { peppered } from '../../../src/lib/crypto';
import { loadSession, underRateLimit } from '../../../src/lib/chat/session';
import { responderTurno, MAX_CHARS } from '../../../src/lib/chat/orchestrator';

/**
 * POST /api/chat/message   { token, texto }
 *
 * Un turno. El token identifica la sesión; el navegador no manda estado.
 * Nunca se devuelve el borrador ni el historial: solo la respuesta.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  const ip = clientIp(request);
  const ipHash = ip ? await peppered(ip, env.HASH_PEPPER) : 'sin-ip';

  if (!(await underRateLimit(env, ipHash, 12))) {
    return fail('rate_limited', 'Vas muy rápido. Espera unos segundos y vuelve a escribir.', 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad_json', 'No pudimos leer tu mensaje.');
  }

  const texto = String(body.texto ?? '');
  if (texto.length > MAX_CHARS * 2) {
    return fail('too_long', 'Ese mensaje es muy largo. ¿Me lo cuentas más corto?', 413);
  }

  const session = await loadSession(env, String(body.token ?? ''));
  if (!session) {
    return fail('session_expired', 'La conversación caducó. Vamos a empezar de nuevo.', 440);
  }

  try {
    const r = await responderTurno(env, { session, texto, ip });
    return json({
      ok: true,
      respuesta: r.respuesta,
      ...(r.datos ? { datos: r.datos } : {}),
      escalado: r.escalado,
      agotada: r.agotada,
    });
  } catch (e) {
    console.error('chat_turn_failed', String(e).slice(0, 200));
    return fail(
      'turn_failed',
      'Algo falló de nuestro lado. Escríbenos por WhatsApp y te atendemos ahí.',
      500,
    );
  }
};
