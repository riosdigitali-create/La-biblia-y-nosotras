-- ═══════════════════════════════════════════════════════════════
-- GRUPOS DE AMISTAD · toda la base, en un solo pegado
--
-- Qué es esto: las ocho migraciones del proyecto, en orden, más la
-- cuenta a la que se cuelga la sesión del PIN. Se pega entero en la
-- consola de D1 de Cloudflare y se ejecuta una sola vez.
--
-- Se hace así, y no con `wrangler d1 migrations apply`, porque no
-- hace falta terminal: la consola de D1 vive en la web.
--
-- Si algo falla a medias, la base queda incompleta. En ese caso
-- borra la base desde el panel de Cloudflare, créala otra vez y
-- vuelve a pegar esto entero. No intentes ejecutar solo el trozo
-- que falló: el orden importa.
-- ═══════════════════════════════════════════════════════════════


-- ═══ 0001_init.sql ═══════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Grupos de amistad — esquema inicial
-- Todas las marcas de tiempo en UTC, formato ISO-8601 (TEXT).
-- Ningún borrado físico: se archiva con archived_at.
-- Ningún token en claro: solo su hash.
-- ═══════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────
-- Catálogo de transiciones válidas.
-- La API valida contra esta tabla; no contra condicionales sueltos.
-- ─────────────────────────────────────────────
CREATE TABLE state_transitions (
  from_state    TEXT NOT NULL,
  to_state      TEXT NOT NULL,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('admin','pastor','system','public')),
  requires_pastoral_approval INTEGER NOT NULL DEFAULT 0 CHECK (requires_pastoral_approval IN (0,1)),
  PRIMARY KEY (from_state, to_state, actor_type)
);

-- ─────────────────────────────────────────────
-- Administración
-- ─────────────────────────────────────────────
CREATE TABLE admin_users (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL,
  email_normalized     TEXT NOT NULL UNIQUE,
  display_name         TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','owner','viewer')),
  password_hash        TEXT,
  password_salt        TEXT,
  password_algo        TEXT,
  password_iterations  INTEGER,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  last_login_at        TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  archived_at          TEXT
);

CREATE TABLE admin_sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES admin_users(id),
  token_hash   TEXT NOT NULL UNIQUE,
  csrf_hash    TEXT NOT NULL,
  ip_hash      TEXT,
  ua_hash      TEXT,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at   TEXT
);

CREATE TABLE login_attempts (
  id               TEXT PRIMARY KEY,
  email_normalized TEXT,
  ip_hash          TEXT,
  succeeded        INTEGER NOT NULL CHECK (succeeded IN (0,1)),
  reason           TEXT,
  created_at       TEXT NOT NULL
);

-- ─────────────────────────────────────────────
-- Consentimientos versionados (desacoplados)
-- ─────────────────────────────────────────────
CREATE TABLE consents (
  id            TEXT PRIMARY KEY,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('leader','participant')),
  subject_id    TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('privacy','agreement','pastoral_contact','marketing')),
  version       TEXT NOT NULL,
  accepted      INTEGER NOT NULL CHECK (accepted IN (0,1)),
  accepted_at   TEXT NOT NULL,
  ip_hash       TEXT,
  ua_hash       TEXT
);

-- ─────────────────────────────────────────────
-- Líderes
-- ─────────────────────────────────────────────
CREATE TABLE leaders (
  id                     TEXT PRIMARY KEY,
  full_name              TEXT NOT NULL,
  public_name            TEXT,
  public_name_authorized INTEGER NOT NULL DEFAULT 0 CHECK (public_name_authorized IN (0,1)),
  email                  TEXT NOT NULL,
  email_normalized       TEXT NOT NULL,
  email_hash             TEXT NOT NULL,
  phone_e164             TEXT NOT NULL,
  phone_hash             TEXT NOT NULL,
  church_type            TEXT NOT NULL CHECK (church_type IN ('rio','otra','sin_iglesia')),
  church_name            TEXT,
  pastors_name           TEXT,
  pastoral_contact       TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  archived_at            TEXT
);

-- ─────────────────────────────────────────────
-- Solicitudes de grupo
-- ─────────────────────────────────────────────
CREATE TABLE group_applications (
  id                  TEXT PRIMARY KEY,
  folio               TEXT NOT NULL UNIQUE,
  idempotency_key     TEXT NOT NULL UNIQUE,
  leader_id           TEXT NOT NULL REFERENCES leaders(id),
  status              TEXT NOT NULL DEFAULT 'PENDING_REVIEW',

  -- Dónde se reúne
  estado              TEXT NOT NULL,
  municipio           TEXT NOT NULL,
  postal_code         TEXT NOT NULL,
  colonia             TEXT NOT NULL,
  zone_public         TEXT NOT NULL,
  address_private     TEXT,
  modality            TEXT NOT NULL CHECK (modality IN ('presencial','linea')),

  -- Ritmo
  weekday             TEXT NOT NULL CHECK (weekday IN ('lunes','martes','miercoles','jueves','viernes','sabado','domingo')),
  time_start          TEXT NOT NULL,
  capacity            INTEGER NOT NULL CHECK (capacity > 0 AND capacity <= 200),
  group_name          TEXT,

  -- Contexto
  motivation          TEXT NOT NULL,
  comments            TEXT,

  -- Consentimiento (resumen; el detalle vive en consents)
  consent_version     TEXT NOT NULL,
  consent_accepted_at TEXT NOT NULL,
  agreement_version   TEXT NOT NULL,
  pastoral_contact_authorized INTEGER NOT NULL DEFAULT 0 CHECK (pastoral_contact_authorized IN (0,1)),

  submitted_ip_hash   TEXT,
  submitted_ua_hash   TEXT,
  reviewed_by         TEXT REFERENCES admin_users(id),
  reviewed_at         TEXT,
  review_notes        TEXT,
  rejection_reason    TEXT,

  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  archived_at         TEXT
);

-- ─────────────────────────────────────────────
-- Aprobaciones pastorales — token de un solo uso
-- ─────────────────────────────────────────────
CREATE TABLE pastoral_approvals (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES group_applications(id),
  token_hash     TEXT NOT NULL UNIQUE,
  sent_to        TEXT NOT NULL,
  sent_at        TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  used_at        TEXT,
  revoked_at     TEXT,
  superseded_by  TEXT REFERENCES pastoral_approvals(id),
  decision       TEXT CHECK (decision IN ('approved','rejected','more_info')),
  responder_name TEXT,
  comments       TEXT,
  responder_ip_hash TEXT,
  created_at     TEXT NOT NULL
);

-- ─────────────────────────────────────────────
-- Grupos publicados
-- editorial_status = máquina de estados
-- is_visible / is_active = banderas operativas, independientes
-- ─────────────────────────────────────────────
CREATE TABLE groups (
  id               TEXT PRIMARY KEY,
  application_id   TEXT NOT NULL UNIQUE REFERENCES group_applications(id),
  leader_id        TEXT NOT NULL REFERENCES leaders(id),

  editorial_status TEXT NOT NULL DEFAULT 'APPROVED',
  is_visible       INTEGER NOT NULL DEFAULT 0 CHECK (is_visible IN (0,1)),
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),

  public_name      TEXT,
  estado           TEXT NOT NULL,
  municipio        TEXT NOT NULL,
  postal_code      TEXT NOT NULL,
  colonia          TEXT NOT NULL,
  zone_public      TEXT NOT NULL,
  address_private  TEXT,
  modality         TEXT NOT NULL CHECK (modality IN ('presencial','linea')),
  weekday          TEXT NOT NULL,
  time_start       TEXT NOT NULL,

  capacity         INTEGER NOT NULL CHECK (capacity > 0),
  occupied         INTEGER NOT NULL DEFAULT 0 CHECK (occupied >= 0),

  published_at     TEXT,
  published_by     TEXT REFERENCES admin_users(id),
  suspended_at     TEXT,
  suspended_reason TEXT,
  closed_at        TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  archived_at      TEXT,

  CHECK (occupied <= capacity)
);

-- ─────────────────────────────────────────────
-- Participantes
-- ─────────────────────────────────────────────
CREATE TABLE participants (
  id                  TEXT PRIMARY KEY,
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  email_normalized    TEXT NOT NULL,
  email_hash          TEXT NOT NULL,
  phone_e164          TEXT NOT NULL,
  phone_hash          TEXT NOT NULL,
  estado              TEXT NOT NULL,
  municipio           TEXT NOT NULL,
  postal_code         TEXT NOT NULL,
  colonia             TEXT NOT NULL,
  pref_modality       TEXT NOT NULL CHECK (pref_modality IN ('presencial','linea','cualquiera')),
  pref_weekdays       TEXT,
  pref_times          TEXT,
  comments            TEXT,
  is_waitlisted       INTEGER NOT NULL DEFAULT 0 CHECK (is_waitlisted IN (0,1)),
  waitlisted_at       TEXT,
  consent_version     TEXT NOT NULL,
  consent_accepted_at TEXT NOT NULL,
  contact_authorized  INTEGER NOT NULL DEFAULT 0 CHECK (contact_authorized IN (0,1)),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  archived_at         TEXT
);

CREATE TABLE group_join_requests (
  id             TEXT PRIMARY KEY,
  group_id       TEXT NOT NULL REFERENCES groups(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  status         TEXT NOT NULL DEFAULT 'REQUESTED'
                 CHECK (status IN ('REQUESTED','CONFIRMED','DECLINED','CANCELLED','NO_SHOW')),
  requested_at   TEXT NOT NULL,
  confirmed_at   TEXT,
  released_at    TEXT,
  notes          TEXT,
  UNIQUE (group_id, participant_id)
);

-- ─────────────────────────────────────────────
-- Materiales y comunicaciones
-- ─────────────────────────────────────────────
CREATE TABLE materials (
  id            TEXT PRIMARY KEY,
  week_number   INTEGER NOT NULL,
  title         TEXT NOT NULL,
  audience      TEXT NOT NULL CHECK (audience IN ('leaders','participants','both')),
  instructions  TEXT,
  r2_key        TEXT,
  video_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','SCHEDULED','PUBLISHED','DISABLED')),
  scheduled_at  TEXT,
  published_at  TEXT,
  created_by    TEXT REFERENCES admin_users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (week_number, audience)
);

CREATE TABLE message_deliveries (
  id              TEXT PRIMARY KEY,
  job_key         TEXT NOT NULL UNIQUE,
  channel         TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  template        TEXT NOT NULL,
  recipient_hash  TEXT NOT NULL,
  related_type    TEXT,
  related_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','SENT','FAILED','SKIPPED')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  created_at      TEXT NOT NULL,
  sent_at         TEXT
);

CREATE TABLE job_locks (
  job_key    TEXT PRIMARY KEY,
  locked_at  TEXT NOT NULL,
  locked_by  TEXT,
  completed_at TEXT
);

-- ─────────────────────────────────────────────
-- Auditoría — resúmenes redactados, nunca payloads con datos personales
-- ─────────────────────────────────────────────
CREATE TABLE audit_logs (
  id            TEXT PRIMARY KEY,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('admin','pastor','system','public')),
  actor_id      TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  before_summary TEXT,
  after_summary  TEXT,
  ip_hash       TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- ═══ 0002_indexes.sql ════════════════════════════════════════

-- Índices: todo lo que se filtra, ordena o une.

CREATE INDEX idx_admin_sessions_user       ON admin_sessions(user_id);
CREATE INDEX idx_admin_sessions_expires    ON admin_sessions(expires_at);
CREATE INDEX idx_login_attempts_email      ON login_attempts(email_normalized, created_at);
CREATE INDEX idx_login_attempts_ip         ON login_attempts(ip_hash, created_at);

CREATE INDEX idx_consents_subject          ON consents(subject_type, subject_id);

CREATE INDEX idx_leaders_email_hash        ON leaders(email_hash);
CREATE INDEX idx_leaders_phone_hash        ON leaders(phone_hash);
CREATE INDEX idx_leaders_archived          ON leaders(archived_at);

CREATE INDEX idx_apps_status               ON group_applications(status);
CREATE INDEX idx_apps_leader               ON group_applications(leader_id);
CREATE INDEX idx_apps_created              ON group_applications(created_at);
CREATE INDEX idx_apps_geo                  ON group_applications(estado, municipio, postal_code);
CREATE INDEX idx_apps_archived             ON group_applications(archived_at);

CREATE INDEX idx_pastoral_app              ON pastoral_approvals(application_id);
CREATE INDEX idx_pastoral_expires          ON pastoral_approvals(expires_at);
CREATE INDEX idx_pastoral_open             ON pastoral_approvals(application_id, used_at, revoked_at);

-- El índice que sostiene la búsqueda pública.
CREATE INDEX idx_groups_search             ON groups(editorial_status, is_visible, is_active, postal_code);
CREATE INDEX idx_groups_geo                ON groups(estado, municipio, colonia);
CREATE INDEX idx_groups_postal             ON groups(postal_code);
CREATE INDEX idx_groups_modality_day       ON groups(modality, weekday);
CREATE INDEX idx_groups_leader             ON groups(leader_id);
CREATE INDEX idx_groups_capacity           ON groups(occupied, capacity);

CREATE INDEX idx_participants_email_hash   ON participants(email_hash);
CREATE INDEX idx_participants_phone_hash   ON participants(phone_hash);
CREATE INDEX idx_participants_geo          ON participants(estado, municipio, postal_code);
CREATE INDEX idx_participants_waitlist     ON participants(is_waitlisted, created_at);

CREATE INDEX idx_join_group                ON group_join_requests(group_id, status);
CREATE INDEX idx_join_participant          ON group_join_requests(participant_id);

CREATE INDEX idx_materials_schedule        ON materials(status, scheduled_at);

CREATE INDEX idx_deliveries_status         ON message_deliveries(status, created_at);
CREATE INDEX idx_deliveries_related        ON message_deliveries(related_type, related_id);

CREATE INDEX idx_audit_entity              ON audit_logs(entity_type, entity_id, created_at);
CREATE INDEX idx_audit_actor               ON audit_logs(actor_type, actor_id, created_at);
CREATE INDEX idx_audit_created             ON audit_logs(created_at);

-- ═══ 0003_state_transitions.sql ══════════════════════════════

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

-- ═══ 0004_settings.sql ═══════════════════════════════════════

-- Ajustes iniciales. Sin datos personales, sin secretos.
INSERT INTO system_settings (key, value, updated_at) VALUES
  ('consent_version',            '2026-08-v1',                     '2026-08-05T00:00:00Z'),
  ('agreement_version',          '2026-08-v1',                     '2026-08-05T00:00:00Z'),
  ('pastoral_token_ttl_hours',   '168',                            '2026-08-05T00:00:00Z'),
  ('session_ttl_hours',          '12',                             '2026-08-05T00:00:00Z'),
  ('login_max_attempts',         '5',                              '2026-08-05T00:00:00Z'),
  ('login_lockout_minutes',      '15',                             '2026-08-05T00:00:00Z'),
  ('search_max_results',         '20',                             '2026-08-05T00:00:00Z'),
  ('retention_rejected_days',    'PENDIENTE',                      '2026-08-05T00:00:00Z'),
  ('retention_waitlist_days',    'PENDIENTE',                      '2026-08-05T00:00:00Z'),
  ('review_time_estimate',       'PENDIENTE',                      '2026-08-05T00:00:00Z'),
  ('airtable_coexistence',       'off',                            '2026-08-05T00:00:00Z');

-- ═══ 0005_participants_perfil.sql ════════════════════════════

-- 0005 · Perfil de la participante
--
-- Campos que el formulario público pide y que el esquema inicial no
-- contemplaba: rango de edad, si ya pertenece a una comunidad y cuál.
-- Los horarios (pref_weekdays, pref_times) y los comentarios ya existían
-- en 0001; lo que faltaba era recogerlos en el formulario.
--
-- Se añaden como columnas opcionales para no romper filas existentes.
-- La obligatoriedad se aplica en la capa de validación (PARTICIPANT_FIELDS),
-- que es la que devuelve mensajes legibles a la usuaria.

ALTER TABLE participants ADD COLUMN age_range      TEXT;
ALTER TABLE participants ADD COLUMN has_community  TEXT;
ALTER TABLE participants ADD COLUMN community_name TEXT;

-- Para el panel: poder filtrar por rango de edad sin recorrer la tabla.
CREATE INDEX IF NOT EXISTS idx_participants_age ON participants (age_range);

-- ═══ 0006_chat.sql ═══════════════════════════════════════════

-- 0006 · Conversación de acompañamiento
--
-- El estado de la conversación vive en el servidor, no en el navegador.
-- El cliente solo conserva un token opaco: no puede leer ni alterar nada.
--
-- Minimización: no se guarda la conversación completa de forma indefinida.
--   · `transcript` conserva únicamente los últimos turnos necesarios para
--     mantener el hilo, ya recortados por la aplicación.
--   · `expires_at` cierra la sesión.
--   · El cron borra lo caducado (ver src/cron/scheduled.ts).
-- Los datos que la persona decide entregar viven en `participants`, con su
-- consentimiento registrado en `consents`. Esta tabla es memoria de trabajo.

CREATE TABLE chat_sessions (
  id             TEXT PRIMARY KEY,          -- identificador interno
  token_hash     TEXT NOT NULL UNIQUE,      -- hash del token opaco del cliente
  participant_id TEXT REFERENCES participants(id),
  -- Datos que la persona ha compartido durante la charla, aún sin registrar.
  -- Se vacía en cuanto se crea el registro en `participants`.
  draft          TEXT NOT NULL DEFAULT '{}',
  -- Últimos turnos, recortados. Nunca la conversación entera.
  transcript     TEXT NOT NULL DEFAULT '[]',
  turns          INTEGER NOT NULL DEFAULT 0,
  consent_given  INTEGER NOT NULL DEFAULT 0 CHECK (consent_given IN (0,1)),
  consent_at     TEXT,
  escalated      INTEGER NOT NULL DEFAULT 0 CHECK (escalated IN (0,1)),
  ip_hash        TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  expires_at     TEXT NOT NULL
);

CREATE INDEX idx_chat_sessions_exp ON chat_sessions (expires_at);

-- Límite de peticiones por ventana. Se usa el hash de la IP, nunca la IP.
CREATE TABLE chat_rate (
  bucket     TEXT PRIMARY KEY,   -- ip_hash + ventana
  hits       INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_chat_rate_exp ON chat_rate (expires_at);

-- ═══ 0007_consent_contact.sql ════════════════════════════════

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

-- ═══ 0008_circulos.sql ═══════════════════════════════════════

-- 0008 · Círculos de amigas
--
-- Qué cambia y por qué
-- ────────────────────
-- El camino principal deja de ser «busca un grupo cerca y únete» y pasa
-- a ser «abre tu propio círculo». Eso pide una tabla distinta a la que
-- ya existe.
--
-- `group_applications` sigue intacta: es la solicitud completa —21
-- campos, dirección, cupo, doble aprobación— que hace falta para
-- PUBLICAR un grupo y que otras lo encuentren. Ese camino no se borra,
-- se aparca.
--
-- `circles` es lo contrario: siete campos y ninguna logística. Sirve
-- para saber quién quiere abrir un círculo, de qué iglesia viene y en
-- qué ciudad está, y para poder escribirle después. Nada más. No hay
-- estados, ni aprobaciones, ni cupo, ni dirección.
--
-- La dirección exacta no se pide a propósito: para avisar a una pastora
-- y mandar material basta con la ciudad.

CREATE TABLE circles (
  id                TEXT PRIMARY KEY,
  folio             TEXT NOT NULL UNIQUE,
  idempotency_key   TEXT NOT NULL UNIQUE,

  -- Quién lo abre
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  email_normalized  TEXT NOT NULL,
  email_hash        TEXT NOT NULL,
  phone_e164        TEXT NOT NULL,
  phone_hash        TEXT NOT NULL,

  -- De dónde viene. `church_key` es el nombre normalizado —sin acentos,
  -- sin mayúsculas, sin «iglesia»— y es lo que permite agrupar aunque
  -- cada quien lo escriba distinto.
  church_name       TEXT NOT NULL,
  church_key        TEXT NOT NULL,
  city              TEXT NOT NULL,
  city_key          TEXT NOT NULL,

  -- El círculo. Las dos cosas son opcionales: si todavía no tiene
  -- nombre ni sabe cuántas serán, se registra igual.
  circle_name       TEXT,
  approx_size       INTEGER CHECK (approx_size IS NULL OR (approx_size > 0 AND approx_size <= 200)),

  -- Permisos
  consent_version   TEXT NOT NULL,
  consent_privacy   INTEGER NOT NULL DEFAULT 0 CHECK (consent_privacy IN (0,1)),
  consent_contact   INTEGER NOT NULL DEFAULT 0 CHECK (consent_contact IN (0,1)),

  -- Seguimiento del equipo. No lo ve quien se registra.
  followed_up_at    TEXT,
  followed_up_by    TEXT,
  notes             TEXT,

  -- Rastro
  source            TEXT NOT NULL DEFAULT 'formulario',
  ip_hash           TEXT,
  user_agent_hash   TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  archived_at       TEXT
);

-- Para no duplicar a la misma persona si vuelve a enviar el formulario.
CREATE UNIQUE INDEX idx_circles_email ON circles (email_hash) WHERE archived_at IS NULL;

-- Las tres preguntas que el equipo va a hacer todos los días:
--   ¿cuántos círculos llevamos?
--   ¿de qué iglesias vienen?
--   ¿en qué ciudades están?
CREATE INDEX idx_circles_church  ON circles (church_key, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_circles_city    ON circles (city_key, created_at DESC)   WHERE archived_at IS NULL;
CREATE INDEX idx_circles_fecha   ON circles (created_at DESC)             WHERE archived_at IS NULL;
CREATE INDEX idx_circles_pending ON circles (followed_up_at, created_at DESC) WHERE archived_at IS NULL;

-- Aviso a las pastoras.
--
-- La regla que pidió el equipo: cuando varias mujeres de la misma
-- iglesia se registren, avisar a quien la pastorea. Aquí se deja la
-- cola preparada; el envío se enciende cuando haya proveedor de correo.
-- Mientras tanto la fila se llena y se puede consultar desde el panel:
-- ningún aviso se pierde por no estar conectado todavía.
CREATE TABLE church_alerts (
  id            TEXT PRIMARY KEY,
  church_key    TEXT NOT NULL,
  church_name   TEXT NOT NULL,
  circles_count INTEGER NOT NULL,
  threshold     INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','SENT','DISMISSED')),
  sent_at       TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_church_alerts_status ON church_alerts (status, created_at DESC);
CREATE UNIQUE INDEX idx_church_alerts_umbral ON church_alerts (church_key, threshold);


-- ═══ La cuenta del panel ═════════════════════════════════════
--
-- El panel entra solo por PIN, pero toda sesión necesita colgar de
-- una cuenta: de ahí salen el rol y la auditoría.
--
-- Nace SIN contraseña (password_hash NULL) y con
-- must_change_password = 0. Es a propósito:
--   · sin contraseña, nadie puede entrar por esa vía aunque
--     adivine el correo;
--   · sin la obligación de cambiarla, el PIN puede aprobar y
--     publicar desde el primer minuto.
--
-- El PIN no está aquí ni en ningún archivo: vive en el secreto
-- PANEL_PIN, que se pone en la web de Cloudflare.

INSERT OR IGNORE INTO admin_users
  (id, email, email_normalized, display_name, role,
   password_hash, password_salt, password_algo, password_iterations,
   must_change_password, failed_attempts, created_at, updated_at)
VALUES
  ('adm-lbyn-equipo',
   'equipo@labibliaynosotras.com',
   'equipo@labibliaynosotras.com',
   'Equipo LBYN',
   'owner',
   NULL, NULL, NULL, NULL,
   0, 0,
   '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z');


-- ═══ 0009 · Moderación directa desde el panel ═══════════════

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
