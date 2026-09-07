import { describe, expect, it } from "vitest";
import {
  claimSchema,
  constraintSchema,
  evidenceSchema,
  generatedAssetSchema,
  generatedComponentSchema,
  projectSchema,
  releasePassportSchema,
  repairActionSchema,
  sourceAssetSchema,
  sponsorRequirementSchema,
  transcriptSegmentSchema,
  verificationFindingSchema,
  verificationRunSchema,
  workflowStateSchema,
  type SourceAsset,
} from "../src/index";
import {
  validClaim,
  validConstraint,
  validEvidence,
  validGeneratedAsset,
  validGeneratedComponent,
  validProject,
  validReleasePassport,
  validRepairAction,
  validSourceAsset,
  validSponsorRequirement,
  validTranscriptSegment,
  validVerificationFinding,
  validVerificationRun,
  validWorkflowState,
  without,
} from "./fixtures";

describe("projectSchema", () => {
  const valid = () => validProject();

  it("parses a valid project", () => {
    const parsed = projectSchema.parse(valid());
    expect(parsed.name).toBe("Budget Laptop Review");
    expect(parsed.target_platforms).toEqual(["YOUTUBE", "TIKTOK"]);
  });

  it.each([
    ["an unknown key", { ...valid(), extra_key: "nope" }],
    ["a missing required field", without(valid(), "name")],
    ["an invalid platform value", { ...valid(), target_platforms: ["NOT_A_PLATFORM"] }],
    ["a wrong-typed field", { ...valid(), target_platforms: "YOUTUBE" }],
  ])("rejects %s", (_label, input) => {
    expect(() => projectSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => projectSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("sourceAssetSchema", () => {
  const valid = () => validSourceAsset();

  it("parses a valid source asset", () => {
    const parsed = sourceAssetSchema.parse(valid());
    expect(parsed.transcription_status).toBe("COMPLETED");
    expect(parsed.size_bytes).toBe(52428800);
    expect(parsed.status).toBe("READY");
    expect(parsed.media?.video).toEqual({ codec: "h264", width: 1920, height: 1080 });
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "status")],
    ["an invalid status value", { ...valid(), status: "NOPE" }],
    ["an invalid transcription status", { ...valid(), transcription_status: "NOPE" }],
    ["a wrong-typed field", { ...valid(), size_bytes: "52428800" }],
  ])("rejects %s", (_label, input) => {
    expect(() => sourceAssetSchema.parse(input)).toThrow();
  });

  it("accepts an upload in progress before measurement fields are known", () => {
    const inFlight = without(valid(), "size_bytes");
    delete (inFlight as Partial<SourceAsset>).duration_seconds;
    delete (inFlight as Partial<SourceAsset>).checksum;
    (inFlight as Partial<SourceAsset>).status = "UPLOADING";
    expect(() => sourceAssetSchema.parse(inFlight)).not.toThrow();
  });

  it("rejects media metadata that is not derived from a real probe", () => {
    const valid = () => validSourceAsset();
    const badMedia = { container: "mp4", video: { codec: "h264", width: 0, height: 1080 }, audio: null };
    expect(() => sourceAssetSchema.parse({ ...valid(), status: "VALID", media: badMedia })).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => sourceAssetSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("transcriptSegmentSchema", () => {
  const valid = () => validTranscriptSegment();

  it("parses a valid transcript segment", () => {
    const parsed = transcriptSegmentSchema.parse(valid());
    expect(parsed.text).toBe("Laptop C reached eleven hours and seven minutes in our battery test.");
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "text")],
    ["a reversed time range", { ...valid(), start_time: 100, end_time: 10 }],
    ["a wrong-typed field", { ...valid(), text: 42 }],
  ])("rejects %s", (_label, input) => {
    expect(() => transcriptSegmentSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => transcriptSegmentSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("claimSchema", () => {
  const valid = () => validClaim();

  it("parses a valid claim", () => {
    const parsed = claimSchema.parse(valid());
    expect(parsed.type).toBe("CLAIM");
    expect(parsed.qualifiers).toEqual(["in our test"]);
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "content")],
    ["an invalid claim type", { ...valid(), type: "FACT" }],
    ["a wrong-typed field", { ...valid(), content: ["not", "a", "string"] }],
  ])("rejects %s", (_label, input) => {
    expect(() => claimSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => claimSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("evidenceSchema", () => {
  const valid = () => validEvidence();

  it("parses a valid evidence entry", () => {
    const parsed = evidenceSchema.parse(valid());
    expect(parsed.type).toBe("TRANSCRIPT");
    expect(parsed.source_range).toEqual({ start: 523, end: 557 });
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "content")],
    ["an invalid evidence type", { ...valid(), type: "IMAGE" }],
    ["an invalid source range", { ...valid(), source_range: { start: 5, end: 2 } }],
  ])("rejects %s", (_label, input) => {
    expect(() => evidenceSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => evidenceSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("generatedAssetSchema", () => {
  const valid = () => validGeneratedAsset();

  it("parses a valid generated asset", () => {
    const parsed = generatedAssetSchema.parse(valid());
    expect(parsed.status).toBe("READY");
    expect(parsed.integrity.overall).toBe(98);
    expect(parsed.integrity.dimensions.evidence_coverage).toBe(100);
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "status")],
    ["an invalid asset status", { ...valid(), status: "NOPE" }],
    ["a score above the domain", { ...valid(), integrity: { ...valid().integrity, overall: 101 } }],
    ["no reasons under the score", { ...valid(), integrity: { ...valid().integrity, reasons: [] } }],
  ])("rejects %s", (_label, input) => {
    expect(() => generatedAssetSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => generatedAssetSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("generatedComponentSchema", () => {
  const valid = () => validGeneratedComponent();

  it("parses a valid generated component", () => {
    const parsed = generatedComponentSchema.parse(valid());
    expect(parsed.verification_status).toBe("PASS");
    expect(parsed.constraint_references).toEqual([]);
  });

  it("accepts an empty constraint_references array", () => {
    expect(() =>
      generatedComponentSchema.parse({ ...valid(), constraint_references: [] }),
    ).not.toThrow();
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "content")],
    ["an invalid verification status", { ...valid(), verification_status: "NOPE" }],
    ["a wrong-typed field", { ...valid(), claim_references: "not-an-array" }],
  ])("rejects %s", (_label, input) => {
    expect(() => generatedComponentSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => generatedComponentSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("verificationRunSchema", () => {
  const valid = () => validVerificationRun();

  it("parses a valid verification run", () => {
    const parsed = verificationRunSchema.parse(valid());
    expect(parsed.result).toBe("REVIEW");
    expect(parsed.engine).toBe("semantic");
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "engine")],
    ["an invalid result", { ...valid(), result: "NOPE" }],
    ["a wrong-typed field", { ...valid(), finding_ids: "none" }],
  ])("rejects %s", (_label, input) => {
    expect(() => verificationRunSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => verificationRunSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("verificationFindingSchema", () => {
  const valid = () => validVerificationFinding();

  it("parses a valid verification finding", () => {
    const parsed = verificationFindingSchema.parse(valid());
    expect(parsed.type).toBe("SCOPE_DRIFT");
    expect(parsed.severity).toBe("BLOCK");
    expect(parsed.evidence_ranges).toEqual([{ start: 523, end: 557 }]);
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "reason")],
    ["an invalid finding type", { ...valid(), type: "NOPE" }],
    ["an invalid severity", { ...valid(), severity: "NOPE" }],
    ["an invalid evidence range", { ...valid(), evidence_ranges: [{ start: 9, end: 3 }] }],
  ])("rejects %s", (_label, input) => {
    expect(() => verificationFindingSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => verificationFindingSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("workflowStateSchema", () => {
  const valid = () => validWorkflowState();

  it("parses a valid workflow state", () => {
    const parsed = workflowStateSchema.parse(valid());
    expect(parsed.phase).toBe("RUNNING");
    expect(parsed.stage).toBe("GENERATION");
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "phase")],
    ["an invalid phase", { ...valid(), phase: "NOPE" }],
    ["an invalid stage", { ...valid(), stage: "NOPE" }],
  ])("rejects %s", (_label, input) => {
    expect(() => workflowStateSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => workflowStateSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("constraintSchema", () => {
  const valid = () => validConstraint();

  it("parses a valid constraint", () => {
    const parsed = constraintSchema.parse(valid());
    expect(parsed.category).toBe("TECHNICAL_NUANCE");
    expect(parsed.enabled).toBe(true);
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "summary")],
    ["an invalid category", { ...valid(), category: "NOPE" }],
    ["an invalid source", { ...valid(), source: "GUESSED" }],
    ["a wrong-typed field", { ...valid(), enabled: "yes" }],
  ])("rejects %s", (_label, input) => {
    expect(() => constraintSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => constraintSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("sponsorRequirementSchema", () => {
  const valid = () => validSponsorRequirement();

  it("parses a valid sponsor requirement", () => {
    const parsed = sponsorRequirementSchema.parse(valid());
    expect(parsed.requirement_type).toBe("DISCOUNT_CODE");
    expect(parsed.sponsor_name).toBe("TechBrand");
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "value")],
    ["an invalid requirement type", { ...valid(), requirement_type: "NOPE" }],
    ["a missing sponsor", { ...valid(), sponsor_name: "" }],
  ])("rejects %s", (_label, input) => {
    expect(() => sponsorRequirementSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => sponsorRequirementSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("repairActionSchema", () => {
  const valid = () => validRepairAction();

  it("parses a valid repair action", () => {
    const parsed = repairActionSchema.parse(valid());
    expect(parsed.status).toBe("PROPOSED");
    expect(parsed.repaired_text).toBe("Best laptop in our test.");
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "finding_id")],
    ["an invalid status", { ...valid(), status: "NOPE" }],
    ["an empty repaired text", { ...valid(), repaired_text: "" }],
  ])("rejects %s", (_label, input) => {
    expect(() => repairActionSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => repairActionSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("releasePassportSchema", () => {
  const valid = () => validReleasePassport();

  it("parses a valid release passport", () => {
    const parsed = releasePassportSchema.parse(valid());
    expect(parsed.release_status).toBe("READY");
    expect(parsed.overall).toBe(99);
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "asset_count")],
    ["an invalid release status", { ...valid(), release_status: "NOPE" }],
    ["a score above the domain", { ...valid(), overall: 101 }],
  ])("rejects %s", (_label, input) => {
    expect(() => releasePassportSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => releasePassportSchema.parse(roundTripped)).not.toThrow();
  });
});