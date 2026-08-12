import type { Env } from '../../../src/lib/env';
import { json, fail, clientIp, sameOrigin, methodNotAllowed } from '../../../src/lib/http';
import { loginWithPin, sessionCookie } from '../../../src/lib/auth';
import { audit } from '../../../src/lib/audit';

/**
 * POST /api/admin/pin
 *
 * Entrada corta al panel para las pastoras. Existe porque se pidió
 * expresamente, y conviene tener escrito qué se gana y qué se pierde:
 *
 *   Se gana  · nadie tiene que recordar ni compartir una contraseña
 *              larga, y se puede dictar por teléfono.
 *   Se pierde · la auditoría deja de saber QUIÉN entró: todas las
 *              sesiones abiertas por PIN cuelgan de la misma cuenta.
 *              Y seis dígitos son un millón de combinaciones, no las
 *              1e21 de una contraseña de doce caracteres.
 *
 * Lo que hace que siga siendo defendible es el freno por IP de
 * `loginWithPin`: cinco fallos, quince minutos parada. A ese ritmo,
 * recorrer el millón entero pasa de minutos a años.
 *
 * El PIN vive en el secreto `PANEL_PIN`. Nunca en wrangler.toml, ni
 * en el repositorio, ni en JavaScript de cliente: ahí sería público.
 * Si el secreto no está puesto, este endpoint no existe.
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

  const pin = String(body.pin ?? '').trim();
  if (!pin) return fail('invalid_pin', 'Escribe el PIN.', 401);

  const r = await loginWithPin(env, pin, ip, request.headers.get('User-Agent') ?? '');

  if (!r.ok) {
    await audit(env, {
      actorType: 'system', action: 'login.pin.failed',
      entityType: 'admin_user', entityId: 'pin',
      after: { code: r.code }, ip,
    });

    if (r.code === 'locked') {
      return fail('locked', 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.', 429);
    }
    if (r.code === 'pin_disabled' || r.code === 'no_account') {
      // No se distingue de un PIN malo: quien pruebe no aprende nada.
      return fail('invalid_pin', 'PIN incorrecto.', 401);
    }
    return fail('invalid_pin', 'PIN incorrecto.', 401);
  }

  await audit(env, {
    actorType: 'admin', actorId: r.user.id, action: 'login.pin.ok',
    entityType: 'admin_user', entityId: r.user.id, ip,
  });

  return json(
    {
      ok: true,
      user: { name: r.user.display_name, role: r.user.role },
      csrf: r.csrf,
      must_change_password: r.user.must_change_password === 1,
    },
    200,
    { 'Set-Cookie': sessionCookie(r.token, 12 * 60 * 60) },
  );
};
