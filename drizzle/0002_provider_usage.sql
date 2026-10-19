CREATE TABLE IF NOT EXISTS provider_usage (
  provider_env TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_env, usage_date)
);
