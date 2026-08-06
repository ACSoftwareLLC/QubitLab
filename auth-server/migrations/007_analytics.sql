CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  device TEXT,
  device_type TEXT,
  country TEXT,
  timezone TEXT,
  language TEXT,
  referrer TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_path ON analytics_events(path);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_hash ON analytics_events(session_hash);
CREATE INDEX IF NOT EXISTS idx_analytics_events_browser ON analytics_events(browser);
CREATE INDEX IF NOT EXISTS idx_analytics_events_country ON analytics_events(country);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timezone ON analytics_events(timezone);
CREATE INDEX IF NOT EXISTS idx_analytics_events_language ON analytics_events(language);
