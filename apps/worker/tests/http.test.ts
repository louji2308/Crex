import { describe, expect, it } from "vitest";
import { CrexError } from "@crex/core/src/errors";
import { errorResponse, errorResponseForCode, toHttpStatus } from "../src/http";

describe("toHttpStatus", () => {
  it.each([
    ["INVALID_BODY", 400],
    ["INVALID_PROJECT_ID", 400],
    ["INVALID_WORKFLOW_ID", 400],
    ["INVALID_AI_REQUEST", 400],
    ["INVALID_AI_OUTPUT", 400],
    ["PROJECT_NOT_FOUND", 404],
    ["INSTANCE_NOT_FOUND", 404],
    ["WORKFLOW_STATE_MISSING", 404],
    ["AI_OUTPUT_NOT_FOUND", 404],
    ["NOT_FOUND", 404],
    ["AI_NOT_CONFIGURED", 503],
    ["INFRASTRUCTURE_UNAVAILABLE", 503],
  ])("maps %s to %i", (code, status) => {
    expect(toHttpStatus(code)).toBe(status);
  });

  it("defaults unknown codes to 500", () => {
    expect(toHttpStatus("SOMETHING_ELSE")).toBe(500);
  });
});

describe("errorResponse", () => {
  it("encodes a CrexError via its ApiError shape", async () => {
    const error = new CrexError("PROVIDER_TIMEOUT", "request timed out", { retryable: true });
    const response = errorResponse(error);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; retryable: boolean } };
    expect(body.error.code).toBe("PROVIDER_TIMEOUT");
    expect(body.error.retryable).toBe(true);
  });

  it("maps a known CrexError code to its HTTP status", () => {
    const response = errorResponse(new CrexError("INSTANCE_NOT_FOUND", "nope"));
    expect(response.status).toBe(404);
  });

  it("normalizes an unknown error to INTERNAL_ERROR 500", async () => {
    const response = errorResponse(new Error("boom"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("internal error");
  });

  it("does not leak internal error details to the client", async () => {
    const raw = new Error("SELECT * FROM secrets -- provider token abc123");
    const response = errorResponse(raw);
    const text = await response.text();
    expect(text).not.toContain("secrets");
    expect(text).not.toContain("provider token");
    expect(text).not.toContain("abc123");
  });
});

describe("errorResponseForCode", () => {
  it("builds an error response for a code and message", async () => {
    const response = errorResponseForCode("INVALID_BODY", "request body must be valid JSON");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INVALID_BODY");
    expect(body.error.message).toBe("request body must be valid JSON");
  });
});