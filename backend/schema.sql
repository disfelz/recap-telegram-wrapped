-- Изоляция данных строго по telegram_user_id.
-- Тексты сообщений и MTProto session strings в D1 никогда не сохраняются.

CREATE TABLE IF NOT EXISTS user_settings (
  telegram_user_id INTEGER PRIMARY KEY,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  hide_chat_names INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_jobs (
  id TEXT PRIMARY KEY,
  telegram_user_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'quick_preview',
  processed_dialogs INTEGER NOT NULL DEFAULT 0,
  total_eligible_dialogs INTEGER NOT NULL DEFAULT 0,
  outgoing_found INTEGER NOT NULL DEFAULT 0,
  flood_wait_until TEXT,
  error_message TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Не более 1 активного или вручную приостановленного сканирования на аккаунт.
-- DROP нужен и при повторном применении схемы к существующей D1.
DROP INDEX IF EXISTS idx_one_active_job_per_user;
CREATE UNIQUE INDEX idx_one_active_job_per_user
ON scan_jobs(telegram_user_id)
WHERE status IN ('queued', 'auth_pending', 'quick_preview', 'scanning', 'paused_flood_wait', 'paused_user');

CREATE TABLE IF NOT EXISTS recap_results (
  telegram_user_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  completion_status TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (telegram_user_id, year)
);

CREATE TABLE IF NOT EXISTS phone_contact_requests (
  telegram_user_id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Только Telegram ID и технические метки визитов. Никаких профилей/контактов.
CREATE TABLE IF NOT EXISTS bot_users (
  telegram_user_id INTEGER PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_source TEXT NOT NULL DEFAULT 'bot'
    CHECK (last_source IN ('bot', 'webapp'))
);

CREATE INDEX IF NOT EXISTS idx_bot_users_first_seen_at ON bot_users(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_bot_users_last_seen_at ON bot_users(last_seen_at);
