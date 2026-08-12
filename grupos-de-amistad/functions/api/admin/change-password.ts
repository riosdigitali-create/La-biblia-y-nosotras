import type { Env } from '../../../src/lib/env';
import { json, fail, sameOrigin, methodNotAllowed } from '../../../src/lib/http';
import { getSession, checkCsrf } from '../../../src/lib/auth';
import { randomToken, nowIso, hashPassword, timingSafeEqual, PBKDF2_ITERATIONS } from '../../../src/lib/crypto';
import { audit } from '../../../src/lib/audit';

/**
 * POST /api/admin/change-password
 *
 * Exige la contraseña actual. Al cambiarla, revoca todas las demás
 * sesiones de esa usuaria: si alguien más tenía una sesión abierta,
 * deja de servir.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  const session = await getSession(env, request);
  if (!session) return fail('unauthenticated', 'Inicia sesión para continuar.', 401);
  if (!(await checkCsrf(env, request, session))) {
    return fail('csrf_failed', 'Tu sesión expiró. Vuelve a cargar la página.', 403);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const current = String(body.current_password ?? '');
  const next = String(body.new_password ?? '');

  if (next.length < 12) {
    return fail('weak_password', 'Elige una frase de al menos 12 caracteres. Una frase larga es más segura que una clave corta.', 422);
  }
  if (next === current) {
    return fail('same_password', 'La nueva contraseña debe ser distinta de la actual.', 422);
  }

  const u = await env.DB.prepare(
    `SELECT password_hash, password_salt, password_iterations FROM admin_users WHERE id = ?`,
  ).bind(session.user.id).first<{ password_hash: string; password_salt: string; password_iterations: number }>();
  if (!u) return fail('not_found', 'Cuenta no encontrada.', 404);

  const candidate = await hashPassword(current, u.password_salt, u.password_iterations ?? PBKDF2_ITERATIONS);
  if (!timingSafeEqual(candidate, u.password_hash)) {
    return fail('invalid_credentials', 'La contraseña actual no coincide.', 401);
  }

  const salt = randomToken(16);
  const hash = await hashPassword(next, salt, PBKDF2_ITERATIONS);
  const ts = nowIso();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE admin_users
          SET password_hash = ?, password_salt = ?, password_algo = 'PBKDF2-SHA256',
              password_iterations = ?, must_change_password = 0, updated_at = ?
        WHERE id = ?`,
    ).bind(hash, salt, PBKDF2_ITERATIONS, ts, session.user.id),
    env.DB.prepare(
      `UPDATE admin_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL`,
    ).bind(ts, session.user.id, session.id),
  ]);

  await audit(env, {
    actorType: 'admin', actorId: session.user.id, action: 'admin.password_changed',
    entityType: 'admin_user', entityId: session.user.id,
  });

  return json({ ok: true });
};
