import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateAiResult } from "../src/validate.js";

const testSchema = z.strictObject({
  score: z.number().int().min(0).max(100),
  label: z.string().min(1),
});

const meta = {
  task: "CLAIM_EXTRACTION",
  provider_used: "nvidia",
  primary_provider: "nvidia",
  model: "meta/llama-3.3-70b-instruct",
  raw_output: '{"score":80,"label":"good"}',
  schema_version: "0.1.0",
  duration_ms: 1234,
  fallback_active: false,
  fallback_reason: null,
};

describe("validateAiResult", () => {
  it("returns valid=true with correct normalized data when JSON matches schema", () => {
    const json = { score: 80, label: "good" };
    const result = validateAiResult(json, testSchema, meta);
    expect(result.valid).toBe(true);
    expect(result.validation_errors).toEqual([]);
    expect(result.normalized).toEqual(json);
    expect(result.provider_used).toBe("nvidia");
  });

  it("returns valid=false with validation_errors when required field is missing", () => {
    const json = { score: 80 };
    const result = validateAiResult(json, testSchema, meta);
    expect(result.valid).toBe(false);
    expect(result.validation_errors.length).toBeGreaterThan(0);
    expect(result.validation_errors.some((e) => e.includes("label"))).toBe(true);
  });

  it("returns valid=false with validation_errors when type is wrong", () => {
    const json = { score: "not a number", label: "good" };
    const result = validateAiResult(json, testSchema, meta);
    expect(result.valid).toBe(false);
    expect(result.validation_errors.length).toBeGreaterThan(0);
    expect(result.validation_errors.some((e) => e.includes("score"))).toBe(true);
  });

  it("returns valid=false when strict schema rejects extra unknown keys", () => {
    const json = { score: 80, label: "good", extra: true };
    const result = validateAiResult(json, testSchema, meta);
    expect(result.valid).toBe(false);
    expect(result.validation_errors.length).toBeGreaterThan(0);
    expect(result.validation_errors.some((e) => e.includes("extra"))).toBe(true);
  });

  it("returns valid=true with correct metadata fields", () => {
    const json = { score: 50, label: "ok" };
    const result = validateAiResult(json, testSchema, meta);
    expect(result.task).toBe("CLAIM_EXTRACTION");
    expect(result.model).toBe("meta/llama-3.3-70b-instruct");
    expect(result.schema_version).toBe("0.1.0");
    expect(result.duration_ms).toBe(1234);
    expect(typeof result.created_at).toBe("string");
    expect(result.fallback_active).toBe(false);
    expect(result.fallback_reason).toBeNull();
  });

  it("never throws on invalid data", () => {
    const result = validateAiResult(null, testSchema, meta);
    expect(result.valid).toBe(false);
    expect(Array.isArray(result.validation_errors)).toBe(true);
  });

  it("works with non-strict schemas (allow extra keys)", () => {
    const looseSchema = z.object({
      score: z.number(),
    });
    const json = { score: 42, extra: "ignored" };
    const result = validateAiResult(json, looseSchema, meta);
    expect(result.valid).toBe(true);
  });
});
