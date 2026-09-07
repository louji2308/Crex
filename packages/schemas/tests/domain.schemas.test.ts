import { describe, expect, it } from "vitest";
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
} from "../src/index";
import {
  validClaim,
  validEvidence,
  validGeneratedAsset,
  validGeneratedComponent,
  validProject,
  validSourceAsset,
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
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "checksum")],
    ["an invalid transcription status", { ...valid(), transcription_status: "NOPE" }],
    ["a wrong-typed field", { ...valid(), size_bytes: "52428800" }],
  ])("rejects %s", (_label, input) => {
    expect(() => sourceAssetSchema.parse(input)).toThrow();
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