/**
 * Círculos de amigas.
 *
 * El camino principal: una mujer decide abrir su propio círculo y se
 * registra. Siete campos, dos de ellos opcionales, y ninguna logística.
 *
 * Qué NO hace este servicio, a propósito:
 *   · no publica nada
 *   · no pide dirección, cupo, día ni horario
 *   · no pasa por aprobación administrativa ni pastoral
 *
 * Todo eso sigue existiendo en `groups.ts` y en `group_applications`,
 * para cuando haga falta publicar círculos y que otras los encuentren.
 * Hoy ese camino está aparcado.
 *
 * Lo que sí hace, porque es lo que el equipo va a necesitar desde el
 * primer día: guardar de qué iglesia y de qué ciudad viene cada
 * registro, agrupado de forma que se pueda contar aunque cada quien lo
 * escriba distinto, y levantar un aviso cuando una misma iglesia junta
 * varios círculos.
 */

import type { Env } from '../env';
import { randomId, nowIso, peppered } from '../crypto';
import { audit } from '../audit';
import {
  validate, normalizeEmail, normalizePhone, isFullName, RE,
  type Errors, type Field,
} from '../validation';

/** A partir de cuántos círculos de una misma iglesia se levanta el aviso. */
export const UMBRALES_AVISO = [3, 5, 10, 25, 50];

export const CIRCLE_FIELDS: Field[] = [
  { key: 'full_name',   label: 'Tu nombre',  required: true, min: 5, max: 120, pattern: RE.name,
    message: 'Escribe tu nombre y tu apellido.' },
  { key: 'email',       label: 'Correo',     required: true, max: 160, pattern: RE.email,
    message: 'Escribe un correo con este formato: tu@correo.com' },
  { key: 'phone',       label: 'WhatsApp',   required: true },
  { key: 'church_name', label: 'Iglesia',    required: true, min: 2, max: 120 },
  { key: 'city',        label: 'Ciudad o zona', required: true, min: 2, max: 90 },
  { key: 'circle_name', label: 'Nombre del círculo', max: 80 },
];

export interface CircleInput {
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  church_name?: unknown;
  city?: unknown;
  circle_name?: unknown;
  approx_size?: unknown;
  consent_privacy?: unknown;
  consent_contact?: unknown;
}

export type OpenResult =
  | { ok: true; circleId: string; folio: string; returning: boolean }
  | { ok: false; code: 'validation_failed'; errors: Errors }
  | { ok: false; code: 'write_failed' };

interface Contexto {
  ip?: string;
  userAgent?: string;
  origen?: 'formulario' | 'chat';
}

/**
 * Reduce un nombre a algo comparable.
 *
 * «Iglesia RÍO San Diego», «rio san diego» e «IGLESIA RIO SAN DIEGO»
 * tienen que contar como la misma. Se quitan acentos, mayúsculas,
 * puntuación y las palabras que no distinguen nada.
 */
const VACIAS = new Set([
  'iglesia', 'iglesias', 'ministerio', 'ministerios', 'centro', 'cristiano',
  'cristiana', 'comunidad', 'templo', 'la', 'el', 'los', 'las', 'de', 'del',
  'y', 'en',
]);

export function clave(v: string): string {
  const limpio = v
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !VACIAS.has(p));
  /* Si al quitar las palabras vacías no queda nada —una iglesia que se
     llame sólo «La Comunidad»— se conserva el original normalizado, que
     es mejor que una clave en blanco. */
  if (!limpio.length) {
    return v.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9ñ]/g, '');
  }
  return limpio.sort().join('-');
}

function folioNuevo(): string {
  const n = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
  return `C-${new Date().getUTCFullYear()}-${n}`;
}

function tamano(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 200);
}

/**
 * Abre un círculo.
 *
 * Si el mismo correo vuelve a enviar el formulario, no se crea otro
 * registro: se actualiza el que ya había y se devuelve `returning`.
 * Nadie se queda con dos folios por haber pulsado dos veces.
 */
export async function openCircle(
  env: Env,
  input: CircleInput,
  ctx: Contexto = {},
): Promise<OpenResult> {
  const errors = validate(input as Record<string, unknown>, CIRCLE_FIELDS);

  const nombre = String(input.full_name ?? '').trim();
  if (!errors.full_name && !isFullName(nombre)) {
    errors.full_name = 'Escribe tu nombre y tu apellido.';
  }

  const phone = normalizePhone(String(input.phone ?? ''));
  if (!errors.phone && !phone) {
    errors.phone = 'Escribe tu WhatsApp a 10 dígitos.';
  }

  /* Sin permiso no se guarda nada. Es la única regla dura que queda. */
  if (input.consent_privacy !== true && input.consent_privacy !== 'on') {
    errors.consent_privacy = 'Necesitamos tu autorización para guardar tus datos.';
  }
  if (input.consent_contact !== true && input.consent_contact !== 'on') {
    errors.consent_contact = 'Necesitamos tu permiso para poder escribirte.';
  }

  if (Object.keys(errors).length) {
    return { ok: false, code: 'validation_failed', errors };
  }

  const emailNorm = normalizeEmail(String(input.email));
  const emailHash = await peppered(emailNorm, env.HASH_PEPPER);
  const phoneHash = await peppered(phone!, env.HASH_PEPPER);
  const ipHash = ctx.ip ? await peppered(ctx.ip, env.HASH_PEPPER) : null;
  const uaHash = await peppered(ctx.userAgent ?? '', env.HASH_PEPPER);

  const iglesia = String(input.church_name).trim();
  const ciudad = String(input.city).trim();
  const iglesiaKey = clave(iglesia);
  const ciudadKey = clave(ciudad);
  const nombreCirculo = String(input.circle_name ?? '').trim() || null;
  const aprox = tamano(input.approx_size);
  const ahora = nowIso();

  try {
    const previo = await env.DB.prepare(
      `SELECT id, folio FROM circles WHERE email_hash = ? AND archived_at IS NULL LIMIT 1`,
    ).bind(emailHash).first<{ id: string; folio: string }>();

    if (previo) {
      await env.DB.prepare(
        `UPDATE circles SET
           full_name = ?, email = ?, email_normalized = ?,
           phone_e164 = ?, phone_hash = ?,
           church_name = ?, church_key = ?, city = ?, city_key = ?,
           circle_name = COALESCE(?, circle_name),
           approx_size = COALESCE(?, approx_size),
           consent_privacy = 1, consent_contact = 1,
           updated_at = ?
         WHERE id = ?`,
      ).bind(
        nombre, String(input.email).trim(), emailNorm,
        phone, phoneHash,
        iglesia, iglesiaKey, ciudad, ciudadKey,
        nombreCirculo, aprox, ahora, previo.id,
      ).run();

      await audit(env, {
        actorType: 'public', action: 'circle.updated',
        entityType: 'circle', entityId: previo.id,
        after: { origen: ctx.origen ?? 'formulario', church_key: iglesiaKey },
        ip: ctx.ip,
      });

      await revisarAviso(env, iglesiaKey, iglesia);
      return { ok: true, circleId: previo.id, folio: previo.folio, returning: true };
    }

    const id = randomId();
    const folio = folioNuevo();

    await env.DB.prepare(
      `INSERT INTO circles
         (id, folio, idempotency_key, full_name, email, email_normalized, email_hash,
          phone_e164, phone_hash, church_name, church_key, city, city_key,
          circle_name, approx_size, consent_version, consent_privacy, consent_contact,
          source, ip_hash, user_agent_hash, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?,?,?,?)`,
    ).bind(
      id, folio, `${emailHash}:${ahora.slice(0, 10)}`,
      nombre, String(input.email).trim(), emailNorm, emailHash,
      phone, phoneHash,
      iglesia, iglesiaKey, ciudad, ciudadKey,
      nombreCirculo, aprox,
      env.CONSENT_VERSION ?? '1',
      ctx.origen ?? 'formulario', ipHash, uaHash, ahora, ahora,
    ).run();

    await audit(env, {
      actorType: 'public', action: 'circle.created',
      entityType: 'circle', entityId: id,
      after: { origen: ctx.origen ?? 'formulario', church_key: iglesiaKey, city_key: ciudadKey },
      ip: ctx.ip,
    });

    await revisarAviso(env, iglesiaKey, iglesia);
    return { ok: true, circleId: id, folio, returning: false };
  } catch {
    return { ok: false, code: 'write_failed' };
  }
}

/**
 * Levanta el aviso cuando una iglesia cruza uno de los umbrales.
 *
 * No manda nada: deja la fila en `church_alerts` para que el panel la
 * muestre y, cuando haya proveedor de correo, el envío la recoja. El
 * índice único sobre (church_key, threshold) hace que un mismo umbral
 * no se avise dos veces, aunque esta función se llame en cada registro.
 */
async function revisarAviso(env: Env, churchKey: string, churchName: string): Promise<void> {
  try {
    const fila = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM circles WHERE church_key = ? AND archived_at IS NULL`,
    ).bind(churchKey).first<{ n: number }>();

    const n = fila?.n ?? 0;
    const umbral = [...UMBRALES_AVISO].reverse().find((u) => n >= u);
    if (!umbral) return;

    await env.DB.prepare(
      `INSERT OR IGNORE INTO church_alerts
         (id, church_key, church_name, circles_count, threshold, status, created_at)
       VALUES (?,?,?,?,?, 'PENDING', ?)`,
    ).bind(randomId(), churchKey, churchName, n, umbral, nowIso()).run();
  } catch {
    /* Un aviso que no se pudo levantar no puede tumbar un registro que
       sí se guardó. Se ignora y se recalcula en el siguiente. */
  }
}

/* ── Lo que el panel necesita saber ──────────────────────────────── */

export interface Resumen {
  total: number;
  hoy: number;
  semana: number;
  porIglesia: Array<{ iglesia: string; clave: string; n: number; ciudades: number }>;
  porCiudad: Array<{ ciudad: string; n: number }>;
  avisos: Array<{ id: string; iglesia: string; n: number; umbral: number; desde: string }>;
  sinSeguimiento: number;
}

export async function resumenCirculos(env: Env): Promise<Resumen> {
  const hoy = nowIso().slice(0, 10);
  const hace7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

  const [tot, dia, sem, igl, ciu, avi, pend] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM circles WHERE archived_at IS NULL`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM circles WHERE archived_at IS NULL AND created_at >= ?`).bind(hoy).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM circles WHERE archived_at IS NULL AND created_at >= ?`).bind(hace7).first<{ n: number }>(),
    env.DB.prepare(
      `SELECT church_name AS iglesia, church_key AS clave, COUNT(*) AS n,
              COUNT(DISTINCT city_key) AS ciudades
         FROM circles WHERE archived_at IS NULL
        GROUP BY church_key ORDER BY n DESC, iglesia LIMIT 100`).all(),
    env.DB.prepare(
      `SELECT city AS ciudad, COUNT(*) AS n
         FROM circles WHERE archived_at IS NULL
        GROUP BY city_key ORDER BY n DESC, ciudad LIMIT 100`).all(),
    env.DB.prepare(
      `SELECT id, church_name AS iglesia, circles_count AS n, threshold AS umbral, created_at AS desde
         FROM church_alerts WHERE status = 'PENDING' ORDER BY created_at DESC LIMIT 50`).all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM circles WHERE archived_at IS NULL AND followed_up_at IS NULL`).first<{ n: number }>(),
  ]);

  return {
    total: tot?.n ?? 0,
    hoy: dia?.n ?? 0,
    semana: sem?.n ?? 0,
    porIglesia: (igl.results ?? []) as Resumen['porIglesia'],
    porCiudad: (ciu.results ?? []) as Resumen['porCiudad'],
    avisos: (avi.results ?? []) as Resumen['avisos'],
    sinSeguimiento: pend?.n ?? 0,
  };
}
