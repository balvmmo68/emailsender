ALTER TABLE campaigns ADD COLUMN completed_at INTEGER;
ALTER TABLE campaigns ADD COLUMN last_resent_at INTEGER;
UPDATE campaigns SET completed_at = updated_at WHERE send_status = 'completed' AND completed_at IS NULL;
