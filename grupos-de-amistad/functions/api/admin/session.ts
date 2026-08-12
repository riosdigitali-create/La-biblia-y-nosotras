import type { Env } from '../../../src/lib/env';
import { json, fail, methodNotAllowed } from '../../../src/lib/http';
import { getSession } from '../../../src/lib/auth';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const session = await getSession(env, request);
  if (!session) return fail('unauthenticated', 'Sesión no válida.', 401);
  return json({
    ok: true,
    user: { name: session.user.display_name, role: session.user.role },
    must_change_password: session.user.must_change_password === 1,
    auth_mode: env.ADMIN_AUTH_MODE,
  });
};
