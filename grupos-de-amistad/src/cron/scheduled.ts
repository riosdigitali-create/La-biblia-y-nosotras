import type { Env } from '../lib/env';
import { nowIso } from '../lib/crypto';
import { acquireLock, completeLock } from '../lib/idempotency';
import { purgeExpired } from '../lib/chat/session';

/**
 * Un solo Cron para toda la casa.
 * El plan Free permite 5 disparadores por cuenta; usamos uno y
 * despachamos internamente.
 *
 * Cada tarea toma su propio candado, así que dos ejecuciones
 * solapadas no producen trabajo duplicado.
 */
export async function handleScheduled(_event: ScheduledController, env: Env): Promise<void> {
  await publishScheduledMaterials(env);
  await purgeExpiredTokens(env);
  await expireStaleSessions(env);
  // Las conversaciones caducadas se borran: no se retienen indefinidamente.
  await purgeExpired(env);
}

/** Marca la publicación de forma atómica ANTES de encolar los envíos. */
async function publishScheduledMaterials(env: Env): Promise<void> {
  const due = await env.DB.prepare(
    `SELECT id, week_number, audience FROM materials
      WHERE status = 'SCHEDULED' AND scheduled_at IS NOT NULL AND scheduled_at <= ?`,
  ).bind(nowIso()).all<{ id: string; week_number: number; audience: string }>();

  for (const m of due.results ?? []) {
    const key = `material_publish:${m.id}`;
    if (!(await acquireLock(env, key, 'cron'))) continue;

    const r = await env.DB.prepare(
      `UPDATE materials SET status = 'PUBLISHED', published_at = ?, updated_at = ?
        WHERE id = ? AND status = 'SCHEDULED'`,
    ).bind(nowIso(), nowIso(), m.id).run();

    if (!r.meta.changes) { await completeLock(env, key); continue; }

    try {
      await env.JOBS?.send({ type: 'material.published', materialId: m.id, jobKey: `matsend:${m.id}` });
    } catch (e) {
      console.warn('queue_send_failed', String(e).slice(0, 120));
    }
    await completeLock(env, key);
  }
}

async function purgeExpiredTokens(env: Env): Promise<void> {
  await env.DB.prepare(
    `UPDATE pastoral_approvals SET revoked_at = ?
      WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at <= ?`,
  ).bind(nowIso(), nowIso()).run();
}

async function expireStaleSessions(env: Env): Promise<void> {
  await env.DB.prepare(
    `UPDATE admin_sessions SET revoked_at = ?
      WHERE revoked_at IS NULL AND expires_at <= ?`,
  ).bind(nowIso(), nowIso()).run();
}
