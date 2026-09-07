import { apiErrorSchema, aiOutputSchema, apiResponseSchema } from "./api";
import {
  claimSchema,
  evidenceSchema,
  generatedAssetSchema,
  generatedComponentSchema,
  projectSchema,
  sourceAssetSchema,
  transcriptSegmentSchema,
  verificationFindingSchema,
  verificationRunSchema,
  workflowStateSchema,
} from "./domain";

export const FROZEN_CONTRACTS = [
  "Project",
  "SourceAsset",
  "TranscriptSegment",
  "Claim",
  "Evidence",
  "GeneratedAsset",
  "GeneratedComponent",
  "VerificationRun",
  "VerificationFinding",
  "WorkflowState",
  "APIResponse",
  "AiOutput",
  "ApiError",
] as const;

export const DEFERRED_CONTRACTS = [
  { name: "Constraint", targetWave: "Wave 2" },
  { name: "SponsorRequirement", targetWave: "Wave 2" },
  { name: "RepairAction", targetWave: "Wave 2" },
  { name: "ReleasePassport", targetWave: "Wave 2" },
  { name: "PerformanceObservation", targetWave: "later" },
  { name: "LearningRecord", targetWave: "later" },
] as const;

export const CONTRACTS = {
  Project: projectSchema,
  SourceAsset: sourceAssetSchema,
  TranscriptSegment: transcriptSegmentSchema,
  Claim: claimSchema,
  Evidence: evidenceSchema,
  GeneratedAsset: generatedAssetSchema,
  GeneratedComponent: generatedComponentSchema,
  VerificationRun: verificationRunSchema,
  VerificationFinding: verificationFindingSchema,
  WorkflowState: workflowStateSchema,
  APIResponse: apiResponseSchema,
  AiOutput: aiOutputSchema,
  ApiError: apiErrorSchema,
} as const;