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
