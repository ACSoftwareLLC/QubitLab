-- Admin role column and session hardening.
-- Replaces the ADMINS env-var matching with an explicit DB flag.
-- Note: sessions are now stored as SHA-256(sessionId); existing plaintext sessions
-- will not validate and force a one-time re-login.

ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0,1));

-- Case-insensitive username uniqueness prevents e.g. Alex/alex impersonation.
-- This will fail to apply if existing rows already collide by case; resolve
-- conflicts manually before running this migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE);
