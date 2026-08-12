import type { Env } from '../../../src/lib/env';
import { json, fail, sameOrigin, clientIp, methodNotAllowed } from '../../../src/lib/http';
import { peppered } from '../../../src/lib/crypto';
import { createSession, underRateLimit } from '../../../src/lib/chat/session';
import { SALUDO } from '../../../src/lib/chat/prompt';

/**
 * POST /api/chat/session
 *
 * Abre una conversación y devuelve un token opaco. El navegador guarda ese
 * token y nada más: el estado vive en el servidor.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  const ip = clientIp(request);
  const ipHash = ip ? await peppered(ip, env.HASH_PEPPER) : 'sin-ip';

  if (!(await underRateLimit(env, ipHash, 6))) {
    return fail('rate_limited', 'Demasiadas conversaciones nuevas. Espera un momento.', 429);
  }

  const { token } = await createSession(env, ipHash);
  return json({
    ok: true,
    token,
    saludo: SALUDO,
    // Único dato de configuración que viaja al navegador. No es un secreto.
    whatsapp: env.CHAT_WHATSAPP ?? '',
  }, 201);
};
