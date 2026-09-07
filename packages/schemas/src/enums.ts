import { z } from "zod";

export const VERIFICATION_STATUS = ["PASS", "REVIEW", "BLOCK"] as const;

export const ASSET_STATUS = ["READY", "REVIEW", "BLOCK"] as const;

export const WORKFLOW_PHASE = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export const GENERATION_STAGE = [
  "SOURCE_INGESTION",
  "TRANSCRIPTION",
  "CONTENT_UNDERSTANDING",
  "EVIDENCE_GRAPH",
  "GENERATION",
  "VERIFICATION",
  "REPAIR",
  "REVERIFICATION",
  "RELEASE",
] as const;

export const CLAIM_TYPE = ["CLAIM", "OPINION", "RECOMMENDATION", "NUMERICAL"] as const;

export const EVIDENCE_TYPE = ["TRANSCRIPT", "NUMERICAL", "SOURCE_VIDEO"] as const;

export const SOURCE_STATUS = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;

export const ASSET_TYPE = [
  "YOUTUBE_TITLE",
  "YOUTUBE_DESCRIPTION",
  "YOUTUBE_CHAPTERS",
  "SHORT",
  "REEL",
  "TIKTOK",
  "SOCIAL_POST",
  "PINNED_COMMENT",
  "THUMBNAIL_CONCEPT",
] as const;

export const PLATFORM = ["YOUTUBE", "INSTAGRAM", "TIKTOK", "OTHER"] as const;

export const FINDING_TYPE = [
  "SCOPE_DRIFT",
  "CERTAINTY_DRIFT",
  "CONTEXT_REMOVAL",
  "NUMERICAL_DRIFT",
  "ATTRIBUTION_DRIFT",
  "SPONSOR_COMPLIANCE",
  "CREATOR_INTENT",
  "PLATFORM_QA",
] as const;

export const AI_TASK = [
  "SEMANTIC_UNDERSTANDING",
  "CLAIM_EXTRACTION",
  "ASSET_GENERATION",
  "SEMANTIC_COMPARISON",
  "REPAIR_SUGGESTION",
] as const;

export const verificationStatusSchema = z.enum(VERIFICATION_STATUS);

export const assetStatusSchema = z.enum(ASSET_STATUS);

export const workflowPhaseSchema = z.enum(WORKFLOW_PHASE);

export const generationStageSchema = z.enum(GENERATION_STAGE);

export const claimTypeSchema = z.enum(CLAIM_TYPE);

export const evidenceTypeSchema = z.enum(EVIDENCE_TYPE);

export const sourceStatusSchema = z.enum(SOURCE_STATUS);

export const assetTypeSchema = z.enum(ASSET_TYPE);

export const platformSchema = z.enum(PLATFORM);

export const findingTypeSchema = z.enum(FINDING_TYPE);

export const aiTaskSchema = z.enum(AI_TASK);