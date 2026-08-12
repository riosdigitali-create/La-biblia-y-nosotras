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
