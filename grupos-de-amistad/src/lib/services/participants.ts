/**
 * Servicio de participantes.
 *
 * Una sola implementación, usada por dos entradas distintas:
 *   · el formulario público  (functions/api/participants/*)
 *   · la conversación        (src/lib/chat/tools.ts)
 *
 * Aquí no hay Request ni Response: solo reglas de negocio. Quien llama
 * decide cómo se ve el resultado. Así el chat no puede saltarse ninguna
 * validación que el formulario sí aplica.
 */

import type { Env } from '../env';
import { randomId, nowIso, peppered } from '../crypto';
import { audit } from '../audit';
import {
  validate, PARTICIPANT_FIELDS, normalizeEmail, normalizePhone, isFullName,
  type Errors,
} from '../validation';

export interface ParticipantInput {
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  estado?: unknown;
  municipio?: unknown;
  postal_code?: unknown;
  colonia?: unknown;
  pref_modality?: unknown;
  pref_weekdays?: unknown;
  pref_times?: unknown;
  age_range?: unknown;
  has_community?: unknown;
  community_name?: unknown;
  comments?: unknown;
  consent_privacy?: unknown;
  consent_contact?: unknown;
}

export type SaveResult =
  | { ok: true; participantId: string; returning: boolean }
  | { ok: false; code: 'validation_failed'; errors: Errors }
  | { ok: false; code: 'write_failed' };

interface Contexto {
  ip?: string;
  userAgent?: string;
  /** De dónde vino el registro. Solo para auditoría. */
  origen?: 'formulario' | 'chat';
}

function lista(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').slice(0, 14);
}

/**
 * Registra —o actualiza— a una participante.
 *
 * Deduplica por hash de correo o de teléfono. Si ya existía, se actualizan
 * sus preferencias y se devuelve su ficha: NUNCA se revela a quien llama
 * que esa persona ya estaba registrada más allá de `returning`, que solo
 * viaja al propio navegador de esa misma persona.
 */
export async function saveParticipant(
  env: Env,
  input: ParticipantInput,
  ctx: Contexto = {},
): Promise<SaveResult> {
  const errors = validate(input as Record<string, unknown>, PARTICIPANT_FIELDS);

  const fullName = String(input.full_name ?? '').trim();
  if (!errors.full_name && !isFullName(fullName)) {
    errors.full_name = 'Necesitamos tu nombre y tu apellido.';
  }

  const phone = normalizePhone(String(input.phone ?? ''));
  if (!errors.phone && !phone) {
    errors.phone = 'Escribe tu WhatsApp a 10 dígitos.';
  }

  if (input.has_community === 'si' && !String(input.community_name ?? '').trim()) {
    errors.community_name = 'Escribe el nombre de tu comunidad o de tu líder.';
  }

  // El consentimiento es condición previa, no una casilla más.
  if (input.consent_privacy !== true) {
    errors.consent_privacy = 'Necesitamos tu aceptación del aviso de privacidad para continuar.';
  }
  if (input.consent_contact !== true) {
    errors.consent_contact = 'Necesitamos tu autorización para poder contactarte.';
  }

  if (Object.keys(errors).length) {
    return { ok: false, code: 'validation_failed', errors };
  }

  const emailNorm = normalizeEmail(String(input.email));
  const emailHash = await peppered(emailNorm, env.HASH_PEPPER);
  const phoneHash = await peppered(phone!, env.HASH_PEPPER);
  const ts = nowIso();
  const ipHash = ctx.ip ? await peppered(ctx.ip, env.HASH_PEPPER) : null;
  const uaHash = await peppered(ctx.userAgent ?? '', env.HASH_PEPPER);

  const weekdays = JSON.stringify(lista(input.pref_weekdays));
  const times = JSON.stringify(lista(input.pref_times));
  const community = String(input.community_name ?? '').trim() || null;
  const comments = String(input.comments ?? '').trim() || null;

  const existing = await env.DB.prepare(
    `SELECT id FROM participants
      WHERE (email_hash = ? OR phone_hash = ?) AND archived_at IS NULL LIMIT 1`,
  ).bind(emailHash, phoneHash).first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(
      `UPDATE participants
          SET estado = ?, municipio = ?, postal_code = ?, colonia = ?,
              pref_modality = ?, pref_weekdays = ?, pref_times = ?,
              age_range = ?, has_community = ?, community_name = ?,
              comments = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(
      String(input.estado), String(input.municipio), String(input.postal_code),
      String(input.colonia), String(input.pref_modality), weekdays, times,
      String(input.age_range), String(input.has_community), community, comments,
      ts, existing.id,
    ).run();

    await audit(env, {
      actorType: 'public', action: 'participant.updated',
      entityType: 'participant', entityId: existing.id,
      after: { origen: ctx.origen ?? 'formulario' }, ip: ctx.ip,
    });

    return { ok: true, participantId: existing.id, returning: true };
  }

  const id = randomId();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO participants
          (id, full_name, email, email_normalized, email_hash, phone_e164, phone_hash,
           estado, municipio, postal_code, colonia, pref_modality, pref_weekdays, pref_times,
           age_range, has_community, community_name,
           comments, consent_version, consent_accepted_at, contact_authorized, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id, fullName, String(input.email).trim(), emailNorm, emailHash, phone, phoneHash,
        String(input.estado), String(input.municipio), String(input.postal_code),
        String(input.colonia), String(input.pref_modality), weekdays, times,
        String(input.age_range), String(input.has_community), community,
        comments, env.CONSENT_VERSION, ts, 1, ts, ts,
      ),
      env.DB.prepare(
        `INSERT INTO consents (id, subject_type, subject_id, kind, version, accepted, accepted_at, ip_hash, ua_hash)
         VALUES (?, 'participant', ?, 'privacy', ?, 1, ?, ?, ?)`,
      ).bind(randomId(), id, env.CONSENT_VERSION, ts, ipHash, uaHash),
    ]);
  } catch (e) {
    console.error('participant_write_failed', String(e).slice(0, 200));
    return { ok: false, code: 'write_failed' };
  }

  await audit(env, {
    actorType: 'public', action: 'participant.created',
    entityType: 'participant', entityId: id,
    after: { estado: input.estado, municipio: input.municipio, origen: ctx.origen ?? 'formulario' },
    ip: ctx.ip,
  });

  return { ok: true, participantId: id, returning: false };
}

/** Deja a la participante en lista de espera. Idempotente. */
export async function joinWaitlist(
  env: Env, participantId: string, ip?: string,
): Promise<{ ok: boolean; code?: 'unknown_participant' }> {
  const ts = nowIso();
  const r = await env.DB.prepare(
    `UPDATE participants SET is_waitlisted = 1, waitlisted_at = COALESCE(waitlisted_at, ?), updated_at = ?
      WHERE id = ? AND archived_at IS NULL`,
  ).bind(ts, ts, participantId).run();

  if (!r.meta.changes) return { ok: false, code: 'unknown_participant' };

  await audit(env, {
    actorType: 'public', action: 'participant.waitlisted',
    entityType: 'participant', entityId: participantId, ip,
  });
  return { ok: true };
}

/** ¿Existe y sigue activa? Se usa antes de cualquier operación en su nombre. */
export async function participantExists(env: Env, id: string): Promise<boolean> {
  if (!id) return false;
  const row = await env.DB.prepare(
    `SELECT id FROM participants WHERE id = ? AND archived_at IS NULL`,
  ).bind(id).first<{ id: string }>();
  return !!row;
}
