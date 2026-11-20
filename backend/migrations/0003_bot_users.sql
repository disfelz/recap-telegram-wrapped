-- Apply to the existing production D1 database BEFORE deploying the Worker.
-- Safe to re-run: no existing user data is dropped.
CREATE TABLE IF NOT EXISTS bot_users (
  telegram_user_id INTEGER PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_source TEXT NOT NULL DEFAULT 'bot'
    CHECK (last_source IN ('bot', 'webapp'))
);

CREATE INDEX IF NOT EXISTS idx_bot_users_first_seen_at ON bot_users(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_bot_users_last_seen_at ON bot_users(last_seen_at);
