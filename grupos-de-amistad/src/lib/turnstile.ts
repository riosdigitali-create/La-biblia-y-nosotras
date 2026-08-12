import type { Env } from './env';

/**
 * Verificación de Turnstile en servidor.
 * Si no hay clave configurada, se rechaza en producción y se
 * permite solo en desarrollo local — nunca se finge que pasó.
 */
export async function verifyTurnstile(env: Env, token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    // Sin clave configurada no hay protección. Se registra y se bloquea.
    console.warn('TURNSTILE_SECRET_KEY no configurado — petición rechazada.');
    return false;
  }
  if (!token) return false;

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
