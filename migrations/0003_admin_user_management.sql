-- Admin user-management schema: bans, email blacklist, and admin action audit log.

ALTER TABLE users ADD COLUMN banned_until TEXT;
ALTER TABLE users ADD COLUMN banned_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_banned_until ON users(banned_until);

CREATE TABLE IF NOT EXISTS email_blacklist (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_actions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_target_user ON admin_actions(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at DESC);
