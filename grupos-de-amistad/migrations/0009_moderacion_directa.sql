-- 0009 · Moderación directa desde el panel
--
-- La metodología operativa de LBYN es aceptar o rechazar solicitudes desde
-- el panel. Al aceptar, el grupo se publica en la misma transacción y queda
-- disponible inmediatamente para la búsqueda por código postal.

INSERT INTO state_transitions
  (from_state, to_state, actor_type, requires_pastoral_approval)
VALUES
  ('PENDING_REVIEW',            'PUBLISHED', 'admin', 0),
  ('NEEDS_CORRECTIONS',         'PUBLISHED', 'admin', 0),
  ('PENDING_PASTORAL_APPROVAL', 'PUBLISHED', 'admin', 0),
  ('PASTORAL_REVIEW',           'PUBLISHED', 'admin', 0),
  ('PASTORAL_APPROVED',         'PUBLISHED', 'admin', 0),
  ('PASTORAL_REJECTED',         'PUBLISHED', 'admin', 0),
  ('PENDING_FINAL_APPROVAL',    'PUBLISHED', 'admin', 0)
ON CONFLICT (from_state, to_state, actor_type)
DO UPDATE SET requires_pastoral_approval = excluded.requires_pastoral_approval;

UPDATE state_transitions
   SET requires_pastoral_approval = 0
 WHERE from_state = 'APPROVED'
   AND to_state = 'PUBLISHED'
   AND actor_type = 'admin';
