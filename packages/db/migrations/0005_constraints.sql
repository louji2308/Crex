-- 0005_constraints.sql
-- Wave 6: creator intent contract (constraints derived from the brief)
-- Persists manually stated and inferred creator constraints per project

CREATE TABLE IF NOT EXISTS constraints (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  category TEXT NOT NULL
    CHECK (category IN ('TONE', 'TARGET_AUDIENCE', 'ABSOLUTE_CLAIM_BAN', 'TECHNICAL_NUANCE', 'CLICKBAIT_BAN', 'TITLE_STYLE', 'OTHER')),
  source TEXT NOT NULL
    CHECK (source IN ('MANUAL', 'INFERRED')),
  summary TEXT NOT NULL,
  details TEXT,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_constraints_project_id ON constraints(project_id);