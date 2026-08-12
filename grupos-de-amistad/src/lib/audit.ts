import type { Env } from './env';
import { randomId, nowIso, peppered } from './crypto';
import { summary } from './redact';
import type { ActorType } from './states';

export async function audit(
  env: Env,
  opts: {
    actorType: ActorType;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    ip?: string;
  },
): Promise<void> {
  const ipHash = opts.ip ? await peppered(opts.ip, env.HASH_PEPPER) : null;
  await env.DB.prepare(
    `INSERT INTO audit_logs
       (id, actor_type, actor_id, action, entity_type, entity_id,
        before_summary, after_summary, ip_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    randomId(), opts.actorType, opts.actorId ?? null, opts.action,
    opts.entityType, opts.entityId,
    opts.before ? summary(opts.before) : null,
    opts.after ? summary(opts.after) : null,
    ipHash, nowIso(),
  ).run();
}
