import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiErrorSchema, apiResponseSchema } from "@crex/schemas";
import { ok, fail } from "../src/api.js";
import { CrexError } from "../src/errors.js";

const envelopeSchema = apiResponseSchema(z.unknown());

describe("api envelope", () => {
  it("builds a successful response that matches the ApiResponse contract", () => {
    const response = ok({ result: 42 });
    expect(response.success).toBe(true);
    expect(response.payload).toEqual({ result: 42 });
    expect(response.error).toBeUndefined();
    expect(envelopeSchema.safeParse(response).success).toBe(true);
  });

  it("builds a failure response with an ApiError payload", () => {
    const error = new CrexError("VERIFY_FAILED", "check could not be completed", {
      retryable: true,
    });
    const response = fail<unknown>(error);
    expect(response.success).toBe(false);
    expect(response.error?.code).toBe("VERIFY_FAILED");
    expect(response.error?.retryable).toBe(true);
    expect(apiErrorSchema.safeParse(response.error).success).toBe(true);
  });

  it("throws when a CrexError cannot be encoded as a valid ApiError", () => {
    const error = new CrexError("X", "");
    expect(() => error.toApiError()).toThrow();
  });
});