import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CONTRACTS,
  DEFERRED_CONTRACTS,
  FROZEN_CONTRACTS,
  SCHEMAS_VERSION,
} from "../src/index";

describe("SCHEMAS_VERSION", () => {
  it("is frozen at 0.1.0", () => {
    expect(SCHEMAS_VERSION).toBe("0.1.0");
  });
});

describe("FROZEN_CONTRACTS", () => {
  it("freezes exactly the 13 Wave 1 contracts", () => {
    expect(FROZEN_CONTRACTS).toHaveLength(13);
    expect(FROZEN_CONTRACTS).toEqual([
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
    ]);
  });
});

describe("DEFERRED_CONTRACTS", () => {
  it("lists exactly the 6 deferred contracts with their target waves", () => {
    expect(DEFERRED_CONTRACTS).toHaveLength(6);
    expect(DEFERRED_CONTRACTS).toEqual([
      { name: "Constraint", targetWave: "Wave 2" },
      { name: "SponsorRequirement", targetWave: "Wave 2" },
      { name: "RepairAction", targetWave: "Wave 2" },
      { name: "ReleasePassport", targetWave: "Wave 2" },
      { name: "PerformanceObservation", targetWave: "later" },
      { name: "LearningRecord", targetWave: "later" },
    ]);
  });

  it("no deferred contract is a frozen contract", () => {
    for (const { name } of DEFERRED_CONTRACTS) {
      expect(FROZEN_CONTRACTS).not.toContain(name);
    }
  });
});

describe("CONTRACTS registry", () => {
  it("exposes exactly the 13 frozen contracts", () => {
    expect(Object.keys(CONTRACTS)).toHaveLength(13);
  });

  it("every frozen name resolves to a schema or schema factory", () => {
    for (const name of FROZEN_CONTRACTS) {
      expect(CONTRACTS[name]).toBeDefined();
    }
  });

  it("every frozen name resolves to a schema whose inferred type is usable", () => {
    const check: Record<string, z.ZodType> = {
      Project: CONTRACTS.Project,
      SourceAsset: CONTRACTS.SourceAsset,
      TranscriptSegment: CONTRACTS.TranscriptSegment,
      Claim: CONTRACTS.Claim,
      Evidence: CONTRACTS.Evidence,
      GeneratedAsset: CONTRACTS.GeneratedAsset,
      GeneratedComponent: CONTRACTS.GeneratedComponent,
      VerificationRun: CONTRACTS.VerificationRun,
      VerificationFinding: CONTRACTS.VerificationFinding,
      WorkflowState: CONTRACTS.WorkflowState,
      AiOutput: CONTRACTS.AiOutput,
      ApiError: CONTRACTS.ApiError,
    };
    for (const [name, schema] of Object.entries(check)) {
      expect(name).not.toBe("");
      expect(schema).toBeDefined();
    }
  });

  it("APIResponse resolves to the envelope factory", () => {
    expect(typeof CONTRACTS.APIResponse).toBe("function");
  });
});