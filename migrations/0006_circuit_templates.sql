-- Curated algorithm templates shown in the /templates gallery.
CREATE TABLE IF NOT EXISTS circuit_templates (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('foundations','algorithm','entanglement','games')),
  difficulty   INTEGER NOT NULL CHECK (difficulty IN (1,2,3)),
  circuit      TEXT NOT NULL,
  article_html TEXT NOT NULL,
  published    INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_published ON circuit_templates(published, sort_order);
