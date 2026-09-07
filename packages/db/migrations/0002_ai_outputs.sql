CREATE TABLE IF NOT EXISTS ai_outputs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  task TEXT NOT NULL
    CHECK (task IN ('SEMANTIC_UNDERSTANDING', 'CLAIM_EXTRACTION', 'ASSET_GENERATION', 'SEMANTIC_COMPARISON', 'REPAIR_SUGGESTION')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  raw_output TEXT NOT NULL,
  normalized TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
  validation_errors TEXT NOT NULL,
  fallback_used INTEGER NOT NULL CHECK (fallback_used IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_outputs_project ON ai_outputs (project_id, created_at);