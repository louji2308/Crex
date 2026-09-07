-- Wave 3: source asset ingestion lifecycle.
-- Rebuilds source_assets to add upload/validation state (status) and media
-- inspection metadata (media), and relaxes transient measurement columns
-- (size_bytes, duration_seconds, checksum) so absence is stored honestly
-- before an object is fully uploaded or inspected.
-- Safe to rebuild: D1 does not enforce foreign keys and the table has no data
-- at migration time (the node:sqlite test harness only ever has empty children).

CREATE TABLE source_assets_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  size_bytes INTEGER,
  duration_seconds REAL,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'UPLOADING'
    CHECK (
      status IN (
        'UPLOADING',
        'UPLOADED',
        'VALIDATING',
        'VALID',
        'INVALID',
        'PROCESSING',
        'READY',
        'FAILED'
      )
    ),
  media TEXT,
  transcription_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (transcription_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  analysis_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (analysis_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO source_assets_new (
  id,
  project_id,
  object_key,
  file_name,
  file_type,
  size_bytes,
  duration_seconds,
  checksum,
  status,
  media,
  transcription_status,
  analysis_status,
  created_at,
  updated_at
)
SELECT
  id,
  project_id,
  object_key,
  file_name,
  file_type,
  size_bytes,
  duration_seconds,
  checksum,
  'UPLOADED',
  NULL,
  transcription_status,
  analysis_status,
  created_at,
  updated_at
FROM source_assets;

DROP TABLE source_assets;

ALTER TABLE source_assets_new RENAME TO source_assets;

CREATE INDEX IF NOT EXISTS idx_source_assets_project_id ON source_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_source_assets_status ON source_assets(status);