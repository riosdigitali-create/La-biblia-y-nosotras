/** Respuestas JSON con cabeceras de seguridad y sin filtrar internos. */

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extra },
  });
}

/**
 * Error público. `code` es estable y apto para la interfaz;
 * los detalles internos jamás se devuelven al cliente.
 */
export function fail(code: string, message: string, status = 400, fields?: Record<string, string>): Response {
  return json({ ok: false, code, message, ...(fields ? { fields } : {}) }, status);
}

export const ok = (data: Record<string, unknown> = {}) => json({ ok: true, ...data });

export function methodNotAllowed(allowed: string[]): Response {
  return json({ ok: false, code: 'method_not_allowed', message: 'Método no permitido.' }, 405, {
    Allow: allowed.join(', '),
  });
}

/** Solo se aceptan escrituras del propio origen. */
export function sameOrigin(request: Request, appOrigin: string): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? '';
}
