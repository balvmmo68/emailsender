CREATE TABLE IF NOT EXISTS provider_error_logs (
  id TEXT PRIMARY KEY NOT NULL,
  provider_env TEXT NOT NULL,
  operation TEXT NOT NULL,
  recipient TEXT,
  error_message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS provider_error_logs_created_idx ON provider_error_logs(created_at);
