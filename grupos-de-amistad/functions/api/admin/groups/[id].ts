import type { Env } from '../../../../src/lib/env';
import { json, fail, methodNotAllowed } from '../../../../src/lib/http';
import { guardAdmin } from '../../../../src/lib/guard';
import { nowIso } from '../../../../src/lib/crypto';
import { canTransition } from '../../../../src/lib/states';
import { audit } from '../../../../src/lib/audit';

/**
 * PATCH /api/admin/groups/:id
 * Suspender, cerrar, reactivar o cambiar capacidad.
 * Nunca borra: archiva o cambia de estado.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']);
  const g = await guardAdmin(request, env, { mutating: true, roles: ['admin', 'owner'] });
  if (!g.ok) return g.response;

  const id = String(params.id);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const group = await env.DB.prepare(
    `SELECT id, application_id, editorial_status, occupied, capacity FROM groups WHERE id = ?`,
  ).bind(id).first<{
    id: string; application_id: string; editorial_status: string;
    occupied: number; capacity: number;
  }>();
  if (!group) return fail('not_found', 'No encontramos ese grupo.', 404);

  const ts = nowIso();

  if (typeof body.editorial_status === 'string') {
    const target = body.editorial_status;
    if (body.confirm !== true) {
      return fail('confirmation_required', 'Confirma el cambio de estado de este grupo.', 428);
    }
    const check = await canTransition(
      env, group.application_id, group.editorial_status as never, target as never, 'admin',
    );
    if (!check.allowed) return fail('bad_state', check.reason ?? 'Cambio no permitido.', 409);

    if (target === 'SUSPENDED') {
      await env.DB.prepare(
        `UPDATE groups SET editorial_status = 'SUSPENDED', suspended_at = ?, suspended_reason = ?,
                is_visible = 0, updated_at = ? WHERE id = ?`,
      ).bind(ts, String(body.reason ?? '').slice(0, 500), ts, id).run();
    } else if (target === 'CLOSED') {
      await env.DB.prepare(
        `UPDATE groups SET editorial_status = 'CLOSED', closed_at = ?,
                is_visible = 0, is_active = 0, updated_at = ? WHERE id = ?`,
      ).bind(ts, ts, id).run();
    } else if (target === 'PUBLISHED') {
      await env.DB.prepare(
        `UPDATE groups SET editorial_status = 'PUBLISHED', suspended_at = NULL,
                suspended_reason = NULL, is_visible = 1, is_active = 1, updated_at = ? WHERE id = ?`,
      ).bind(ts, id).run();
    } else {
      await env.DB.prepare(
        `UPDATE groups SET editorial_status = ?, updated_at = ? WHERE id = ?`,
      ).bind(target, ts, id).run();
    }

    await audit(env, {
      actorType: 'admin', actorId: g.session.user.id, action: `group.${target.toLowerCase()}`,
      entityType: 'group', entityId: id,
      before: { status: group.editorial_status }, after: { status: target },
    });
    return json({ ok: true, estado: target });
  }

  if (body.capacity !== undefined) {
    const c = Number(body.capacity);
    if (!Number.isInteger(c) || c < 1 || c > 200) {
      return fail('bad_capacity', 'La capacidad debe estar entre 1 y 200.', 422);
    }
    if (c < group.occupied) {
      return fail(
        'capacity_below_occupied',
        `Ya hay ${group.occupied} mujeres apuntadas. La capacidad no puede ser menor.`,
        409,
      );
    }
    await env.DB.prepare(`UPDATE groups SET capacity = ?, updated_at = ? WHERE id = ?`)
      .bind(c, ts, id).run();

    // Si estaba lleno y ahora hay lugar, vuelve a ofrecerse. Este paso lo da
    // el sistema (FULL → PUBLISHED es transición de 'system' en 0003): no
    // requiere aprobación nueva, porque el grupo ya estaba publicado.
    let republicado = false;
    if (group.editorial_status === 'FULL' && c > group.occupied) {
      const vuelta = await canTransition(env, group.application_id, 'FULL', 'PUBLISHED', 'system');
      if (vuelta.allowed) {
        await env.DB.prepare(
          `UPDATE groups SET editorial_status = 'PUBLISHED', updated_at = ?
            WHERE id = ? AND editorial_status = 'FULL' AND occupied < capacity`,
        ).bind(ts, id).run();
        republicado = true;
      }
    }

    await audit(env, {
      actorType: 'admin', actorId: g.session.user.id, action: 'group.capacity_changed',
      entityType: 'group', entityId: id,
      before: { capacity: group.capacity, status: group.editorial_status },
      after: { capacity: c, ...(republicado ? { status: 'PUBLISHED' } : {}) },
    });
    return json({ ok: true, capacity: c, ...(republicado ? { estado: 'PUBLISHED' } : {}) });
  }

  return fail('nothing_to_update', 'No hay cambios que guardar.', 400);
};
