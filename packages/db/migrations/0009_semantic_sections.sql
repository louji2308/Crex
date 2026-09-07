-- 0008_semantic_sections.sql
-- Wave 4: video understanding pipeline
-- Higher-level semantic sections extracted from the transcript,
-- each linked to the underlying transcript segment IDs.

CREATE TABLE IF NOT EXISTS semantic_sections (
  id TEXT PRIMARY KEY NOT NULL,
  understanding_id TEXT NOT NULL REFERENCES understandings(id),
  type TEXT NOT NULL
    CHECK (type IN ('hook', 'introduction', 'explanation', 'demonstration', 'comparison', 'result', 'conclusion', 'call-to-action')),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  title TEXT NOT NULL,
  transcript_segment_ids TEXT NOT NULL
    CHECK (json_valid(transcript_segment_ids)),
  summary TEXT,
  confidence REAL
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_semantic_sections_understanding_id ON semantic_sections(understanding_id);
CREATE INDEX IF NOT EXISTS idx_semantic_sections_type ON semantic_sections(type);
CREATE INDEX IF NOT EXISTS idx_semantic_sections_start_end ON semantic_sections(start_ms, end_ms);