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
