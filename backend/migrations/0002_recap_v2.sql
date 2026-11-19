-- Run this migration ONCE on the existing D1 database before deploying v2.
ALTER TABLE scan_jobs ADD COLUMN notified_at TEXT;
CREATE TABLE IF NOT EXISTS phone_contact_requests (
  telegram_user_id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
