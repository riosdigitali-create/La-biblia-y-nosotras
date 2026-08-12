import type { Env } from '../../../src/lib/env';
import { json, methodNotAllowed } from '../../../src/lib/http';
import { searchPublishedGroups } from '../../../src/lib/services/groups';

/**
 * Orígenes que pueden LEER esta búsqueda desde otro dominio.
 *
 * Sólo la landing. No es una puerta nueva: este endpoint ya era público
 * y devuelve exclusivamente la proyección de services/groups.ts, que
 * nunca lleva dirección, teléfono, correo ni notas internas. Abrirlo
 * permite que la portada de cuenta regresiva —que vive en otro dominio,
 * labibliaynosotras.com— enseñe los círculos cercanos sin mandar a nadie
 * a otra página.
 *
 * Las escrituras (apply, join) siguen cerradas a mismo origen.
 */
const LECTORES = [
  'https://labibliaynosotras.com',
  'https://www.labibliaynosotras.com',
];

function cabecerasCors(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  if (!LECTORES.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * GET /api/groups/search
 *
 * Portero de lectura. La proyección pública —y la garantía de que jamás
 * viaja dirección, teléfono, correo, contacto pastoral ni notas internas—
 * vive en services/groups.ts, compartida con la conversación.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const cors = cabecerasCors(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'GET') return methodNotAllowed(['GET', 'OPTIONS']);

  const q = new URL(request.url).searchParams;
  const r = await searchPublishedGroups(env, {
    cp: q.get('cp') ?? '',
    colonia: q.get('colonia') ?? '',
    municipio: q.get('municipio') ?? '',
    estado: q.get('estado') ?? '',
    modalidad: q.get('modalidad'),
    dia: q.get('dia'),
    limit: Number(q.get('limit') ?? 20),
  });

  if (!r.ok) {
    return json(
      { ok: false, code: 'missing_area',
        message: 'Dinos al menos tu código postal, municipio o estado para buscar cerca de ti.' },
      400, cors,
    );
  }

  return json({ ok: true, total: r.resultados.length, resultados: r.resultados }, 200, cors);
};
