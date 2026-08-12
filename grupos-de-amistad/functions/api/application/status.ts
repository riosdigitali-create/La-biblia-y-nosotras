import type { Env } from '../../../src/lib/env';
import { json, fail, methodNotAllowed } from '../../../src/lib/http';
import { HUMAN_STATUS, type AppStatus } from '../../../src/lib/states';

/**
 * GET /api/application/status?folio=LBYN-YYYYMM-XXXX
 *
 * Consulta pública por folio. Devuelve el estado en lenguaje humano
 * y NADA más: ni nombres, ni contacto, ni notas internas.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);

  const folio = (new URL(request.url).searchParams.get('folio') ?? '').trim().toUpperCase();
  if (!/^LBYN-\d{6}-[A-F0-9]{4}$/.test(folio)) {
    return fail('bad_folio', 'Revisa tu folio. Tiene este formato: LBYN-202608-AB12.');
  }

  const row = await env.DB.prepare(
    `SELECT status, created_at FROM group_applications WHERE folio = ? AND archived_at IS NULL`,
  ).bind(folio).first<{ status: AppStatus; created_at: string }>();

  if (!row) return fail('not_found', 'No encontramos una solicitud con ese folio.', 404);

  return json({
    ok: true,
    folio,
    estado: row.status,
    estado_texto: HUMAN_STATUS[row.status] ?? 'En proceso',
    publicado: row.status === 'PUBLISHED',
    recibida: row.created_at,
  });
};
