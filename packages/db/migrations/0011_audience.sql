-- 0011_audience.sql
-- Wave 14: audience context + learning
-- Stores audience profiles, observations, insights, and recommendations

CREATE TABLE IF NOT EXISTS audience_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  facts_json TEXT NOT NULL DEFAULT '{}',
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audience_profiles_project_id ON audience_profiles(project_id);

CREATE TABLE IF NOT EXISTS audience_observations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  metric TEXT NOT NULL
    CHECK (metric IN (
      'AGE_RANGE', 'KNOWLEDGE_LEVEL', 'INTERESTS', 'RISK_TOLERANCE',
      'PURCHASE_AUTHORITY', 'CONTENT_FORMAT_PREFERENCE', 'ENGAGEMENT_PATTERN', 'BUYING_STAGE'
    )),
  value TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_asset_id TEXT,
  source TEXT NOT NULL
    CHECK (source IN ('CREATOR_DECLARED', 'OBSERVED', 'INFERRED')),
  dedupe_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audience_observations_dedupe ON audience_observations(project_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_audience_observations_project_id ON audience_observations(project_id);

CREATE TABLE IF NOT EXISTS audience_insights (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL
    CHECK (type IN ('AGGREGATED_PROFILE', 'COMPLEMENTARY_AUDIENCE', 'DIVERGENCE', 'GAP', 'DATA_INSUFFICIENT')),
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  sample_size INTEGER NOT NULL CHECK (sample_size >= 0),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audience_insights_project_id ON audience_insights(project_id);

CREATE TABLE IF NOT EXISTS audience_recommendations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL
    CHECK (type IN ('EXPAND', 'NARROW', 'REFRAME', 'SPLIT', 'ACKNOWLEDGE_LIMITS')),
  base TEXT NOT NULL
    CHECK (base IN ('DETERMINISTIC', 'AI_INTERPRETATION', 'COMBINED')),
  statement TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  limitations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audience_recommendations_project_id ON audience_recommendations(project_id);
