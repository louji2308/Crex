-- 0007_transcripts.sql
-- Wave 4: video understanding pipeline
-- Canonical transcript entity linking a SourceAsset to its
-- provider, model, and timestamped segments.

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY NOT NULL,
  source_asset_id TEXT NOT NULL REFERENCES source_assets(id),
  language TEXT NOT NULL DEFAULT 'en',
  duration_seconds REAL NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  fallback_used INTEGER NOT NULL
    CHECK (fallback_used IN (0, 1)),
  status TEXT NOT NULL
    CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transcripts_source_asset_id ON transcripts(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_provider ON transcripts(provider);
CREATE INDEX IF NOT EXISTS idx_transcripts_status ON transcripts(status);