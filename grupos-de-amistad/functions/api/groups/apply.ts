import type { Env } from '../../../src/lib/env';
import { json, fail, ok, sameOrigin, clientIp, methodNotAllowed } from '../../../src/lib/http';
import { randomId, nowIso, peppered } from '../../../src/lib/crypto';
import { makeFolio } from '../../../src/lib/idempotency';
import { verifyTurnstile } from '../../../src/lib/turnstile';
import { audit } from '../../../src/lib/audit';
import {
  validate, LEADER_FIELDS, normalizeEmail, normalizePhone, isFullName,
} from '../../../src/lib/validation';

/**
 * POST /api/groups/apply
 *
 * Orden estricto:
 *   Turnstile → validación → ESCRITURA EN D1 (transacción) → responde folio
 *   → solo después encola el correo.
 *
 * Nunca se responde éxito antes de que D1 confirme.
 * El estado inicial es SIEMPRE 'PENDING_REVIEW'. Nada se publica aquí.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!sameOrigin(request, env.APP_ORIGIN)) return fail('bad_origin', 'Origen no permitido.', 403);

  const ip = clientIp(request);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad_json', 'No pudimos leer los datos enviados.');
  }

  // 1 · Turnstile
  const passed = await verifyTurnstile(env, body.turnstile_token as string | undefined, ip);
  if (!passed) return fail('turnstile_failed', 'No pudimos verificar que eres una persona. Vuelve a intentarlo.', 403);

  // 2 · Validación
  const errors = validate(body, LEADER_FIELDS);

  const fullName = String(body.full_name ?? '').trim();
  if (!errors.full_name && !isFullName(fullName)) {
    errors.full_name = 'Escribe tu nombre y tu apellido.';
  }

  const phone = normalizePhone(String(body.phone ?? ''));
  if (!errors.phone && !phone) {
    errors.phone = 'Escribe tu WhatsApp a 10 dígitos, por ejemplo 55 1234 5678.';
  }

  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 200) {
    errors.capacity = 'Escribe cuántas mujeres caben, entre 2 y 200.';
  }

  if (body.modality === 'presencial' && !String(body.address_private ?? '').trim()) {
    errors.address_private = 'Necesitamos la dirección para uso interno de un grupo presencial.';
  }

  if (body.church_type !== 'sin_iglesia') {
    if (!String(body.church_name ?? '').trim()) errors.church_name = 'Escribe el nombre de tu iglesia.';
    if (!String(body.pastors_name ?? '').trim()) errors.pastors_name = 'Escribe el nombre de tus pastores.';
    if (!String(body.pastoral_contact ?? '').trim()) {
      errors.pastoral_contact = 'Necesitamos un correo o teléfono para pedir la confirmación pastoral.';
    }
  }

  // Consentimientos: nunca preseleccionados, siempre explícitos.
  if (body.consent_contact !== true) errors.consent_contact = 'Necesitamos tu autorización para poder escribirte.';
  if (body.consent_privacy !== true) errors.consent_privacy = 'Necesitamos tu aceptación del aviso de privacidad para continuar.';
  if (body.consent_agreement !== true) errors.consent_agreement = 'Necesitamos tu aceptación del acuerdo de líderes para continuar.';
  if (body.church_type !== 'sin_iglesia' && body.consent_pastoral !== true) {
    errors.consent_pastoral = 'Necesitamos tu autorización para contactar a tus pastores.';
  }

  if (Object.keys(errors).length > 0) {
    return fail('validation_failed', 'Revisa los campos marcados.', 422, errors);
  }

  // 3 · Idempotencia
  const emailNorm = normalizeEmail(String(body.email));
  const emailHash = await peppered(emailNorm, env.HASH_PEPPER);
  const phoneHash = await peppered(phone!, env.HASH_PEPPER);
  const idemHeader = request.headers.get('Idempotency-Key');
  const idempotencyKey = idemHeader
    ? await peppered(idemHeader, env.HASH_PEPPER)
    : await peppered(`${emailHash}:${phoneHash}:${body.postal_code}:${body.weekday}:${body.time_start}`, env.HASH_PEPPER);

  const existing = await env.DB.prepare(
    `SELECT folio, status FROM group_applications WHERE idempotency_key = ?`,
  ).bind(idempotencyKey).first<{ folio: string; status: string }>();

  if (existing) {
    // Reenvío del mismo formulario: se devuelve el mismo folio, no se duplica.
    return ok({ folio: existing.folio, status: existing.status, duplicate: true });
  }

  // 4 · Escritura transaccional
  const leaderId = randomId();
  const appId = randomId();
  const folio = makeFolio(appId);
  const ts = nowIso();
  const ipHash = ip ? await peppered(ip, env.HASH_PEPPER) : null;
  const uaHash = await peppered(request.headers.get('User-Agent') ?? '', env.HASH_PEPPER);
  const publicNameAuthorized = body.consent_public_name === true ? 1 : 0;

  const consentRow = (kind: string, accepted: boolean, version: string) =>
    env.DB.prepare(
      `INSERT INTO consents (id, subject_type, subject_id, kind, version, accepted, accepted_at, ip_hash, ua_hash)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(randomId(), 'leader', leaderId, kind, version, accepted ? 1 : 0, ts, ipHash, uaHash);

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO leaders
          (id, full_name, public_name, public_name_authorized, email, email_normalized, email_hash,
           phone_e164, phone_hash, church_type, church_name, pastors_name, pastoral_contact,
           created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        leaderId, fullName,
        publicNameAuthorized ? (fullName.split(/\s+/)[0] ?? null) : null,
        publicNameAuthorized,
        String(body.email).trim(), emailNorm, emailHash,
        phone, phoneHash,
        String(body.church_type),
        (body.church_name as string) ?? null,
        (body.pastors_name as string) ?? null,
        (body.pastoral_contact as string) ?? null,
        ts, ts,
      ),
      env.DB.prepare(
        `INSERT INTO group_applications
          (id, folio, idempotency_key, leader_id, status,
           estado, municipio, postal_code, colonia, zone_public, address_private, modality,
           weekday, time_start, capacity, group_name, motivation, comments,
           consent_version, consent_accepted_at, agreement_version, pastoral_contact_authorized,
           submitted_ip_hash, submitted_ua_hash, created_at, updated_at)
         VALUES (?,?,?,?, 'PENDING_REVIEW', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        appId, folio, idempotencyKey, leaderId,
        String(body.estado), String(body.municipio), String(body.postal_code),
        String(body.colonia), String(body.zone_public),
        (body.address_private as string) ?? null, String(body.modality),
        String(body.weekday), String(body.time_start), capacity,
        (body.group_name as string) ?? null,
        String(body.motivation), (body.comments as string) ?? null,
        env.CONSENT_VERSION, ts, env.AGREEMENT_VERSION,
        body.consent_pastoral === true ? 1 : 0,
        ipHash, uaHash, ts, ts,
      ),
      consentRow('privacy', true, env.CONSENT_VERSION),
      consentRow('contact', true, env.CONSENT_VERSION),
      consentRow('agreement', true, env.AGREEMENT_VERSION),
      consentRow('pastoral_contact', body.consent_pastoral === true, env.CONSENT_VERSION),
    ]);
  } catch (e) {
    console.error('apply_write_failed', String(e).slice(0, 200));
    return fail('write_failed', 'No pudimos guardar tu solicitud. Vuelve a intentarlo en un momento.', 500);
  }

  // D1 confirmó. Ahora sí es un éxito.
  await audit(env, {
    actorType: 'public', action: 'application.created',
    entityType: 'group_application', entityId: appId,
    after: { folio, status: 'PENDING_REVIEW', estado: body.estado, municipio: body.municipio },
    ip,
  });

  // 5 · Trabajo diferido. Si la cola falla, la solicitud YA está guardada.
  try {
    await env.JOBS?.send({
      type: 'application.confirmation',
      applicationId: appId,
      jobKey: `confirm:${appId}`,
    });
  } catch (e) {
    console.warn('queue_send_failed', String(e).slice(0, 120));
  }

  return json({ ok: true, folio, status: 'PENDING_REVIEW' }, 201);
};
