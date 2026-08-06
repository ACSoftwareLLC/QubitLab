ALTER TABLE circuits ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_circuits_shared ON circuits(shared, updated_at DESC);
