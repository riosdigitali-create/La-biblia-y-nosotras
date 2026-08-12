-- 0007 · El consentimiento de contacto, como tipo propio
--
-- El formulario de líderes pasó a pedir una autorización explícita para
-- comunicarse con ella («Contacto»). Antes solo existían privacy,
-- agreement, pastoral_contact y marketing, y ninguno describe eso.
--
-- SQLite no permite modificar un CHECK con ALTER TABLE, así que se
-- recrea la tabla y se copia el contenido. Se hace dentro de una
-- transacción: o queda entera, o no cambia nada.

PRAGMA foreign_keys = OFF;

CREATE TABLE consents_nueva (
  id            TEXT PRIMARY KEY,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('leader','participant')),
  subject_id    TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('privacy','agreement','pastoral_contact','contact','marketing')),
  version       TEXT NOT NULL,
  accepted      INTEGER NOT NULL CHECK (accepted IN (0,1)),
  accepted_at   TEXT NOT NULL,
  ip_hash       TEXT,
  ua_hash       TEXT
);

INSERT INTO consents_nueva
  (id, subject_type, subject_id, kind, version, accepted, accepted_at, ip_hash, ua_hash)
SELECT
   id, subject_type, subject_id, kind, version, accepted, accepted_at, ip_hash, ua_hash
  FROM consents;

DROP TABLE consents;
ALTER TABLE consents_nueva RENAME TO consents;

CREATE INDEX IF NOT EXISTS idx_consents_subject ON consents (subject_type, subject_id);

PRAGMA foreign_keys = ON;
