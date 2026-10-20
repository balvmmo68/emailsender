ALTER TABLE campaigns ADD COLUMN active_provider_env TEXT;
ALTER TABLE campaigns ADD COLUMN provider_failure_env TEXT;
ALTER TABLE campaigns ADD COLUMN provider_failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN provider_failure_start_cursor INTEGER;
