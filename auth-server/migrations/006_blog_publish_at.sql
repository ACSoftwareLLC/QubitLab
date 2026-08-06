ALTER TABLE blogs ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

UPDATE blogs SET publish_at = NOW() WHERE publish_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_blogs_publish_at ON blogs(published, publish_at);
