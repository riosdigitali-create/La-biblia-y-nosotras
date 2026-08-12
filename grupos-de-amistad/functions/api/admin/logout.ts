import type { Env } from '../../../src/lib/env';
import { json, methodNotAllowed } from '../../../src/lib/http';
import { getSession, revokeSession, clearSessionCookie } from '../../../src/lib/auth';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const session = await getSession(env, request);
  if (session) await revokeSession(env, session.id);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
};
