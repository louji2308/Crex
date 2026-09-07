import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  CONTRACTS,
  FROZEN_CONTRACTS,
  DEFERRED_CONTRACTS,
  apiErrorSchema,
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
} from "@crex/schemas";
import {
  projectFixture,
  sourceAssetFixture,
  transcriptSegmentFixture,
  claimFixture,
  evidenceFixture,
  generatedAssetFixture,
  generatedComponentFixture,
  verificationRunFixture,
  verificationFindingFixture,
  workflowStateFixture,
  apiOkFixture,
  apiErrFixture,
  aiOutputFixture,
} from "../fixtures/schemas.js";

const FROZEN_NAMES = [
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
];

interface ParseResult {
  success: boolean;
}

interface SchemaShape {
  parse: (value: unknown) => unknown;
  safeParse: (value: unknown) => ParseResult;
}

interface EnumField {
  field: string;
  valid: unknown;
  invalid: unknown;
}

interface ContractCase {
  name: string;
  schema: SchemaShape;
  fixture: () => unknown;
  requiredKey?: string;
  enumField?: EnumField;
}

const CASES: ContractCase[] = [
  {
    name: "Project",
    schema: projectSchema,
    fixture: () => projectFixture(),
    requiredKey: "id",
  },
  {
    name: "SourceAsset",
    schema: sourceAssetSchema,
    fixture: () => sourceAssetFixture(),
    requiredKey: "id",
  },
  {
    name: "TranscriptSegment",
    schema: transcriptSegmentSchema,
    fixture: () => transcriptSegmentFixture(),
    requiredKey: "id",
  },
  {
    name: "Claim",
    schema: claimSchema,
    fixture: () => claimFixture(),
    requiredKey: "id",
  },
  {
    name: "Evidence",
    schema: evidenceSchema,
    fixture: () => evidenceFixture(),
    requiredKey: "id",
  },
  {
    name: "GeneratedAsset",
    schema: generatedAssetSchema,
    fixture: () => generatedAssetFixture(),
    requiredKey: "id",
    enumField: {
      field: "status",
      valid: "READY",
      invalid: "BANANA",
    },
  },
  {
    name: "GeneratedComponent",
    schema: generatedComponentSchema,
    fixture: () => generatedComponentFixture(),
    requiredKey: "component_id",
    enumField: {
      field: "verification_status",
      valid: "REVIEW",
      invalid: "BANANA",
    },
  },
  {
    name: "VerificationRun",
    schema: verificationRunSchema,
    fixture: () => verificationRunFixture(),
    requiredKey: "id",
    enumField: {
      field: "result",
      valid: "BLOCK",
      invalid: "BANANA",
    },
  },
  {
    name: "VerificationFinding",
    schema: verificationFindingSchema,
    fixture: () => verificationFindingFixture(),
    requiredKey: "id",
  },
  {
    name: "WorkflowState",
    schema: workflowStateSchema,
    fixture: () => workflowStateFixture(),
    requiredKey: "id",
  },
  {
    name: "APIResponse",
    schema: apiResponseSchemaShape(),
    fixture: () => apiOkFixture({ hello: "world" }),
    requiredKey: "success",
  },
  {
    name: "ApiError",
    schema: apiErrorSchema,
    fixture: () => apiErrFixture(),
    requiredKey: "code",
  },
  {
    name: "AiOutput",
    schema: aiOutputFixtureShape(),
    fixture: () => aiOutputFixture(),
    requiredKey: "id",
  },
];

function apiResponseSchemaShape(): SchemaShape {
  const schema = z
    .strictObject({
      success: z.boolean(),
      payload: z.record(z.string(), z.unknown()),
      request_id: z.string(),
      error: apiErrorSchema.optional(),
    })
    .superRefine((response, ctx) => {
      if (response.success && response.error !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "error must be absent when success is true",
        });
      }
      if (!response.success && response.error === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "error is required when success is false",
        });
      }
    });
  return asShape(schema);
}

function aiOutputFixtureShape(): SchemaShape {
  return asShape(aiOutputFixtureSchema());
}

function aiOutputFixtureSchema(): z.ZodType {
  return z.strictObject({
    id: z.string(),
    task: z.string(),
    provider: z.string(),
    model: z.string(),
    raw_output: z.string(),
    normalized: z.unknown(),
    schema_version: z.string(),
    valid: z.boolean(),
    validation_errors: z.array(z.string()),
    fallback_used: z.boolean(),
    created_at: z.string(),
  });
}

function asShape(schema: z.ZodType): SchemaShape {
  return {
    parse: (value: unknown) => schema.parse(value),
    safeParse: (value: unknown) => schema.safeParse(value) as ParseResult,
  };
}

describe("frozen contract registry", () => {
  it("freezes exactly 13 contracts", () => {
    expect(FROZEN_CONTRACTS).toHaveLength(13);
    expect([...FROZEN_CONTRACTS].sort()).toEqual([...FROZEN_NAMES].sort());
  });

  it("registers every frozen name in the CONTRACTS registry", () => {
    for (const name of FROZEN_NAMES) {
      expect(CONTRACTS).toHaveProperty(name);
    }
  });

  it("documents the six deferred contracts with wave targets", () => {
    expect(DEFERRED_CONTRACTS).toHaveLength(6);
    const names = DEFERRED_CONTRACTS.map((c) => c.name);
    expect(names).toContain("Constraint");
    expect(names).toContain("SponsorRequirement");
    expect(names).toContain("RepairAction");
    expect(names).toContain("ReleasePassport");
    expect(names).toContain("PerformanceObservation");
    expect(names).toContain("LearningRecord");
    const wave2 = DEFERRED_CONTRACTS.filter((c) => c.targetWave === "Wave 2");
    expect(wave2).toHaveLength(4);
  });
});

describe("contract conformance", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      it("(a) the fixture parses against the schema", () => {
        const result = c.schema.safeParse(c.fixture());
        expect(result.success).toBe(true);
      });

      it("(b) rejects an unknown/extra key (strict object contract)", () => {
        const valid = c.schema.parse(c.fixture());
        const withExtra = {
          ...(valid as Record<string, unknown>),
          __unknownField: "x",
        };
        const result = c.schema.safeParse(withExtra);
        expect(result.success).toBe(false);
      });

      it("(c) rejects a missing payload", () => {
        expect(c.schema.safeParse(undefined).success).toBe(false);
      });

      if (c.requiredKey) {
        it("(c) rejects a missing required field", () => {
          const valid = c.schema.parse(c.fixture());
          const without = { ...(valid as Record<string, unknown>) };
          delete without[c.requiredKey as string];
          const result = c.schema.safeParse(without);
          expect(result.success).toBe(false);
        });
      }

      if (c.enumField) {
        it("(d) rejects a wrong enum value", () => {
          const valid = c.schema.parse(c.fixture()) as Record<string, unknown>;
          const bad = {
            ...valid,
            [c.enumField!.field]: c.enumField!.invalid,
          };
          const result = c.schema.safeParse(bad);
          expect(result.success).toBe(false);
        });
      }

      it("(e) survives a JSON round-trip: parse(parse(stringify(valid)))", () => {
        const valid = c.schema.parse(c.fixture());
        const reparsed = c.schema.parse(JSON.parse(JSON.stringify(valid)));
        expect(reparsed).toEqual(valid);
      });
    });
  }

  it("fixtures are unique per call", () => {
    const a = projectFixture();
    const b = projectFixture();
    expect(a.id).not.toBe(b.id);
  });
});