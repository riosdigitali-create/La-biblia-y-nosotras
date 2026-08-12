import type { Env } from '../lib/env';
import { randomId, nowIso, peppered } from '../lib/crypto';
import { acquireLock, completeLock } from '../lib/idempotency';
import { getEmailProvider } from '../lib/email/provider';
import { TEMPLATES, type TemplateKey } from '../lib/templates';

interface Job {
  type: string;
  jobKey: string;
  applicationId?: string;
  groupId?: string;
  joinRequestId?: string;
  token?: string;
  decision?: string;
}

/**
 * Consumidor de la cola.
 *
 * Idempotente por diseño: cada trabajo toma un candado en job_locks
 * (PRIMARY KEY). Si el candado ya existe, el trabajo se descarta sin
 * reenviar. Un reintento de la cola nunca produce un segundo envío.
 *
 * Si el proveedor de correo no está configurado, la entrega se registra
 * como SKIPPED. No se finge que se envió.
 */
export async function handleQueue(batch: MessageBatch<Job>, env: Env): Promise<void> {
  const email = getEmailProvider(env);

  for (const message of batch.messages) {
    const job = message.body;
    try {
      const got = await acquireLock(env, job.jobKey, 'queue');
      if (!got) { message.ack(); continue; }

      const plan = await resolveRecipients(env, job);

      for (const target of plan) {
        const deliveryId = randomId();
        const recipientHash = await peppered(target.to, env.HASH_PEPPER);
        const tpl = TEMPLATES[target.template];
        const body = tpl.build(target.vars);

        const result = email.enabled
          ? await email.send({ to: target.to, subject: body.subject, text: body.text })
          : { ok: false, code: 'email_provider_not_configured' };

        await env.DB.prepare(
          `INSERT INTO message_deliveries
             (id, job_key, channel, template, recipient_hash, related_type, related_id,
              status, attempts, last_error_code, created_at, sent_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          deliveryId, `${job.jobKey}:${deliveryId}`, 'email', target.template,
          recipientHash, target.relatedType, target.relatedId,
          result.ok ? 'SENT' : (email.enabled ? 'FAILED' : 'SKIPPED'),
          1, result.ok ? null : (result.code ?? null),
          nowIso(), result.ok ? nowIso() : null,
        ).run();
      }

      await completeLock(env, job.jobKey);
      message.ack();
    } catch (e) {
      console.error('queue_job_failed', job.type, String(e).slice(0, 200));
      message.retry();
    }
  }
}

interface Target {
  to: string;
  template: TemplateKey;
  vars: Record<string, string>;
  relatedType: string;
  relatedId: string;
}

async function resolveRecipients(env: Env, job: Job): Promise<Target[]> {
  switch (job.type) {
    case 'application.confirmation': {
      const r = await env.DB.prepare(
        `SELECT ga.folio, l.email, l.full_name
           FROM group_applications ga JOIN leaders l ON l.id = ga.leader_id
          WHERE ga.id = ?`,
      ).bind(job.applicationId).first<{ folio: string; email: string; full_name: string }>();
      if (!r) return [];
      return [{
        to: r.email, template: 'application_received',
        vars: { nombre: r.full_name.split(/\s+/)[0] ?? '', folio: r.folio },
        relatedType: 'group_application', relatedId: job.applicationId!,
      }];
    }

    case 'pastoral.send_link': {
      const r = await env.DB.prepare(
        `SELECT l.pastoral_contact, l.pastors_name, l.full_name
           FROM group_applications ga JOIN leaders l ON l.id = ga.leader_id
          WHERE ga.id = ?`,
      ).bind(job.applicationId).first<{ pastoral_contact: string; pastors_name: string; full_name: string }>();
      if (!r?.pastoral_contact || !job.token) return [];
      return [{
        to: r.pastoral_contact, template: 'pastoral_request',
        vars: {
          pastores: r.pastors_name ?? '',
          lider: r.full_name,
          enlace: `${env.APP_ORIGIN}/aprobacion/?t=${job.token}`,
        },
        relatedType: 'group_application', relatedId: job.applicationId!,
      }];
    }

    case 'application.corrections': {
      const r = await env.DB.prepare(
        `SELECT ga.folio, ga.review_notes, l.email, l.full_name
           FROM group_applications ga JOIN leaders l ON l.id = ga.leader_id
          WHERE ga.id = ?`,
      ).bind(job.applicationId).first<{ folio: string; review_notes: string; email: string; full_name: string }>();
      if (!r) return [];
      return [{
        to: r.email, template: 'corrections_requested',
        vars: { nombre: r.full_name.split(/\s+/)[0] ?? '', folio: r.folio, notas: r.review_notes ?? '' },
        relatedType: 'group_application', relatedId: job.applicationId!,
      }];
    }

    case 'group.published': {
      const r = await env.DB.prepare(
        `SELECT l.email, l.full_name FROM groups g JOIN leaders l ON l.id = g.leader_id WHERE g.id = ?`,
      ).bind(job.groupId).first<{ email: string; full_name: string }>();
      if (!r) return [];
      return [{
        to: r.email, template: 'group_published',
        vars: { nombre: r.full_name.split(/\s+/)[0] ?? '' },
        relatedType: 'group', relatedId: job.groupId!,
      }];
    }

    case 'join.notify_leader': {
      // A la líder NUNCA se le manda el domicilio de la participante,
      // ni a la participante el de la líder.
      const r = await env.DB.prepare(
        `SELECT l.email, l.full_name, p.full_name AS participante
           FROM group_join_requests r
           JOIN groups g       ON g.id = r.group_id
           JOIN leaders l      ON l.id = g.leader_id
           JOIN participants p ON p.id = r.participant_id
          WHERE r.id = ?`,
      ).bind(job.joinRequestId).first<{ email: string; full_name: string; participante: string }>();
      if (!r) return [];
      return [{
        to: r.email, template: 'join_request',
        vars: { nombre: r.full_name.split(/\s+/)[0] ?? '', participante: r.participante },
        relatedType: 'group_join_request', relatedId: job.joinRequestId!,
      }];
    }

    default:
      return [];
  }
}
