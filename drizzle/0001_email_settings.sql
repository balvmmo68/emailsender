CREATE TABLE IF NOT EXISTS email_settings (
  id INTEGER PRIMARY KEY NOT NULL,
  delay_seconds INTEGER NOT NULL DEFAULT 10,
  daily_limit INTEGER NOT NULL DEFAULT 100,
  provider_limits_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO email_settings (id, delay_seconds, daily_limit, updated_at)
VALUES (1, 10, 100, unixepoch() * 1000);
