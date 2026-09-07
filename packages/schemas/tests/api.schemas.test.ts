import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  aiOutputSchema,
  apiErrorSchema,
  apiResponseSchema,
  createId,
  projectSchema,
  type AiOutput,
  type ApiResponse,
  type Project,
} from "../src/index";
import {
  validAiOutput,
  validApiError,
  validApiResponse,
  validProject,
  without,
} from "./fixtures";

const _apiResponseTypeCheck: ApiResponse<Project> =
  apiResponseSchema(projectSchema).parse(validApiResponse());

const _aiOutputTypeCheck: AiOutput = validAiOutput();

describe("apiErrorSchema", () => {
  const valid = () => validApiError();

  it("parses a valid API error", () => {
    const parsed = apiErrorSchema.parse(valid());
    expect(parsed.code).toBe("INVALID_INPUT");
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "code")],
    ["a wrong-typed field", { ...valid(), code: 7 }],
  ])("rejects %s", (_label, input) => {
    expect(() => apiErrorSchema.parse(input)).toThrow();
  });
});

describe("apiResponseSchema", () => {
  it("parses a valid success response", () => {
    const parsed = apiResponseSchema(projectSchema).parse(validApiResponse());
    expect(parsed.success).toBe(true);
    expect(parsed.payload.name).toBe("Budget Laptop Review");
  });

  it("parses a valid failure response", () => {
    const input = {
      success: false,
      payload: null,
      request_id: createId(),
      error: validApiError(),
    };
    const parsed = apiResponseSchema(z.null()).parse(input);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
  });

  it("rejects a missing payload against a concrete payload schema", () => {
    expect(() =>
      apiResponseSchema(projectSchema).parse(without(validApiResponse(), "payload")),
    ).toThrow();
  });

  it.each([
    ["an unknown envelope key", { ...validApiResponse(), extra_key: 1 }],
    ["an invalid request id", { ...validApiResponse(), request_id: "not-a-uuid" }],
    ["a success response carrying an error", { ...validApiResponse(), error: validApiError() }],
    [
      "a failure response without an error",
      without(
        {
          success: false,
          payload: null,
          request_id: createId(),
          error: validApiError(),
        },
        "error",
      ),
    ],
  ])("rejects %s", (_label, input) => {
    expect(() => apiResponseSchema(z.unknown()).parse(input)).toThrow();
  });
});

describe("aiOutputSchema", () => {
  const valid = () => validAiOutput();

  it("parses a valid AI output record", () => {
    const parsed = aiOutputSchema.parse(valid());
    expect(parsed.task).toBe("CLAIM_EXTRACTION");
    expect(parsed.valid).toBe(true);
  });

  it.each([
    ["an unknown key", { ...valid(), stray: true }],
    ["a missing required field", without(valid(), "provider")],
    ["an invalid task", { ...valid(), task: "SOMETHING_ELSE" }],
    ["a wrong-typed field", { ...valid(), valid: "yes" }],
  ])("rejects %s", (_label, input) => {
    expect(() => aiOutputSchema.parse(input)).toThrow();
  });

  it("survives a JSON round-trip", () => {
    const roundTripped = JSON.parse(JSON.stringify(valid())) as unknown;
    expect(() => aiOutputSchema.parse(roundTripped)).not.toThrow();
  });
});

describe("project payload persisted as an API response", () => {
  it("round-trips through the envelope", () => {
    const response = validApiResponse();
    const wire = JSON.parse(JSON.stringify(response)) as unknown;
    const parsed = apiResponseSchema(projectSchema).parse(wire);
    expect(parsed.payload.id).toBe(response.payload.id);
    expect(parsed.payload.name).toBe("Budget Laptop Review");
    expect(validProject().id).toBeTypeOf("string");
  });
});