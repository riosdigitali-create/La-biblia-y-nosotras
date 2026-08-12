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
