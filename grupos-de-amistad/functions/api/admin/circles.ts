import type { Env } from '../../../src/lib/env';
import { json, methodNotAllowed } from '../../../src/lib/http';
import { guardAdmin } from '../../../src/lib/guard';
import { resumenCirculos } from '../../../src/lib/services/circles';

/**
 * GET /api/admin/circles
 *
 * Las tres preguntas que el equipo hace todos los días:
 *   ¿cuántos círculos llevamos?
 *   ¿de qué iglesias vienen?
 *   ¿en qué ciudades están?
 *
 * Y la cuarta, que es la que pidieron explícitamente: qué iglesias ya
 * juntaron varias mujeres y hay que avisar a su pastora.
 *
 * Sólo lectura. No devuelve correos ni teléfonos: para eso está la
 * exportación, que queda registrada en la auditoría.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const g = await guardAdmin(request, env, { roles: ['admin', 'owner', 'viewer'] });
  if (!g.ok) return g.response;

  const resumen = await resumenCirculos(env);
  return json({ ok: true, ...resumen });
};
