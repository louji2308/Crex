import {
  createId,
  nowIso,
  type AiOutput,
  type ApiError,
  type ApiResponse,
  type Claim,
  type Constraint,
  type Evidence,
  type GeneratedAsset,
  type GeneratedComponent,
  type Project,
  type ReleasePassport,
  type RepairAction,
  type SourceAsset,
  type SponsorRequirement,
  type TranscriptSegment,
  type VerificationFinding,
  type VerificationRun,
  type WorkflowState,
} from "../src/index";

export function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  delete copy[key];
  return copy as unknown as Omit<T, K>;
}

export function validProject(): Project {
  return {
    id: createId(),
    name: "Budget Laptop Review",
    target_platforms: ["YOUTUBE", "TIKTOK"],
    audience: {
      summary: "Developers researching budget laptops.",
      interests: ["battery performance", "developer workflow"],
    },
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function validSourceAsset(): SourceAsset {
  return {
    id: createId(),
    project_id: createId(),
    object_key: `sources/${createId()}.mp4`,
    file_name: "budget-laptop-review.mp4",
    file_type: "video/mp4",
    size_bytes: 52428800,
    duration_seconds: 720,
    checksum: "a".repeat(64),
    status: "READY",
    media: {
      container: "mp4",
      video: { codec: "h264", width: 1920, height: 1080 },
      audio: { codec: "aac" },
    },
    transcription_status: "COMPLETED",
    analysis_status: "COMPLETED",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function validTranscriptSegment(): TranscriptSegment {
  return {
    id: createId(),
    source_asset_id: createId(),
    segment_index: 1,
    start_time: 30.5,
    end_time: 58.2,
    text: "Laptop C reached eleven hours and seven minutes in our battery test.",
    speaker: "Alex",
    confidence: 0.982,
    created_at: nowIso(),
  };
}

export function validClaim(): Claim {
  return {
    id: createId(),
    project_id: createId(),
    segment_id: createId(),
    type: "CLAIM",
    content: "Laptop C lasted longest in our battery test.",
    qualifiers: ["in our test"],
    created_at: nowIso(),
  };
}

export function validEvidence(): Evidence {
  return {
    id: createId(),
    claim_id: createId(),
    type: "TRANSCRIPT",
    content: "Laptop C reached eleven hours and seven minutes in our battery test.",
    source_range: { start: 523, end: 557 },
    created_at: nowIso(),
  };
}

export function validGeneratedAsset(): GeneratedAsset {
  return {
    id: createId(),
    project_id: createId(),
    asset_type: "YOUTUBE_TITLE",
    title: "I Tested 3 Budget Laptops",
    status: "READY",
    integrity: {
      dimensions: {
        evidence_coverage: 100,
        claim_fidelity: 98,
        numerical_accuracy: 100,
        creator_intent: 96,
        sponsor_compliance: 100,
        platform_qa: 97,
      },
      overall: 98,
      reasons: ["All factual statements mapped to source evidence."],
    },
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function validGeneratedComponent(): GeneratedComponent {
  return {
    component_id: createId(),
    asset_id: createId(),
    content: "Laptop C delivered the longest battery life in our test.",
    source_references: [createId(), createId()],
    claim_references: [createId()],
    constraint_references: [],
    generation_metadata: { engine: "gemini", model: "gemini-3.7-flash" },
    verification_status: "PASS",
  };
}

export function validVerificationRun(): VerificationRun {
  return {
    id: createId(),
    project_id: createId(),
    asset_id: createId(),
    engine: "semantic",
    result: "REVIEW",
    finding_ids: [createId()],
    started_at: nowIso(),
    completed_at: nowIso(),
  };
}

export function validVerificationFinding(): VerificationFinding {
  return {
    id: createId(),
    verification_run_id: createId(),
    type: "SCOPE_DRIFT",
    severity: "BLOCK",
    reason: "scope inflation",
    asset_id: createId(),
    component_id: createId(),
    generated_text: "Best laptop on the market.",
    source_text: "Best laptop in our test.",
    evidence_ranges: [{ start: 523, end: 557 }],
    recommendation: "Restore the test-specific qualifier.",
    created_at: nowIso(),
  };
}

export function validWorkflowState(): WorkflowState {
  return {
    id: createId(),
    project_id: createId(),
    workflow_name: "asset_generation",
    phase: "RUNNING",
    stage: "GENERATION",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function validApiError(): ApiError {
  return {
    code: "INVALID_INPUT",
    message: "The request body did not match the expected contract.",
    details: { violations: 1 },
    retryable: false,
  };
}

export function validApiResponse(): ApiResponse<Project> {
  return {
    success: true,
    payload: validProject(),
    request_id: createId(),
  };
}

export function validAiOutput(): AiOutput {
  return {
    id: createId(),
    task: "CLAIM_EXTRACTION",
    provider: "gemini",
    model: "gemini-3.7-flash",
    raw_output: '{"claims":[]}',
    normalized: { claims: [] },
    schema_version: "0.1.0",
    valid: true,
    validation_errors: [],
    fallback_used: false,
    created_at: nowIso(),
  };
}

export function validConstraint(): Constraint {
  return {
    id: createId(),
    project_id: createId(),
    category: "TECHNICAL_NUANCE",
    source: "MANUAL",
    summary: "Preserve the test-specific qualifier in every numerical claim.",
    details: "Do not state battery life as an absolute market claim.",
    enabled: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function validSponsorRequirement(): SponsorRequirement {
  return {
    id: createId(),
    project_id: createId(),
    sponsor_name: "TechBrand",
    requirement_type: "DISCOUNT_CODE",
    value: "CODE20",
    required: true,
    enabled: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function validRepairAction(): RepairAction {
  return {
    id: createId(),
    project_id: createId(),
    finding_id: createId(),
    asset_id: createId(),
    component_id: createId(),
    status: "PROPOSED",
    original_text: "Best laptop on the market.",
    repaired_text: "Best laptop in our test.",
    source_references: [createId()],
    constraint_references: [createId()],
    engine: "gemini",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function validReleasePassport(): ReleasePassport {
  return {
    id: createId(),
    project_id: createId(),
    asset_id: createId(),
    version: 1,
    asset_count: 1,
    claim_count: 3,
    evidence_coverage: 100,
    claim_fidelity: 98,
    numerical_integrity: 100,
    creator_intent_status: "PASS",
    sponsor_compliance: "PASS",
    platform_qa: "PASS",
    overall: 99,
    release_status: "READY",
    created_at: nowIso(),
  };
}