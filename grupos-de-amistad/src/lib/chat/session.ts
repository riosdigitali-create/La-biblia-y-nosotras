/**
 * Sesión de conversación.
 *
 * El cliente recibe un token opaco y nada más: ni el identificador interno,
 * ni el borrador, ni el historial. No puede leer ni falsificar estado. En el
 * servidor solo se guarda el hash del token, igual que las sesiones del panel.
 */

import type { Env } from '../env';
import { randomId, randomToken, peppered, nowIso, isoPlus, isExpired } from '../crypto';

/** Dos horas: suficiente para una charla, corto para lo que se retiene. */
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Turnos máximos por sesión. Frena bucles y abuso del proveedor. */
export const MAX_TURNS = 40;

/** Turnos que se conservan para mantener el hilo. El resto se descarta. */
export const TRANSCRIPT_TURNS = 12;

export interface Draft {
  full_name?: string;
  first_name?: string;
  phone?: string;
  email?: string;
  estado?: string;
  municipio?: string;
  colonia?: string;
  postal_code?: string;
  age_range?: string;
  pref_modality?: string;
  pref_weekdays?: string[];
  pref_times?: string[];
  has_community?: string;
  community_name?: string;
  comments?: string;
  prayer?: string;
  /** Últimos grupos ofrecidos, para poder decir "el primero" o "el de los sábados". */
  offered?: {
    id: string; nombre: string; lider: string; zona: string;
    municipio: string; estado: string; dia: string; horario: string; modalidad: string;
  }[];
}

export interface Turn { role: 'user' | 'assistant'; content: string }

export interface ChatSession {
  id: string;
  participantId: string | null;
  draft: Draft;
  transcript: Turn[];
  turns: number;
  consentGiven: boolean;
  escalated: boolean;
}

function parse<T>(raw: unknown, fallback: T): T {
  try {
    const v = JSON.parse(String(raw ?? ''));
    return v && typeof v === 'object' ? (v as T) : fallback;
  } catch { return fallback; }
}

export async function createSession(
  env: Env, ipHash: string | null,
): Promise<{ token: string; session: ChatSession }> {
  const id = randomId();
  const token = randomToken(32);
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO chat_sessions (id, token_hash, draft, transcript, turns, created_at, updated_at, expires_at)
     VALUES (?,?, '{}', '[]', 0, ?, ?, ?)`,
  ).bind(id, await peppered(token, env.SESSION_PEPPER), ts, ts, isoPlus(SESSION_TTL_MS)).run();

  return {
    token,
    session: { id, participantId: null, draft: {}, transcript: [], turns: 0, consentGiven: false, escalated: false },
  };
}

export async function loadSession(env: Env, token: string): Promise<ChatSession | null> {
  if (!token || token.length < 20 || token.length > 128) return null;
  const row = await env.DB.prepare(
    `SELECT id, participant_id, draft, transcript, turns, consent_given, escalated, expires_at
       FROM chat_sessions WHERE token_hash = ?`,
  ).bind(await peppered(token, env.SESSION_PEPPER)).first<Record<string, any>>();

  if (!row || isExpired(row.expires_at)) return null;

  return {
    id: row.id,
    participantId: row.participant_id ?? null,
    draft: parse<Draft>(row.draft, {}),
    transcript: parse<Turn[]>(row.transcript, []),
    turns: Number(row.turns) || 0,
    consentGiven: row.consent_given === 1,
    escalated: row.escalated === 1,
  };
}

export async function saveSession(env: Env, s: ChatSession): Promise<void> {
  // Solo se persisten los últimos turnos: la conversación completa no se guarda.
  const recorte = s.transcript.slice(-TRANSCRIPT_TURNS * 2);
  await env.DB.prepare(
    `UPDATE chat_sessions
        SET participant_id = ?, draft = ?, transcript = ?, turns = ?,
            consent_given = ?, consent_at = CASE WHEN ? = 1 AND consent_at IS NULL THEN ? ELSE consent_at END,
            escalated = ?, updated_at = ?
      WHERE id = ?`,
  ).bind(
    s.participantId, JSON.stringify(s.draft), JSON.stringify(recorte), s.turns,
    s.consentGiven ? 1 : 0, s.consentGiven ? 1 : 0, nowIso(),
    s.escalated ? 1 : 0, nowIso(), s.id,
  ).run();
}

/**
 * Límite de peticiones por IP. Ventana de un minuto, contador en D1.
 * No usamos KV porque el proyecto no tiene ese binding y añadirlo cambiaría
 * el despliegue; D1 basta para este volumen.
 */
export async function underRateLimit(
  env: Env, ipHash: string, max = 12, windowMs = 60_000,
): Promise<boolean> {
  const ventana = Math.floor(Date.now() / windowMs);
  const bucket = `${ipHash}:${ventana}`;
  await env.DB.prepare(
    `INSERT INTO chat_rate (bucket, hits, expires_at) VALUES (?, 1, ?)
     ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1`,
  ).bind(bucket, isoPlus(windowMs * 3)).run();

  const row = await env.DB.prepare(`SELECT hits FROM chat_rate WHERE bucket = ?`)
    .bind(bucket).first<{ hits: number }>();
  return (row?.hits ?? 0) <= max;
}

/** Limpieza de lo caducado. La llama el cron. */
export async function purgeExpired(env: Env): Promise<void> {
  const ts = nowIso();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM chat_sessions WHERE expires_at <= ?`).bind(ts),
    env.DB.prepare(`DELETE FROM chat_rate WHERE expires_at <= ?`).bind(ts),
  ]);
}
