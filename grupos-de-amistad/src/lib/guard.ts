import type { Env } from './env';
import { fail, sameOrigin } from './http';
import { getSession, checkCsrf, requireRole, type Session } from './auth';

export type Guarded =
  | { ok: true; session: Session }
  | { ok: false; response: Response };

/**
 * Puerta única de /api/admin/*.
 * Autorización en servidor, siempre. Nada depende de botones ocultos.
 */
export async function guardAdmin(
  request: Request,
  env: Env,
  opts: { mutating?: boolean; roles?: Array<'admin' | 'owner' | 'viewer'> } = {},
): Promise<Guarded> {
  const session = await getSession(env, request);
  if (!session) {
    return { ok: false, response: fail('unauthenticated', 'Inicia sesión para continuar.', 401) };
  }

  const roles = opts.roles ?? ['admin', 'owner'];
  if (!requireRole(session, roles)) {
    return { ok: false, response: fail('forbidden', 'Tu cuenta no tiene permiso para esta acción.', 403) };
  }

  if (opts.mutating) {
    if (!sameOrigin(request, env.APP_ORIGIN)) {
      return { ok: false, response: fail('bad_origin', 'Origen no permitido.', 403) };
    }
    if (!(await checkCsrf(env, request, session))) {
      return { ok: false, response: fail('csrf_failed', 'Tu sesión expiró. Vuelve a cargar la página.', 403) };
    }
    if (session.user.must_change_password) {
      return {
        ok: false,
        response: fail('must_change_password', 'Antes de continuar necesitas cambiar tu contraseña.', 428),
      };
    }
  }

  return { ok: true, session };
}
