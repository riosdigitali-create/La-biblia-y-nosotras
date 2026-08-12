/**
 * Nada de datos personales en auditoría, logs ni mensajes de error.
 * Estas funciones producen resúmenes seguros de guardar.
 */

const PII_KEYS = new Set([
  'full_name', 'nombre', 'display_name', 'public_name',
  'email', 'correo', 'email_normalized',
  'phone_e164', 'whatsapp', 'telefono',
  'address_private', 'direccion',
  'pastoral_contact', 'pastors_name',
  'password', 'token', 'comments', 'motivation', 'notes',
]);

export function redact(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (PII_KEYS.has(k)) {
      out[k] = v === null || v === undefined || v === '' ? null : '[redactado]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function summary(input: Record<string, unknown>): string {
  return JSON.stringify(redact(input)).slice(0, 900);
}

/** Escapa una celda de CSV, incluida la inyección de fórmulas. */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${neutralized.replace(/"/g, '""')}"`;
}
