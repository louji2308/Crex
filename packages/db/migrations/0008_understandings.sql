-- 0008_understandings.sql
-- Wave 4: video understanding pipeline
-- Persists the understanding artifact linking a SourceAsset to its
-- transcribed media, semantic sections, and extracted claims.

CREATE TABLE IF NOT EXISTS understandings (
  id TEXT PRIMARY KEY NOT NULL,
  source_asset_id TEXT NOT NULL REFERENCES source_assets(id),
  status TEXT NOT NULL
    CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
  media_metadata_json TEXT NOT NULL
    CHECK (json_valid(media_metadata_json)),
  transcript_id TEXT REFERENCES transcripts(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_understandings_source_asset_id ON understandings(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_understandings_status ON understandings(status);