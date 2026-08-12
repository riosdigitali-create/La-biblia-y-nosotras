import type { Env } from '../../../src/lib/env';
import { json, fail, clientIp, sameOrigin, methodNotAllowed } from '../../../src/lib/http';
import { loginWithPassword, sessionCookie } from '../../../src/lib/auth';
import { verifyTurnstile } from '../../../src/lib/turnstile';
import { normalizeEmail } from '../../../src/lib/validation';
import { audit } from '../../../src/lib/audit';

/**
 * POST /api/admin/login
 *
 * Con ADMIN_AUTH_MODE = "access" este endpoint no se usa: Cloudflare
 * Access autentica antes de llegar aquí. Es el camino recomendado.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  if (env.ADMIN_AUTH_MODE === 'access') {
    return fail('access_mode', 'Este panel usa Cloudflare Access. Entra por el enlace de tu organización.', 400);
  }

  const ip = clientIp(request);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad_json', 'No pudimos leer los datos enviados.');
  }

  if (!(await verifyTurnstile(env, body.turnstile_token as string | undefined, ip))) {
    return fail('turnstile_failed', 'No pudimos verificar la petición. Vuelve a intentarlo.', 403);
  }

  const email = normalizeEmail(String(body.email ?? ''));
  const password = String(body.password ?? '');
  if (!email || !password) {
    return fail('invalid_credentials', 'Revisa tu correo y tu contraseña.', 401);
  }

  const result = await loginWithPassword(
    env, email, password, ip, request.headers.get('User-Agent') ?? '',
  );

  if (!result.ok) {
    await audit(env, {
      actorType: 'system', action: 'login.failed',
      entityType: 'admin_user', entityId: 'unknown',
      after: { code: result.code }, ip,
    });
    // Mismo mensaje para credenciales malas y usuaria inexistente.
    return result.code === 'locked'
      ? fail('locked', 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.', 429)
      : fail('invalid_credentials', 'Revisa tu correo y tu contraseña.', 401);
  }

  await audit(env, {
    actorType: 'admin', actorId: result.user.id, action: 'login.ok',
    entityType: 'admin_user', entityId: result.user.id, ip,
  });

  return json(
    {
      ok: true,
      user: { name: result.user.display_name, role: result.user.role },
      csrf: result.csrf,
      must_change_password: result.user.must_change_password === 1,
    },
    200,
    { 'Set-Cookie': sessionCookie(result.token, 12 * 60 * 60) },
  );
};
