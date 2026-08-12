-- ═══════════════════════════════════════════════════════════════
-- MÁQUINA DE ESTADOS — la regla absoluta del sistema.
--
-- Ningún grupo se publica automáticamente. La aprobación pastoral
-- NUNCA lleva a PUBLISHED: lleva a PENDING_FINAL_APPROVAL.
-- Solo una acción explícita de administración (final_approve)
-- puede llegar a APPROVED, y solo entonces a PUBLISHED.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO state_transitions (from_state, to_state, actor_type, requires_pastoral_approval) VALUES
  -- Revisión administrativa
  ('PENDING_REVIEW',             'NEEDS_CORRECTIONS',          'admin',  0),
  ('PENDING_REVIEW',             'PENDING_PASTORAL_APPROVAL',  'admin',  0),
  ('PENDING_REVIEW',             'REJECTED',                   'admin',  0),
  ('PENDING_REVIEW',             'DUPLICATE',                  'admin',  0),

  ('NEEDS_CORRECTIONS',          'PENDING_REVIEW',             'public', 0),
  ('NEEDS_CORRECTIONS',          'REJECTED',                   'admin',  0),

  -- Confirmación pastoral
  ('PENDING_PASTORAL_APPROVAL',  'PASTORAL_REVIEW',            'pastor', 0),
  ('PENDING_PASTORAL_APPROVAL',  'PENDING_REVIEW',             'admin',  0),
  ('PENDING_PASTORAL_APPROVAL',  'REJECTED',                   'admin',  0),

  ('PASTORAL_REVIEW',            'PASTORAL_APPROVED',          'pastor', 0),
  ('PASTORAL_REVIEW',            'PASTORAL_REJECTED',          'pastor', 0),
  ('PASTORAL_REVIEW',            'NEEDS_CORRECTIONS',          'pastor', 0),

  -- La aprobación pastoral NO publica. Solo habilita la decisión final.
  ('PASTORAL_APPROVED',          'PENDING_FINAL_APPROVAL',     'system', 0),

  ('PASTORAL_REJECTED',          'REJECTED',                   'admin',  0),
  ('PASTORAL_REJECTED',          'PENDING_PASTORAL_APPROVAL',  'admin',  0),

  -- Decisión final: exige aprobación pastoral registrada
  ('PENDING_FINAL_APPROVAL',     'APPROVED',                   'admin',  1),
  ('PENDING_FINAL_APPROVAL',     'REJECTED',                   'admin',  0),
  ('PENDING_FINAL_APPROVAL',     'NEEDS_CORRECTIONS',          'admin',  0),

  -- Publicación: exige aprobación pastoral registrada
  ('APPROVED',                   'PUBLISHED',                  'admin',  1),

  -- Ciclo de vida del grupo publicado
  ('PUBLISHED',                  'FULL',                       'system', 0),
  ('PUBLISHED',                  'SUSPENDED',                  'admin',  0),
  ('PUBLISHED',                  'CLOSED',                     'admin',  0),
  ('FULL',                       'PUBLISHED',                  'system', 0),
  ('FULL',                       'SUSPENDED',                  'admin',  0),
  ('FULL',                       'CLOSED',                     'admin',  0),
  ('SUSPENDED',                  'PUBLISHED',                  'admin',  1),
  ('SUSPENDED',                  'CLOSED',                     'admin',  0);
