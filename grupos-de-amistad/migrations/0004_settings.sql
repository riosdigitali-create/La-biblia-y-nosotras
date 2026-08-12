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
