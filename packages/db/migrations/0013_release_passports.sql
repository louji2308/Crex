-- 0013_release_passports.sql
-- Wave 12: Release Passport per generated asset.
-- Deterministic, explainable summary of verification + integrity + provenance state.
-- No AI-derived fields. Matches the frozen `ReleasePassport` schema contract.
-- Scores are integers 0-100; dimensions map to verificationStatus enums;
-- release_status maps to the RELEASE_STATUS enum (DRAFT | READY | BLOCKED).

CREATE TABLE IF NOT EXISTS release_passports (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  asset_id TEXT NOT NULL REFERENCES generated_assets(id),
  version INTEGER NOT NULL CHECK (version >= 0),
  asset_count INTEGER NOT NULL CHECK (asset_count >= 0),
  claim_count INTEGER NOT NULL CHECK (claim_count >= 0),
  evidence_coverage INTEGER NOT NULL CHECK (evidence_coverage BETWEEN 0 AND 100),
  claim_fidelity INTEGER NOT NULL CHECK (claim_fidelity BETWEEN 0 AND 100),
  numerical_integrity INTEGER NOT NULL CHECK (numerical_integrity BETWEEN 0 AND 100),
  creator_intent_status TEXT NOT NULL
    CHECK (creator_intent_status IN ('PASS', 'REVIEW', 'BLOCK')),
  sponsor_compliance TEXT NOT NULL
    CHECK (sponsor_compliance IN ('PASS', 'REVIEW', 'BLOCK')),
  platform_qa TEXT NOT NULL
    CHECK (platform_qa IN ('PASS', 'REVIEW', 'BLOCK')),
  overall INTEGER NOT NULL CHECK (overall BETWEEN 0 AND 100),
  release_status TEXT NOT NULL
    CHECK (release_status IN ('DRAFT', 'READY', 'BLOCKED')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_release_passports_asset_id ON release_passports(asset_id);
CREATE INDEX IF NOT EXISTS idx_release_passports_project_id ON release_passports(project_id);