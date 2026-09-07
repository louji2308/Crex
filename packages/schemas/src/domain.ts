import { z } from "zod";
import { isoDateTimeSchema, scoreSchema, sourceRangeSchema, uuidSchema } from "./primitives";
import {
  assetStatusSchema,
  assetTypeSchema,
  claimTypeSchema,
  constraintCategorySchema,
  constraintSourceSchema,
  evidenceTypeSchema,
  findingTypeSchema,
  generationStageSchema,
  platformSchema,
  releaseStatusSchema,
  repairStatusSchema,
  sourceStatusSchema,
  sponsorRequirementTypeSchema,
  verificationStatusSchema,
  workflowPhaseSchema,
} from "./enums";

export const projectSchema = z.strictObject({
  id: uuidSchema,
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  target_platforms: z.array(platformSchema).min(1),
  audience: z
    .strictObject({
      summary: z.string().min(1),
      interests: z.array(z.string().min(1)),
    })
    .optional(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type Project = z.infer<typeof projectSchema>;

export const sourceAssetSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  object_key: z.string().min(1),
  file_name: z.string().min(1),
  file_type: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  duration_seconds: z.number().nonnegative(),
  checksum: z.string().min(1),
  transcription_status: sourceStatusSchema,
  analysis_status: sourceStatusSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type SourceAsset = z.infer<typeof sourceAssetSchema>;

export const transcriptSegmentSchema = z
  .strictObject({
    id: uuidSchema,
    source_asset_id: uuidSchema,
    segment_index: z.number().int().nonnegative(),
    start_time: z.number().nonnegative(),
    end_time: z.number().nonnegative(),
    text: z.string().min(1),
    speaker: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    created_at: isoDateTimeSchema,
  })
  .superRefine((segment, ctx) => {
    if (segment.start_time > segment.end_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_time"],
        message: "end_time must not precede start_time",
      });
    }
  });

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const claimSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  segment_id: uuidSchema,
  type: claimTypeSchema,
  content: z.string().min(1),
  qualifiers: z.array(z.string().min(1)),
  created_at: isoDateTimeSchema,
});

export type Claim = z.infer<typeof claimSchema>;

export const evidenceSchema = z.strictObject({
  id: uuidSchema,
  claim_id: uuidSchema,
  type: evidenceTypeSchema,
  content: z.string().min(1),
  source_range: sourceRangeSchema.optional(),
  created_at: isoDateTimeSchema,
});

export type Evidence = z.infer<typeof evidenceSchema>;

export const integrityScoreSchema = z.strictObject({
  dimensions: z.strictObject({
    evidence_coverage: scoreSchema,
    claim_fidelity: scoreSchema,
    numerical_accuracy: scoreSchema,
    creator_intent: scoreSchema,
    sponsor_compliance: scoreSchema,
    platform_qa: scoreSchema,
  }),
  overall: scoreSchema,
  reasons: z.array(z.string().min(1)).min(1),
});

export type IntegrityScore = z.infer<typeof integrityScoreSchema>;

export const generatedAssetSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  asset_type: assetTypeSchema,
  title: z.string().min(1),
  status: assetStatusSchema,
  integrity: integrityScoreSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type GeneratedAsset = z.infer<typeof generatedAssetSchema>;

export const generationMetadataSchema = z.strictObject({
  engine: z.string().min(1),
  model: z.string().min(1).optional(),
});

export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;

export const generatedComponentSchema = z.strictObject({
  component_id: uuidSchema,
  asset_id: uuidSchema,
  content: z.string().min(1),
  source_references: z.array(uuidSchema),
  claim_references: z.array(uuidSchema),
  constraint_references: z.array(uuidSchema),
  generation_metadata: generationMetadataSchema,
  verification_status: verificationStatusSchema,
});

export type GeneratedComponent = z.infer<typeof generatedComponentSchema>;

export const verificationRunSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  asset_id: uuidSchema,
  engine: z.string().min(1),
  result: verificationStatusSchema,
  finding_ids: z.array(uuidSchema),
  started_at: isoDateTimeSchema,
  completed_at: isoDateTimeSchema.optional(),
});

export type VerificationRun = z.infer<typeof verificationRunSchema>;

export const verificationFindingSchema = z.strictObject({
  id: uuidSchema,
  verification_run_id: uuidSchema,
  type: findingTypeSchema,
  severity: verificationStatusSchema,
  reason: z.string().min(1),
  asset_id: uuidSchema.optional(),
  component_id: uuidSchema.optional(),
  generated_text: z.string().min(1).optional(),
  source_text: z.string().min(1).optional(),
  evidence_ranges: z.array(sourceRangeSchema),
  recommendation: z.string().min(1).optional(),
  created_at: isoDateTimeSchema,
});

export type VerificationFinding = z.infer<typeof verificationFindingSchema>;

export const workflowStateSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  workflow_name: z.string().min(1),
  phase: workflowPhaseSchema,
  stage: generationStageSchema,
  error: z.string().min(1).optional(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  completed_at: isoDateTimeSchema.optional(),
});

export type WorkflowState = z.infer<typeof workflowStateSchema>;

export const constraintSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  category: constraintCategorySchema,
  source: constraintSourceSchema,
  summary: z.string().min(1),
  details: z.string().min(1).optional(),
  enabled: z.boolean(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type Constraint = z.infer<typeof constraintSchema>;

export const sponsorRequirementSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  sponsor_name: z.string().min(1),
  requirement_type: sponsorRequirementTypeSchema,
  value: z.string().min(1),
  required: z.boolean(),
  timing: z.string().min(1).optional(),
  enabled: z.boolean(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type SponsorRequirement = z.infer<typeof sponsorRequirementSchema>;

export const repairActionSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  finding_id: uuidSchema,
  asset_id: uuidSchema,
  component_id: uuidSchema.optional(),
  status: repairStatusSchema,
  original_text: z.string(),
  repaired_text: z.string().min(1),
  source_references: z.array(uuidSchema),
  constraint_references: z.array(uuidSchema),
  engine: z.string().min(1),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type RepairAction = z.infer<typeof repairActionSchema>;

export const releasePassportSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  asset_id: uuidSchema,
  version: z.number().int().nonnegative(),
  asset_count: z.number().int().nonnegative(),
  claim_count: z.number().int().nonnegative(),
  evidence_coverage: scoreSchema,
  claim_fidelity: scoreSchema,
  numerical_integrity: scoreSchema,
  creator_intent_status: verificationStatusSchema,
  sponsor_compliance: verificationStatusSchema,
  platform_qa: verificationStatusSchema,
  overall: scoreSchema,
  release_status: releaseStatusSchema,
  created_at: isoDateTimeSchema,
});

export type ReleasePassport = z.infer<typeof releasePassportSchema>;