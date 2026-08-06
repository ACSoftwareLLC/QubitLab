-- Add email to users, track circuit sharing time, and add a generic rate-limit event log.

ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

ALTER TABLE circuits ADD COLUMN shared_at TEXT;
UPDATE circuits SET shared_at = updated_at WHERE shared = 1;

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_user_action_created ON rate_limit_events(user_id, action, created_at);
