import type {
  AiOutput,
  Claim,
  Constraint,
  Evidence,
  GeneratedAsset,
  GeneratedComponent,
  Project,
  ProvenanceRecord,
  SourceAsset,
  SponsorRequirement,
  TranscriptSegment,
  VerificationFinding,
  VerificationRun,
  WorkflowState,
} from "@crex/schemas";
import type { SourceUpload } from "../src/repositories";

export function isoNow(): string {
  return new Date().toISOString();
}

export const PROJECT_ID = "a0000000-0000-4000-8000-000000000001";
export const ASSET_ID = "a0000000-0000-4000-8000-000000000002";
export const SEGMENT_ID = "a0000000-0000-4000-8000-000000000003";
export const CLAIM_ID = "a0000000-0000-4000-8000-000000000004";
export const EVIDENCE_ID = "a0000000-0000-4000-8000-000000000005";
export const GENERATED_ASSET_ID = "a0000000-0000-4000-8000-000000000006";
export const COMPONENT_ID = "a0000000-0000-4000-8000-000000000007";
export const RUN_ID = "a0000000-0000-4000-8000-000000000008";
export const FINDING_ID = "a0000000-0000-4000-8000-000000000009";
export const WORKFLOW_ID = "a0000000-0000-4000-8000-000000000010";
export const AI_OUTPUT_ID = "a0000000-0000-4000-8000-000000000011";
export const UPLOAD_ID = "a0000000-0000-4000-8000-000000000012";
export const CONSTRAINT_ID = "a0000000-0000-4000-8000-000000000013";
export const SPONSOR_REQUIREMENT_ID = "a0000000-0000-4000-8000-000000000014";
export const PROVENANCE_ID = "a0000000-0000-4000-8000-000000000015";
export const AUDIENCE_PROFILE_ID = "a0000000-0000-4000-8000-000000000016";
export const AUDIENCE_OBSERVATION_ID = "a0000000-0000-4000-8000-000000000017";
export const AUDIENCE_INSIGHT_ID = "a0000000-0000-4000-8000-000000000018";
export const AUDIENCE_RECOMMENDATION_ID = "a0000000-0000-4000-8000-000000000019";

export function makeProject(overrides: Partial<Project> = {}): Project {
  const now = isoNow();
  return {
    id: PROJECT_ID,
    name: "Budget Laptop Review",
    description: "A three-laptop comparison.",
    target_platforms: ["YOUTUBE", "INSTAGRAM"],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeSourceAsset(overrides: Partial<SourceAsset> = {}): SourceAsset {
  const now = isoNow();
  return {
    id: ASSET_ID,
    project_id: PROJECT_ID,
    object_key: "projects/a0000000-0000-4000-8000-000000000001/sources/budget-laptops.mp4",
    file_name: "budget-laptops.mp4",
    file_type: "video/mp4",
    size_bytes: 104857600,
    duration_seconds: 7200,
    checksum: "sha256:0123456789abcdef",
    status: "READY",
    transcription_status: "PENDING",
    analysis_status: "PENDING",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeSourceUpload(overrides: Partial<SourceUpload> = {}): SourceUpload {
  const now = isoNow();
  return {
    id: UPLOAD_ID,
    projectId: PROJECT_ID,
    objectKey: "projects/a0000000-0000-4000-8000-000000000001/uploads/budget-laptops.mp4",
    fileName: "budget-laptops.mp4",
    fileType: "video/mp4",
    status: "UPLOADING",
    error: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeTranscriptSegment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: SEGMENT_ID,
    source_asset_id: ASSET_ID,
    segment_index: 0,
    start_time: 0,
    end_time: 28,
    text: "Welcome back to the budget laptop review.",
    speaker: "host",
    confidence: 0.98,
    created_at: isoNow(),
    ...overrides,
  };
}

export function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: CLAIM_ID,
    project_id: PROJECT_ID,
    segment_id: SEGMENT_ID,
    type: "CLAIM",
    content: "Laptop C delivered the longest battery life in our test.",
    qualifiers: ["in our test"],
    created_at: isoNow(),
    ...overrides,
  };
}

export function makeConstraint(overrides: Partial<Constraint> = {}): Constraint {
  const now = isoNow();
  return {
    id: CONSTRAINT_ID,
    project_id: PROJECT_ID,
    category: "TECHNICAL_NUANCE",
    source: "MANUAL",
    summary: "Preserve the test-specific qualifier in every numerical claim.",
    details: "Do not state battery life as an absolute market claim.",
    enabled: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeSponsorRequirement(
  overrides: Partial<SponsorRequirement> = {},
): SponsorRequirement {
  const now = isoNow();
  return {
    id: SPONSOR_REQUIREMENT_ID,
    project_id: PROJECT_ID,
    sponsor_name: "TechBrand",
    requirement_type: "DISCOUNT_CODE",
    value: "CODE20",
    required: true,
    enabled: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: EVIDENCE_ID,
    claim_id: CLAIM_ID,
    type: "TRANSCRIPT",
    content: "Laptop C reached eleven hours and seven minutes in our battery test.",
    source_range: { start: 523, end: 557 },
    created_at: isoNow(),
    ...overrides,
  };
}

export function makeGeneratedAsset(overrides: Partial<GeneratedAsset> = {}): GeneratedAsset {
  const now = isoNow();
  return {
    id: GENERATED_ASSET_ID,
    project_id: PROJECT_ID,
    asset_type: "YOUTUBE_TITLE",
    title: "I Tested 3 Budget Laptops Which One Should Developers Buy",
    status: "READY",
    integrity: {
      dimensions: {
        evidence_coverage: 100,
        claim_fidelity: 98,
        numerical_accuracy: 100,
        creator_intent: 100,
        sponsor_compliance: 100,
        platform_qa: 97,
      },
      overall: 99,
      reasons: ["verified against the transcript"],
    },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeGeneratedComponent(overrides: Partial<GeneratedComponent> = {}): GeneratedComponent {
  return {
    component_id: COMPONENT_ID,
    asset_id: GENERATED_ASSET_ID,
    content: "I Tested 3 Budget Laptops — Which One Should Developers Buy?",
    source_references: [SEGMENT_ID],
    claim_references: [CLAIM_ID],
    constraint_references: [],
    generation_metadata: { engine: "nvidia", model: "llama3-70b" },
    verification_status: "PASS",
    ...overrides,
  };
}

export function makeVerificationRun(overrides: Partial<VerificationRun> = {}): VerificationRun {
  return {
    id: RUN_ID,
    project_id: PROJECT_ID,
    asset_id: GENERATED_ASSET_ID,
    engine: "deterministic:rules",
    result: "PASS",
    finding_ids: [FINDING_ID],
    started_at: isoNow(),
    completed_at: isoNow(),
    ...overrides,
  };
}

export function makeVerificationFinding(overrides: Partial<VerificationFinding> = {}): VerificationFinding {
  return {
    id: FINDING_ID,
    verification_run_id: RUN_ID,
    type: "SPONSOR_COMPLIANCE",
    severity: "BLOCK",
    reason: "generated claim overstates the verified result",
    asset_id: GENERATED_ASSET_ID,
    component_id: COMPONENT_ID,
    generated_text: "This is the best laptop on the market.",
    source_text: "This is the best laptop in our test.",
    evidence_ranges: [{ start: 523, end: 557 }],
    recommendation: "qualify the claim with the tested scope",
    created_at: isoNow(),
    ...overrides,
  };
}

export function makeAiOutput(overrides: Partial<AiOutput> = {}): AiOutput {
  const now = isoNow();
  return {
    id: AI_OUTPUT_ID,
    task: "SEMANTIC_UNDERSTANDING",
    provider: "nvidia",
    model: "meta/llama-3.3-70b-instruct",
    raw_output: JSON.stringify({ summary: "A laptop comparison review." }),
    normalized: { summary: "A laptop comparison review." },
    schema_version: "0.1.0",
    valid: true,
    validation_errors: [],
    fallback_used: false,
    created_at: now,
    ...overrides,
  };
}

export function makeWorkflowState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  const now = isoNow();
  return {
    id: WORKFLOW_ID,
    project_id: PROJECT_ID,
    workflow_name: "analysis",
    phase: "RUNNING",
    stage: "EVIDENCE_GRAPH",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeProvenanceRecord(overrides: Partial<ProvenanceRecord> = {}): ProvenanceRecord {
  const now = isoNow();
  return {
    id: PROVENANCE_ID,
    project_id: PROJECT_ID,
    asset_id: ASSET_ID,
    asset_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    signing_status: "UNSIGNED",
    verification_status: "UNSIGNED",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}