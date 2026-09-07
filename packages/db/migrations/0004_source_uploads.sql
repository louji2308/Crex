-- 0004_source_uploads.sql
-- Wave 4: persistent source upload lifecycle for the ingestion pipeline
-- Tracks each object upload attempt from launch through success or failure

CREATE TABLE IF NOT EXISTS source_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UPLOADING'
    CHECK (status IN ('UPLOADING', 'UPLOADED', 'FAILED')),
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_uploads_project_id ON source_uploads(project_id);