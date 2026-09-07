-- 0010_provenance.sql
-- Wave 13: C2PA provenance records per asset
-- Stores signing status, verification status, and optional embedded C2PA manifest

CREATE TABLE IF NOT EXISTS provenance_records (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  asset_id TEXT NOT NULL,
  asset_sha256 TEXT NOT NULL,
  signing_status TEXT NOT NULL
    CHECK (signing_status IN ('UNSIGNED', 'SIGNING', 'SIGNED', 'FAILED')),
  verification_status TEXT NOT NULL
    CHECK (verification_status IN ('VALID', 'INVALID', 'UNSIGNED', 'UNTRUSTED', 'MISSING')),
  c2pa_manifest_json TEXT,
  c2pa_signer_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provenance_records_asset_id ON provenance_records(asset_id);
CREATE INDEX IF NOT EXISTS idx_provenance_records_project_id ON provenance_records(project_id);
