-- Initial D1 schema for QubitLab (mirrors the original Postgres migrations).
-- Type mapping:
--   UUID      -> TEXT
--   JSONB     -> TEXT
--   TIMESTAMPTZ -> TEXT (ISO 8601 UTC)
--   BOOLEAN   -> INTEGER (0/1)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  bio TEXT,
  pfp_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS circuits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  circuit TEXT NOT NULL,
  thumbnail_key TEXT,
  shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_circuits_user_id ON circuits(user_id);
CREATE INDEX IF NOT EXISTS idx_circuits_updated_at ON circuits(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuits_shared ON circuits(shared, updated_at DESC);

CREATE TABLE IF NOT EXISTS blogs (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published INTEGER NOT NULL DEFAULT 1,
  publish_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blogs_published ON blogs(published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs(slug);
CREATE INDEX IF NOT EXISTS idx_blogs_user_id ON blogs(user_id);
CREATE INDEX IF NOT EXISTS idx_blogs_publish_at ON blogs(published, publish_at);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
