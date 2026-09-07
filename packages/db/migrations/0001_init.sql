CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_platforms TEXT NOT NULL,
  audience TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  duration_seconds REAL NOT NULL,
  checksum TEXT NOT NULL,
  transcription_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (transcription_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  analysis_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (analysis_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  source_asset_id TEXT NOT NULL REFERENCES source_assets(id),
  segment_index INTEGER NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  text TEXT NOT NULL,
  speaker TEXT,
  confidence REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  segment_id TEXT NOT NULL REFERENCES transcript_segments(id),
  type TEXT NOT NULL CHECK (type IN ('CLAIM', 'OPINION', 'RECOMMENDATION', 'NUMERICAL')),
  content TEXT NOT NULL,
  qualifiers TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  type TEXT NOT NULL CHECK (type IN ('TRANSCRIPT', 'NUMERICAL', 'SOURCE_VIDEO')),
  content TEXT NOT NULL,
  source_range TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generated_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  asset_type TEXT NOT NULL
    CHECK (
      asset_type IN (
        'YOUTUBE_TITLE',
        'YOUTUBE_DESCRIPTION',
        'YOUTUBE_CHAPTERS',
        'SHORT',
        'REEL',
        'TIKTOK',
        'SOCIAL_POST',
        'PINNED_COMMENT',
        'THUMBNAIL_CONCEPT'
      )
    ),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('READY', 'REVIEW', 'BLOCK')),
  integrity TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generated_components (
  component_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES generated_assets(id),
  content TEXT NOT NULL,
  source_references TEXT NOT NULL,
  claim_references TEXT NOT NULL,
  constraint_references TEXT NOT NULL,
  generation_metadata TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('PASS', 'REVIEW', 'BLOCK'))
);

CREATE TABLE IF NOT EXISTS verification_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  asset_id TEXT NOT NULL REFERENCES generated_assets(id),
  engine TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('PASS', 'REVIEW', 'BLOCK')),
  finding_ids TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS verification_findings (
  id TEXT PRIMARY KEY,
  verification_run_id TEXT NOT NULL REFERENCES verification_runs(id),
  type TEXT NOT NULL
    CHECK (
      type IN (
        'SCOPE_DRIFT',
        'CERTAINTY_DRIFT',
        'CONTEXT_REMOVAL',
        'NUMERICAL_DRIFT',
        'ATTRIBUTION_DRIFT',
        'SPONSOR_COMPLIANCE',
        'CREATOR_INTENT',
        'PLATFORM_QA'
      )
    ),
  severity TEXT NOT NULL CHECK (severity IN ('PASS', 'REVIEW', 'BLOCK')),
  reason TEXT NOT NULL,
  asset_id TEXT REFERENCES generated_assets(id),
  component_id TEXT REFERENCES generated_components(component_id),
  generated_text TEXT,
  source_text TEXT,
  evidence_ranges TEXT NOT NULL,
  recommendation TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_state (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  workflow_name TEXT NOT NULL,
  phase TEXT NOT NULL
    CHECK (phase IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  stage TEXT NOT NULL
    CHECK (
      stage IN (
        'SOURCE_INGESTION',
        'TRANSCRIPTION',
        'CONTENT_UNDERSTANDING',
        'EVIDENCE_GRAPH',
        'GENERATION',
        'VERIFICATION',
        'REPAIR',
        'REVERIFICATION',
        'RELEASE'
      )
    ),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_assets_project_id ON source_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_source_asset_id ON transcript_segments(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_asset_index ON transcript_segments(source_asset_id, segment_index);
CREATE INDEX IF NOT EXISTS idx_claims_project_id ON claims(project_id);
CREATE INDEX IF NOT EXISTS idx_claims_segment_id ON claims(segment_id);
CREATE INDEX IF NOT EXISTS idx_evidence_claim_id ON evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_project_id ON generated_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_components_asset_id ON generated_components(asset_id);
CREATE INDEX IF NOT EXISTS idx_verification_runs_project_id ON verification_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_verification_runs_asset_id ON verification_runs(asset_id);
CREATE INDEX IF NOT EXISTS idx_verification_findings_run_id ON verification_findings(verification_run_id);
CREATE INDEX IF NOT EXISTS idx_verification_findings_asset_id ON verification_findings(asset_id);
CREATE INDEX IF NOT EXISTS idx_verification_findings_component_id ON verification_findings(component_id);
CREATE INDEX IF NOT EXISTS idx_workflow_state_project_id ON workflow_state(project_id);