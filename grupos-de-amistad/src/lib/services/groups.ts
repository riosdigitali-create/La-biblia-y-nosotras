/**
 * Servicio de grupos publicados.
 *
 * Proyección pública y reserva de cupo. Igual que participants.ts, sin
 * Request ni Response: lo usan el buscador HTTP y la conversación.
 *
 * REGLA QUE NO SE NEGOCIA: esta consulta jamás devuelve dirección privada,
 * teléfono, correo, contacto pastoral ni notas internas. Los campos se
 * enumeran uno por uno a propósito. Nada de SELECT *.
 */

import type { Env } from '../env';
import { randomId, nowIso } from '../crypto';
import { audit } from '../audit';

/**
 * Condiciones que debe cumplir un grupo para existir de cara al público.
 * `a` es el alias de la tabla `groups` en la consulta que la use.
 */
export function visibleSql(a = 'groups'): string {
  return `
    ${a}.editorial_status = 'PUBLISHED'
    AND ${a}.is_visible = 1
    AND ${a}.is_active = 1
    AND ${a}.archived_at IS NULL
    AND ${a}.suspended_at IS NULL
    AND ${a}.closed_at IS NULL
    AND ${a}.occupied < ${a}.capacity
  `;
}

export interface GrupoPublico {
  id: string;
  nombre: string;
  /**
   * Nombre público de la líder. Solo viaja si ella lo autorizó
   * (`leaders.public_name_authorized = 1`). Si no, va vacío y la interfaz
   * muestra únicamente el nombre del grupo. Nunca es el nombre legal
   * completo: es `leaders.public_name`, que ella eligió.
   */
  lider: string;
  zona: string;
  colonia: string;
  municipio: string;
  estado: string;
  modalidad: string;
  dia: string;
  horario: string;
  lugares_disponibles: number;
  cupo_texto: string;
}

export interface BusquedaParams {
  cp?: string;
  colonia?: string;
  municipio?: string;
  estado?: string;
  modalidad?: string | null;
  dia?: string | null;
  limit?: number;
}

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

export async function searchPublishedGroups(
  env: Env, p: BusquedaParams,
): Promise<{ ok: true; resultados: GrupoPublico[] } | { ok: false; code: 'missing_area' }> {
  const postal = String(p.cp ?? '').replace(/\D/g, '').slice(0, 5);
  const colonia = String(p.colonia ?? '').trim().slice(0, 90);
  const municipio = String(p.municipio ?? '').trim().slice(0, 90);
  const estado = String(p.estado ?? '').trim().slice(0, 60);
  const limit = Math.min(Number(p.limit ?? 20) || 20, 50);

  if (!postal && !municipio && !estado) return { ok: false, code: 'missing_area' };

  const where: string[] = [visibleSql('g').trim()];
  const binds: unknown[] = [];

  if (p.modalidad && ['presencial', 'linea'].includes(p.modalidad)) {
    where.push('g.modality = ?');
    binds.push(p.modalidad);
  }
  if (p.dia && DIAS.includes(p.dia)) {
    where.push('g.weekday = ?');
    binds.push(p.dia);
  }

  // El orden ES la relevancia por cercanía.
  const rank = `
    CASE
      WHEN ? <> '' AND g.postal_code = ?              THEN 1
      WHEN ? <> '' AND lower(g.colonia) = lower(?)    THEN 2
      WHEN ? <> '' AND lower(g.municipio) = lower(?)  THEN 3
      WHEN ? <> '' AND lower(g.estado) = lower(?)     THEN 4
      WHEN g.modality = 'linea'                       THEN 5
      ELSE 6
    END`;
  const rankBinds = [postal, postal, colonia, colonia, municipio, municipio, estado, estado];

  // El JOIN con `leaders` trae UN solo campo, y condicionado: el nombre
  // público que ella eligió, y solo si autorizó mostrarlo. Ningún otro dato
  // de la líder entra en esta consulta.
  const sql = `
    SELECT g.id, g.public_name, g.zone_public, g.colonia, g.municipio, g.estado,
           g.modality, g.weekday, g.time_start,
           CASE WHEN l.public_name_authorized = 1 THEN l.public_name ELSE NULL END AS lider_publica,
           (g.capacity - g.occupied) AS lugares_disponibles,
           ${rank} AS cercania
      FROM groups g
      JOIN leaders l ON l.id = g.leader_id
     WHERE ${where.join(' AND ')}
     ORDER BY cercania ASC, g.time_start ASC
     LIMIT ?`;

  const rows = await env.DB.prepare(sql).bind(...rankBinds, ...binds, limit).all<any>();

  const resultados: GrupoPublico[] = (rows.results ?? [])
    .filter((r: any) => r.cercania <= 5)
    .map((r: any) => ({
      id: r.id,
      nombre: r.public_name ?? 'Grupo de amistad',
      lider: r.lider_publica ?? '',
      zona: r.zone_public,
      colonia: r.colonia,
      municipio: r.municipio,
      estado: r.estado,
      modalidad: r.modality,
      dia: r.weekday,
      horario: r.time_start,
      lugares_disponibles: r.lugares_disponibles,
      cupo_texto: r.lugares_disponibles === 1
        ? 'Queda 1 lugar disponible'
        : `${r.lugares_disponibles} lugares disponibles`,
    }));

  return { ok: true, resultados };
}

export type JoinResult =
  | { ok: true; estado: string; duplicate: boolean }
  | { ok: false; code: 'unknown_participant' | 'group_unavailable' | 'write_failed' };

/**
 * Solicita un lugar en un grupo.
 *
 * El cupo se reserva con un UPDATE condicional: la carrera por el último
 * lugar la resuelve la base de datos, no la aplicación. Si changes() = 0,
 * el grupo se llenó o dejó de ser público entre la búsqueda y la solicitud.
 */
export async function requestGroupJoin(
  env: Env, groupId: string, participantId: string, ip?: string,
): Promise<JoinResult> {
  const participant = await env.DB.prepare(
    `SELECT id FROM participants WHERE id = ? AND archived_at IS NULL`,
  ).bind(participantId).first<{ id: string }>();
  if (!participant) return { ok: false, code: 'unknown_participant' };

  const already = await env.DB.prepare(
    `SELECT status FROM group_join_requests WHERE group_id = ? AND participant_id = ?`,
  ).bind(groupId, participantId).first<{ status: string }>();
  if (already) return { ok: true, estado: already.status, duplicate: true };

  const ts = nowIso();
  const reserve = await env.DB.prepare(
    `UPDATE groups SET occupied = occupied + 1, updated_at = ?
      WHERE id = ? AND ${visibleSql('groups')}`,
  ).bind(ts, groupId).run();

  if (!reserve.meta.changes) return { ok: false, code: 'group_unavailable' };

  const reqId = randomId();
  try {
    await env.DB.prepare(
      `INSERT INTO group_join_requests (id, group_id, participant_id, status, requested_at)
       VALUES (?,?,?, 'REQUESTED', ?)`,
    ).bind(reqId, groupId, participantId, ts).run();
  } catch (e) {
    // Se devuelve el lugar si no se pudo registrar la solicitud.
    await env.DB.prepare(
      `UPDATE groups SET occupied = occupied - 1, updated_at = ? WHERE id = ? AND occupied > 0`,
    ).bind(ts, groupId).run();
    console.error('join_insert_failed', String(e).slice(0, 200));
    return { ok: false, code: 'write_failed' };
  }

  // Si con esta solicitud se llenó, deja de ofrecerse.
  const g = await env.DB.prepare(
    `SELECT occupied, capacity FROM groups WHERE id = ?`,
  ).bind(groupId).first<{ occupied: number; capacity: number }>();
  if (g && g.occupied >= g.capacity) {
    await env.DB.prepare(
      `UPDATE groups SET editorial_status = 'FULL', updated_at = ? WHERE id = ?`,
    ).bind(ts, groupId).run();
  }

  await audit(env, {
    actorType: 'public', action: 'join.requested',
    entityType: 'group', entityId: groupId,
    after: { join_request_id: reqId }, ip,
  });

  try {
    await env.JOBS?.send({
      type: 'join.notify_leader', groupId, joinRequestId: reqId, jobKey: `join:${reqId}`,
    });
  } catch (e) {
    console.warn('queue_send_failed', String(e).slice(0, 120));
  }

  return { ok: true, estado: 'REQUESTED', duplicate: false };
}
