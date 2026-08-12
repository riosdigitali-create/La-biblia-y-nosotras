import type { Env } from '../../../src/lib/env';
import { json, methodNotAllowed } from '../../../src/lib/http';
import { guardAdmin } from '../../../src/lib/guard';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const g = await guardAdmin(request, env, { roles: ['admin', 'owner', 'viewer'] });
  if (!g.ok) return g.response;

  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM group_applications
      WHERE archived_at IS NULL GROUP BY status`,
  ).all<{ status: string; n: number }>();

  const byStatus: Record<string, number> = {};
  for (const r of counts.results ?? []) byStatus[r.status] = r.n;

  const pendientes = await env.DB.prepare(
    `SELECT ga.id, ga.folio, ga.status, ga.municipio, ga.estado, ga.weekday,
            ga.time_start, ga.modality, ga.created_at, l.full_name AS lider
       FROM group_applications ga
       JOIN leaders l ON l.id = ga.leader_id
      WHERE ga.archived_at IS NULL
        AND ga.status IN ('PENDING_REVIEW','PENDING_FINAL_APPROVAL','NEEDS_CORRECTIONS')
      ORDER BY
        CASE ga.status
          WHEN 'PENDING_FINAL_APPROVAL' THEN 1
          WHEN 'PENDING_REVIEW'         THEN 2
          ELSE 3 END,
        ga.created_at ASC
      LIMIT 25`,
  ).all();

  const grupos = await env.DB.prepare(
    `SELECT COUNT(*) AS publicados,
            COALESCE(SUM(occupied),0) AS ocupados,
            COALESCE(SUM(capacity),0) AS capacidad
       FROM groups
      WHERE editorial_status IN ('PUBLISHED','FULL') AND archived_at IS NULL`,
  ).first<{ publicados: number; ocupados: number; capacidad: number }>();

  const espera = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM participants WHERE is_waitlisted = 1 AND archived_at IS NULL`,
  ).first<{ n: number }>();

  const actividad = await env.DB.prepare(
    `SELECT action, entity_type, entity_id, created_at, actor_type
       FROM audit_logs ORDER BY created_at DESC LIMIT 20`,
  ).all();

  return json({
    ok: true,
    solicitudes_por_estado: byStatus,
    pendientes: pendientes.results ?? [],
    grupos: grupos ?? { publicados: 0, ocupados: 0, capacidad: 0 },
    lista_espera: espera?.n ?? 0,
    actividad: actividad.results ?? [],
  });
};
