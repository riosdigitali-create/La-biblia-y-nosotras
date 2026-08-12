import type { Env } from './env';
import { nowIso } from './crypto';

/**
 * Toma un candado por clave. Devuelve false si ya estaba tomado.
 * Se apoya en la restricción PRIMARY KEY de D1: la carrera la
 * resuelve la base, no la aplicación.
 */
export async function acquireLock(env: Env, jobKey: string, by = 'worker'): Promise<boolean> {
  try {
    await env.DB.prepare(
      `INSERT INTO job_locks (job_key, locked_at, locked_by) VALUES (?,?,?)`,
    ).bind(jobKey, nowIso(), by).run();
    return true;
  } catch {
    return false;
  }
}

export async function completeLock(env: Env, jobKey: string): Promise<void> {
  await env.DB.prepare(`UPDATE job_locks SET completed_at = ? WHERE job_key = ?`)
    .bind(nowIso(), jobKey).run();
}

/** Folio legible y estable: LBYN-AAAAMM-XXXX */
export function makeFolio(seedHex: string): string {
  const d = new Date();
  const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `LBYN-${ym}-${seedHex.slice(0, 4).toUpperCase()}`;
}
