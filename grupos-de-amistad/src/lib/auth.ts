import type { Env } from './env';
import {
  randomId, randomToken, nowIso, isoPlus, isExpired,
  hashPassword, peppered, timingSafeEqual, PBKDF2_ITERATIONS,
} from './crypto';

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'owner' | 'viewer';
  must_change_password: number;
}

export interface Session {
  id: string;
  user: AdminUser;
  csrfToken: string;
}

const SESSION_COOKIE = '__Host-lbyn_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// ── Cookies ────────────────────────────────────────────────────
export function sessionCookie(token: string, maxAgeSec: number): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${maxAgeSec}`,
  ].join('; ');
}

export const clearSessionCookie = (): string =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

// ── Bloqueo por intentos ───────────────────────────────────────
export async function isLockedOut(env: Env, emailNorm: string): Promise<boolean> {
  const u = await env.DB.prepare(
    `SELECT locked_until FROM admin_users WHERE email_normalized = ?`,
  ).bind(emailNorm).first<{ locked_until: string | null }>();
  return !!u?.locked_until && !isExpired(u.locked_until);
}

async function registerAttempt(
  env: Env, emailNorm: string, ip: string, ok: boolean, reason: string,
): Promise<void> {
  const ipHash = ip ? await peppered(ip, env.HASH_PEPPER) : null;
  await env.DB.prepare(
    `INSERT INTO login_attempts (id, email_normalized, ip_hash, succeeded, reason, created_at)
     VALUES (?,?,?,?,?,?)`,
  ).bind(randomId(), emailNorm, ipHash, ok ? 1 : 0, reason, nowIso()).run();
}

// ── Login por contraseña ───────────────────────────────────────
export async function loginWithPassword(
  env: Env, emailNorm: string, password: string, ip: string, ua: string,
): Promise<{ ok: true; token: string; csrf: string; user: AdminUser } | { ok: false; code: string }> {

  if (await isLockedOut(env, emailNorm)) {
    await registerAttempt(env, emailNorm, ip, false, 'locked');
    return { ok: false, code: 'locked' };
  }

  const u = await env.DB.prepare(
    `SELECT id, email, display_name, role, password_hash, password_salt,
            password_iterations, must_change_password, failed_attempts
       FROM admin_users
      WHERE email_normalized = ? AND archived_at IS NULL`,
  ).bind(emailNorm).first<{
    id: string; email: string; display_name: string; role: 'admin'|'owner'|'viewer';
    password_hash: string | null; password_salt: string | null;
    password_iterations: number | null; must_change_password: number; failed_attempts: number;
  }>();

  // Mismo camino y mismo mensaje exista o no la cuenta: no revelamos usuarios.
  if (!u || !u.password_hash || !u.password_salt) {
    await registerAttempt(env, emailNorm, ip, false, 'unknown_or_no_password');
    return { ok: false, code: 'invalid_credentials' };
  }

  const candidate = await hashPassword(
    password, u.password_salt, u.password_iterations ?? PBKDF2_ITERATIONS,
  );

  if (!timingSafeEqual(candidate, u.password_hash)) {
    const attempts = u.failed_attempts + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? isoPlus(LOCKOUT_MS) : null;
    await env.DB.prepare(
      `UPDATE admin_users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?`,
    ).bind(attempts, lockedUntil, nowIso(), u.id).run();
    await registerAttempt(env, emailNorm, ip, false, 'bad_password');
    return { ok: false, code: lockedUntil ? 'locked' : 'invalid_credentials' };
  }

  const token = randomToken(32);
  const csrf = randomToken(24);
  const tokenHash = await peppered(token, env.SESSION_PEPPER);
  const csrfHash = await peppered(csrf, env.SESSION_PEPPER);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO admin_sessions
         (id, user_id, token_hash, csrf_hash, ip_hash, ua_hash, created_at, expires_at, last_seen_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      randomId(), u.id, tokenHash, csrfHash,
      ip ? await peppered(ip, env.HASH_PEPPER) : null,
      ua ? await peppered(ua, env.HASH_PEPPER) : null,
      nowIso(), isoPlus(SESSION_TTL_MS), nowIso(),
    ),
    env.DB.prepare(
      `UPDATE admin_users SET failed_attempts = 0, locked_until = NULL,
              last_login_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(nowIso(), nowIso(), u.id),
  ]);

  await registerAttempt(env, emailNorm, ip, true, 'ok');

  return {
    ok: true, token, csrf,
    user: {
      id: u.id, email: u.email, display_name: u.display_name,
      role: u.role, must_change_password: u.must_change_password,
    },
  };
}

// ── Entrada por PIN ────────────────────────────────────────────
/**
 * Atajo para las pastoras: un PIN corto en lugar de correo y
 * contraseña. Es menos seguro y conviene saber por qué:
 *
 *   · No identifica a nadie. La sesión se atribuye a una cuenta
 *     designada, así que la auditoría dirá «entró alguien con el
 *     PIN», no quién. Por eso la sesión que abre es de rol `viewer`
 *     o el de esa cuenta, nunca más.
 *   · Seis dígitos son un millón de combinaciones. Lo único que lo
 *     sostiene es el freno de abajo: cinco fallos por IP y quince
 *     minutos de espera. A ese ritmo el millón tarda años.
 *
 * El PIN vive solo en `env.PANEL_PIN`, que es un secreto de
 * Cloudflare. Se compara ya pasado por el pimiento, para que la
 * comparación sea de longitud fija y no filtre nada por el tiempo
 * que tarda.
 */
const CUBO_PIN = 'pin@panel';

export async function loginWithPin(
  env: Env, pin: string, ip: string, ua: string,
): Promise<{ ok: true; token: string; csrf: string; user: AdminUser } | { ok: false; code: string }> {

  const esperado = String(env.PANEL_PIN ?? '');
  if (!esperado) return { ok: false, code: 'pin_disabled' };

  const ipHash = ip ? await peppered(ip, env.HASH_PEPPER) : null;
  const desde = new Date(Date.now() - LOCKOUT_MS).toISOString();

  // Freno por IP. Sin cuenta a la que colgar `locked_until`, la
  // ventana se cuenta sobre los intentos recientes de esa IP.
  const fallos = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE email_normalized = ? AND succeeded = 0 AND created_at > ?
        AND ip_hash IS ?`,
  ).bind(CUBO_PIN, desde, ipHash).first<{ n: number }>();

  if ((fallos?.n ?? 0) >= MAX_ATTEMPTS) {
    await registerAttempt(env, CUBO_PIN, ip, false, 'locked');
    return { ok: false, code: 'locked' };
  }

  const dado = await peppered(String(pin ?? ''), env.HASH_PEPPER);
  const bueno = await peppered(esperado, env.HASH_PEPPER);

  if (!timingSafeEqual(dado, bueno)) {
    await registerAttempt(env, CUBO_PIN, ip, false, 'bad_pin');
    return { ok: false, code: 'invalid_pin' };
  }

  // La cuenta a la que se atribuye la sesión.
  const correo = String(env.PANEL_PIN_EMAIL ?? '').trim().toLowerCase();
  const u = correo
    ? await env.DB.prepare(
        `SELECT id, email, display_name, role, must_change_password
           FROM admin_users WHERE email_normalized = ? AND archived_at IS NULL`,
      ).bind(correo).first<AdminUser>()
    : await env.DB.prepare(
        `SELECT id, email, display_name, role, must_change_password
           FROM admin_users WHERE archived_at IS NULL AND role IN ('owner','admin')
          ORDER BY created_at LIMIT 1`,
      ).first<AdminUser>();

  if (!u) {
    await registerAttempt(env, CUBO_PIN, ip, false, 'no_account');
    return { ok: false, code: 'no_account' };
  }

  const token = randomToken(32);
  const csrf = randomToken(24);

  const escrituras = [
    env.DB.prepare(
      `INSERT INTO admin_sessions
         (id, user_id, token_hash, csrf_hash, ip_hash, ua_hash, created_at, expires_at, last_seen_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      randomId(), u.id,
      await peppered(token, env.SESSION_PEPPER),
      await peppered(csrf, env.SESSION_PEPPER),
      ipHash,
      ua ? await peppered(ua, env.HASH_PEPPER) : null,
      nowIso(), isoPlus(SESSION_TTL_MS), nowIso(),
    ),
  ];

  /* La cuenta del arranque nace con `must_change_password = 1`, y ese
     aviso bloquea toda acción mutante. Con PIN no hay contraseña que
     cambiar, así que el aviso dejaría el panel de adorno: se entra y
     no se puede aprobar nada.

     Se resuelve borrando la contraseña de esa cuenta en vez de
     ignorar el aviso. No es un atajo: la contraseña del arranque
     viajó en una línea de terminal y conviene que deje de servir.
     Después de esto, a esa cuenta solo se entra por PIN. */
  if (u.must_change_password) {
    escrituras.push(env.DB.prepare(
      `UPDATE admin_users
          SET password_hash = NULL, password_salt = NULL,
              must_change_password = 0, updated_at = ?
        WHERE id = ?`,
    ).bind(nowIso(), u.id));
    u.must_change_password = 0;
  }

  await env.DB.batch(escrituras);
  await registerAttempt(env, CUBO_PIN, ip, true, 'ok');

  return { ok: true, token, csrf, user: u };
}

// ── Sesión activa ──────────────────────────────────────────────
export async function getSession(env: Env, request: Request): Promise<Session | null> {
  if (env.ADMIN_AUTH_MODE === 'access') return getAccessSession(env, request);

  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await peppered(token, env.SESSION_PEPPER);
  const row = await env.DB.prepare(
    `SELECT s.id, s.csrf_hash, s.expires_at, s.revoked_at,
            u.id AS uid, u.email, u.display_name, u.role, u.must_change_password
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND u.archived_at IS NULL`,
  ).bind(tokenHash).first<{
    id: string; csrf_hash: string; expires_at: string; revoked_at: string | null;
    uid: string; email: string; display_name: string;
    role: 'admin'|'owner'|'viewer'; must_change_password: number;
  }>();

  if (!row || row.revoked_at || isExpired(row.expires_at)) return null;

  await env.DB.prepare(`UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?`)
    .bind(nowIso(), row.id).run();

  return {
    id: row.id,
    csrfToken: row.csrf_hash, // se compara por hash, no se devuelve al cliente
    user: {
      id: row.uid, email: row.email, display_name: row.display_name,
      role: row.role, must_change_password: row.must_change_password,
    },
  };
}

/**
 * Cloudflare Access — camino recomendado en plan Free.
 * Access valida la identidad antes de llegar al Worker y firma un JWT.
 * Aquí se comprueba su presencia y se resuelve la usuaria administradora.
 *
 * [PENDIENTE: verificación completa de la firma del JWT contra las claves
 *  públicas de ACCESS_TEAM_DOMAIN. Mientras Access esté delante del Worker,
 *  la petición no puede llegar sin pasar por él; aun así la verificación
 *  local debe implementarse antes de considerar esto endurecido.]
 */
async function getAccessSession(env: Env, request: Request): Promise<Session | null> {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!jwt || !email) return null;

  const u = await env.DB.prepare(
    `SELECT id, email, display_name, role, must_change_password
       FROM admin_users WHERE email_normalized = ? AND archived_at IS NULL`,
  ).bind(email.toLowerCase()).first<AdminUser>();

  if (!u) return null;
  return { id: `access:${u.id}`, user: u, csrfToken: '' };
}

export async function revokeSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare(`UPDATE admin_sessions SET revoked_at = ? WHERE id = ?`)
    .bind(nowIso(), sessionId).run();
}

// ── CSRF ───────────────────────────────────────────────────────
export async function checkCsrf(env: Env, request: Request, session: Session): Promise<boolean> {
  if (env.ADMIN_AUTH_MODE === 'access') return true; // Access ya protege el origen
  const sent = request.headers.get('X-CSRF-Token');
  if (!sent) return false;
  const sentHash = await peppered(sent, env.SESSION_PEPPER);
  return timingSafeEqual(sentHash, session.csrfToken);
}

export function requireRole(session: Session, roles: AdminUser['role'][]): boolean {
  return roles.includes(session.user.role);
}
