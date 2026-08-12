import type { Env } from './env';

export type AppStatus =
  | 'PENDING_REVIEW' | 'NEEDS_CORRECTIONS' | 'PENDING_PASTORAL_APPROVAL'
  | 'PASTORAL_REVIEW' | 'PASTORAL_APPROVED' | 'PASTORAL_REJECTED'
  | 'PENDING_FINAL_APPROVAL' | 'APPROVED' | 'PUBLISHED'
  | 'REJECTED' | 'SUSPENDED' | 'FULL' | 'CLOSED' | 'DUPLICATE';

export type ActorType = 'admin' | 'pastor' | 'system' | 'public';

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Única puerta de entrada a un cambio de estado.
 * Consulta el catálogo en D1 y, si la transición lo exige,
 * comprueba que exista una aprobación pastoral real y vigente.
 *
 * Esto es lo que impide que un grupo se publique sin la doble aprobación,
 * aunque alguien llame la API directamente.
 */
export async function canTransition(
  env: Env,
  applicationId: string,
  from: AppStatus,
  to: AppStatus,
  actor: ActorType,
): Promise<TransitionCheck> {
  const row = await env.DB.prepare(
    `SELECT requires_pastoral_approval FROM state_transitions
      WHERE from_state = ? AND to_state = ? AND actor_type = ?`,
  ).bind(from, to, actor).first<{ requires_pastoral_approval: number }>();

  if (!row) {
    return { allowed: false, reason: `Transición no permitida: ${from} → ${to} (${actor}).` };
  }

  if (row.requires_pastoral_approval === 1) {
    const approval = await env.DB.prepare(
      `SELECT id FROM pastoral_approvals
        WHERE application_id = ? AND decision = 'approved'
          AND used_at IS NOT NULL AND revoked_at IS NULL
        LIMIT 1`,
    ).bind(applicationId).first<{ id: string }>();

    if (!approval) {
      return {
        allowed: false,
        reason: 'Falta la confirmación pastoral registrada. No se puede aprobar ni publicar.',
      };
    }
  }

  return { allowed: true };
}

/** Estados en los que un grupo puede aparecer en la búsqueda pública. */
export const PUBLICLY_VISIBLE: AppStatus[] = ['PUBLISHED'];

export const HUMAN_STATUS: Record<AppStatus, string> = {
  PENDING_REVIEW:            'En revisión',
  NEEDS_CORRECTIONS:         'Necesita correcciones',
  PENDING_PASTORAL_APPROVAL: 'Esperando confirmación pastoral',
  PASTORAL_REVIEW:           'El pastorado la está revisando',
  PASTORAL_APPROVED:         'Confirmada por el pastorado',
  PASTORAL_REJECTED:         'Sin confirmación pastoral',
  PENDING_FINAL_APPROVAL:    'Lista para aprobación final',
  APPROVED:                  'Aprobada, sin publicar',
  PUBLISHED:                 'Publicada',
  REJECTED:                  'No aprobada',
  SUSPENDED:                 'Suspendida',
  FULL:                      'Sin lugares disponibles',
  CLOSED:                    'Cerrada',
  DUPLICATE:                 'Duplicada',
};
