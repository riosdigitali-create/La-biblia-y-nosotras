/**
 * Primitivas criptográficas.
 *
 * NOTA SOBRE EL PLAN FREE DE CLOUDFLARE (verificado 2026-08-05):
 * el límite es 10 ms de CPU por invocación. Un PBKDF2 con las
 * iteraciones que recomienda OWASP (600 000) excede ese presupuesto
 * por mucho. Por eso:
 *
 *   1. El camino recomendado para /panel es Cloudflare Access
 *      (ADMIN_AUTH_MODE = "access"): sin contraseña, sin hash, gratis
 *      hasta 50 usuarias, y más fuerte que cualquier clave compartida.
 *
 *   2. Si se usa contraseña, PBKDF2_ITERATIONS se queda en un valor
 *      que cabe en el presupuesto de CPU, y la defensa real pasa a ser
 *      el bloqueo por intentos + Turnstile + una contraseña larga
 *      obligatoria en el primer acceso (must_change_password).
 *
 * Esto está documentado a propósito. No se disimula.
 */

export const PBKDF2_ITERATIONS = 25_000;
export const PBKDF2_HASH = 'SHA-256';

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomId(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Token aleatorio criptográficamente seguro, apto para URLs. */
export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Hash con pimienta, para deduplicación y para guardar tokens. Nunca reversible. */
export async function peppered(value: string, pepper: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${pepper}:${value}`));
  return toHex(digest);
}

export async function hashPassword(
  password: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: PBKDF2_HASH },
    key,
    256,
  );
  return toHex(bits);
}

/** Comparación en tiempo constante. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
}

/** Autorización breve para unir a la participante recién registrada. */
export async function createJoinAuthorization(
  participantId: string,
  secret: string,
  ttlMs = 30 * 60 * 1000,
): Promise<string> {
  const payload = `${participantId}.${Date.now() + ttlMs}`;
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifyJoinAuthorization(
  token: string,
  participantId: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tokenParticipant, expiresRaw, receivedSignature] = parts;
  if (!tokenParticipant || !expiresRaw || !receivedSignature) return false;
  if (tokenParticipant !== participantId) return false;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires <= Date.now()) return false;

  const payload = `${tokenParticipant}.${expiresRaw}`;
  const expectedSignature = await hmac(payload, secret);
  return timingSafeEqual(receivedSignature, expectedSignature);
}

export const nowIso = (): string => new Date().toISOString();

export function isoPlus(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function isExpired(iso: string | null | undefined): boolean {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now();
}
