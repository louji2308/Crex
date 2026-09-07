-- 0006_sponsor_requirements.sql
-- Wave 7: sponsor contract (requirements extracted from the sponsor brief)
-- Persists required phrases, disclosures, codes, URLs, and timing obligations

CREATE TABLE IF NOT EXISTS sponsor_requirements (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  sponsor_name TEXT NOT NULL,
  requirement_type TEXT NOT NULL
    CHECK (requirement_type IN ('REQUIRED_PHRASE', 'DISCLOSURE', 'DISCOUNT_CODE', 'REQUIRED_URL', 'MUST_NOT_CLAIM', 'TIMING')),
  value TEXT NOT NULL,
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  timing TEXT,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsor_requirements_project_id ON sponsor_requirements(project_id);