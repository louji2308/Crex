import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  projectSchema,
  sourceAssetSchema,
  transcriptSegmentSchema,
  claimSchema,
  evidenceSchema,
  generatedAssetSchema,
  generatedComponentSchema,
  verificationRunSchema,
  verificationFindingSchema,
  workflowStateSchema,
  apiResponseSchema,
  apiErrorSchema,
  aiOutputSchema,
  createId,
  nowIso,
  toIso,
  VERIFICATION_STATUS,
  type Project,
  type SourceAsset,
  type TranscriptSegment,
  type Claim,
  type Evidence,
  type GeneratedAsset,
  type GeneratedComponent,
  type VerificationRun,
  type VerificationFinding,
  type WorkflowState,
  type ApiResponse,
  type ApiError,
  type AiOutput,
} from "@crex/schemas";

const genericPayload = z.record(z.string(), z.unknown());
const genericApiResponseSchema = apiResponseSchema(genericPayload);

function uniqueLabel(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function projectFixture(overrides: Partial<Project> = {}): Project {
  const stamp = nowIso();
  const base: Project = {
    id: createId(),
    name: `Project ${randomUUID().slice(0, 8)}`,
    description: "Demo project for Wave 1 tests",
    target_platforms: ["YOUTUBE"],
    audience: {
      summary: "developers evaluating provenance tooling",
      interests: ["AI content", "verification"],
    },
    created_at: stamp,
    updated_at: stamp,
  };
  return projectSchema.parse({ ...base, ...overrides });
}

export function sourceAssetFixture(
  overrides: Partial<SourceAsset> = {},
): SourceAsset {
  const source: Project = projectFixture();
  const base: SourceAsset = {
    id: createId(),
    project_id: overrides.project_id ?? source.id,
    object_key: `videos/${randomUUID()}.mp4`,
    file_name: uniqueLabel("source.mp4"),
    file_type: "video/mp4",
    size_bytes: 12_000_000,
    duration_seconds: 720,
    checksum: uniqueLabel("sha256"),
    transcription_status: "PENDING",
    analysis_status: "PENDING",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  return sourceAssetSchema.parse({ ...base, ...overrides });
}

export function transcriptSegmentFixture(
  overrides: Partial<TranscriptSegment> = {},
): TranscriptSegment {
  const base: TranscriptSegment = {
    id: createId(),
    source_asset_id: overrides.source_asset_id ?? createId(),
    segment_index: 0,
    start_time: 0,
    end_time: 28,
    text: uniqueLabel("segment"),
    speaker: "speaker-1",
    confidence: 0.97,
    created_at: nowIso(),
  };
  return transcriptSegmentSchema.parse({ ...base, ...overrides });
}

export function claimFixture(overrides: Partial<Claim> = {}): Claim {
  const base: Claim = {
    id: createId(),
    project_id: overrides.project_id ?? createId(),
    segment_id: overrides.segment_id ?? createId(),
    type: "CLAIM",
    content: uniqueLabel("claim"),
    qualifiers: ["approximately", "reported"],
    created_at: nowIso(),
  };
  return claimSchema.parse({ ...base, ...overrides });
}

export function evidenceFixture(overrides: Partial<Evidence> = {}): Evidence {
  const base: Evidence = {
    id: createId(),
    claim_id: overrides.claim_id ?? createId(),
    type: "TRANSCRIPT",
    content: uniqueLabel("evidence"),
    source_range: { start: 0, end: 28 },
    created_at: nowIso(),
  };
  return evidenceSchema.parse({ ...base, ...overrides });
}

export function integrityFixture(): NonNullable<
  GeneratedAsset["integrity"]
> {
  return {
    dimensions: {
      evidence_coverage: 80,
      claim_fidelity: 90,
      numerical_accuracy: 70,
      creator_intent: 85,
      sponsor_compliance: 95,
      platform_qa: 88,
    },
    overall: 85,
    reasons: ["all six dimensions scored within target ranges"],
  };
}

export function generatedAssetFixture(
  overrides: Partial<GeneratedAsset> = {},
): GeneratedAsset {
  const stamp = nowIso();
  const base: GeneratedAsset = {
    id: createId(),
    project_id: overrides.project_id ?? createId(),
    asset_type: "YOUTUBE_TITLE",
    title: uniqueLabel("asset"),
    status: "READY",
    integrity: integrityFixture(),
    created_at: stamp,
    updated_at: stamp,
  };
  return generatedAssetSchema.parse({ ...base, ...overrides });
}

export function generatedComponentFixture(
  overrides: Partial<GeneratedComponent> = {},
): GeneratedComponent {
  const base: GeneratedComponent = {
    component_id: createId(),
    asset_id: overrides.asset_id ?? createId(),
    content: uniqueLabel("component-content"),
    source_references: [],
    claim_references: [],
    constraint_references: [],
    generation_metadata: {
      engine: "crex-generator-v1",
      model: "nvidia-openai-model",
    },
    verification_status: VERIFICATION_STATUS[0],
  };
  return generatedComponentSchema.parse({ ...base, ...overrides });
}

export function verificationRunFixture(
  overrides: Partial<VerificationRun> = {},
): VerificationRun {
  const base: VerificationRun = {
    id: createId(),
    project_id: overrides.project_id ?? createId(),
    asset_id: overrides.asset_id ?? createId(),
    engine: "crex-verifier-v1",
    result: "PASS",
    finding_ids: [],
    started_at: nowIso(),
    completed_at: nowIso(),
  };
  return verificationRunSchema.parse({ ...base, ...overrides });
}

export function verificationFindingFixture(
  overrides: Partial<VerificationFinding> = {},
): VerificationFinding {
  const base: VerificationFinding = {
    id: createId(),
    verification_run_id: overrides.verification_run_id ?? createId(),
    type: "SCOPE_DRIFT",
    severity: "REVIEW",
    reason: uniqueLabel("finding"),
    asset_id: overrides.asset_id,
    component_id: overrides.component_id,
    generated_text: "shorter version of the original claim",
    source_text: "the original full-length claim",
    evidence_ranges: [{ start: 0, end: 28 }],
    recommendation: "restore the qualifier",
    created_at: nowIso(),
  };
  return verificationFindingSchema.parse({ ...base, ...overrides });
}

export function workflowStateFixture(
  overrides: Partial<WorkflowState> = {},
): WorkflowState {
  const stamp = nowIso();
  const base: WorkflowState = {
    id: createId(),
    project_id: overrides.project_id ?? createId(),
    workflow_name: "crex.source-to-release",
    phase: "QUEUED",
    stage: "SOURCE_INGESTION",
    created_at: stamp,
    updated_at: stamp,
  };
  return workflowStateSchema.parse({ ...base, ...overrides });
}

export function apiOkFixture(payload: Record<string, unknown>): ApiResponse<Record<string, unknown>> {
  return genericApiResponseSchema.parse({
    success: true,
    payload,
    request_id: createId(),
  });
}

export function apiErrFixture(overrides: Partial<ApiError> = {}): ApiError {
  const base: ApiError = {
    code: "INTERNAL_ERROR",
    message: "unexpected failure",
  };
  return apiErrorSchema.parse({ ...base, ...overrides });
}

export function aiOutputFixture(overrides: Partial<AiOutput> = {}): AiOutput {
  const base: AiOutput = {
    id: createId(),
    task: "CLAIM_EXTRACTION",
    provider: "nvidia",
    model: "nvidia-integrated-nim",
    raw_output: JSON.stringify({ claims: [] }),
    normalized: { claims: [] },
    schema_version: "0.1.0",
    valid: true,
    validation_errors: [],
    fallback_used: false,
    created_at: nowIso(),
  };
  return aiOutputSchema.parse({ ...base, ...overrides });
}

export { toIso };