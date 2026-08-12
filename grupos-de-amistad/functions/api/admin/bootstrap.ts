import type { Env } from '../../../src/lib/env';
import { json, fail, sameOrigin, clientIp, methodNotAllowed } from '../../../src/lib/http';
import { randomId, randomToken, nowIso, hashPassword, timingSafeEqual, PBKDF2_ITERATIONS } from '../../../src/lib/crypto';
import { normalizeEmail } from '../../../src/lib/validation';
import { audit } from '../../../src/lib/audit';

/**
 * POST /api/admin/bootstrap
 *
 * Crea la PRIMERA cuenta administradora. Se protege con el secreto
 * ADMIN_BOOTSTRAP_TOKEN y solo funciona mientras no exista ninguna cuenta.
 *
 * La contraseña nunca se escribe en el repositorio, ni en wrangler.toml,
 * ni en una migración, ni en un log. Viaja una sola vez por HTTPS desde
 * el equipo de quien instala, y aquí solo se guarda su hash con sal.
 *
 * La cuenta nace con must_change_password = 1: en el primer acceso hay
 * que fijar una frase larga. Ver docs/DESPLIEGUE.md.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  if (!env.ADMIN_BOOTSTRAP_TOKEN) {
    return fail('bootstrap_disabled', 'La inicialización no está habilitada.', 403);
  }

  const provided = request.headers.get('X-Bootstrap-Token') ?? '';
  if (!timingSafeEqual(provided, env.ADMIN_BOOTSTRAP_TOKEN)) {
    return fail('bad_bootstrap_token', 'Token de inicialización no válido.', 403);
  }

  const already = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM admin_users WHERE archived_at IS NULL`,
  ).first<{ n: number }>();
  if ((already?.n ?? 0) > 0) {
    return fail('already_initialized', 'Ya existe una cuenta administradora. Usa el cambio de contraseña.', 409);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = normalizeEmail(String(body.email ?? ''));
  const password = String(body.password ?? '');
  const name = String(body.display_name ?? '').trim();

  if (!email.includes('@')) return fail('bad_email', 'Escribe un correo válido.', 422);
  if (!name) return fail('bad_name', 'Escribe el nombre de la persona administradora.', 422);
  if (password.length < 12) {
    return fail('weak_password', 'La contraseña inicial debe tener al menos 12 caracteres.', 422);
  }

  const salt = randomToken(16);
  const hash = await hashPassword(password, salt, PBKDF2_ITERATIONS);
  const id = randomId();
  const ts = nowIso();

  await env.DB.prepare(
    `INSERT INTO admin_users
       (id, email, email_normalized, display_name, role, password_hash, password_salt,
        password_algo, password_iterations, must_change_password, created_at, updated_at)
     VALUES (?,?,?,?, 'owner', ?,?, 'PBKDF2-SHA256', ?, 1, ?,?)`,
  ).bind(id, String(body.email).trim(), email, name, hash, salt, PBKDF2_ITERATIONS, ts, ts).run();

  await audit(env, {
    actorType: 'system', action: 'admin.bootstrapped',
    entityType: 'admin_user', entityId: id, ip: clientIp(request),
  });

  return json({
    ok: true,
    aviso: 'Cuenta creada. Retira ahora el secreto ADMIN_BOOTSTRAP_TOKEN y cambia la contraseña en el primer acceso.',
  }, 201);
};
