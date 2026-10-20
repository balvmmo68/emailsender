ALTER TABLE campaigns ADD COLUMN send_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE campaigns ADD COLUMN send_cursor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN send_error TEXT;
ALTER TABLE campaigns ADD COLUMN pending_provider_env TEXT;
ALTER TABLE campaigns ADD COLUMN provider_switch_after INTEGER;
ALTER TABLE recipients ADD COLUMN provider_env TEXT;
