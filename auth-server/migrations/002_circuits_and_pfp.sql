ALTER TABLE users ADD COLUMN IF NOT EXISTS pfp_key TEXT;

CREATE TABLE IF NOT EXISTS circuits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  circuit JSONB NOT NULL,
  thumbnail_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_circuits_user_id ON circuits(user_id);
CREATE INDEX IF NOT EXISTS idx_circuits_updated_at ON circuits(updated_at DESC);
