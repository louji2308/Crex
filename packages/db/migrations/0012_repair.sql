-- 0012_repair.sql
-- Wave 10/11: deterministic repair engine + re-verification
-- Stores machine-readable, evidence-aware repair actions produced from verification findings.

CREATE TABLE IF NOT EXISTS repair_actions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  finding_id TEXT NOT NULL REFERENCES verification_findings(id),
  asset_id TEXT NOT NULL REFERENCES generated_assets(id),
  component_id TEXT REFERENCES generated_components(component_id),
  status TEXT NOT NULL CHECK (status IN ('PROPOSED', 'APPLIED', 'REJECTED')),
  original_text TEXT NOT NULL,
  repaired_text TEXT NOT NULL,
  source_references TEXT NOT NULL DEFAULT '[]',
  constraint_references TEXT NOT NULL DEFAULT '[]',
  engine TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_actions_asset_id ON repair_actions(asset_id);
CREATE INDEX IF NOT EXISTS idx_repair_actions_finding_id ON repair_actions(finding_id);