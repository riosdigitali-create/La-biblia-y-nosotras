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
