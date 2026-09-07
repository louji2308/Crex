import { describe, expect, it, vi } from "vitest";
import { withFallback } from "../src/fallback.js";
import type { AiProvider } from "../src/providers.js";
import type { ProviderRequest, AiProviderResult } from "../src/types.js";
import {
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderAuthFailedError,
  ProviderUnavailableError,
  ProviderNotFoundError,
} from "../src/errors.js";
import { CrexError } from "@crex/core";

const stubRequest: ProviderRequest = {
  messages: [{ role: "user", content: "test" }],
  task: "CLAIM_EXTRACTION",
};

function makeResult(provider: "nvidia" | "mistral", overrides?: Partial<AiProviderResult>): AiProviderResult {
  return {
    primary_provider: provider,
    provider_used: provider,
    fallback_active: false,
    fallback_reason: null,
    model: "test-model",
    raw_output: '{"ok":true}',
    normalized: { ok: true },
    valid: true,
    validation_errors: [],
    task: "CLAIM_EXTRACTION",
    schema_version: "0.1.0",
    created_at: "2025-01-01T00:00:00.000Z",
    duration_ms: 100,
    ...overrides,
  };
}

function stubProvider(
  name: "nvidia" | "mistral",
  behavior: "success" | "rate_limit" | "timeout" | "unavailable" | "auth" | "not_found" | "unavailable_then_success",
  callCount?: { current: number },
): AiProvider {
  return {
    name,
    generate: vi.fn().mockImplementation(async () => {
      switch (behavior) {
        case "success":
          return makeResult(name);
        case "rate_limit":
          throw new ProviderRateLimitError(name, `${name} rate limited`);
        case "timeout":
          throw new ProviderTimeoutError(name, `${name} timed out`);
        case "unavailable":
          throw new ProviderUnavailableError(name, `${name} unavailable`);
        case "auth":
          throw new ProviderAuthFailedError(name, `${name} auth failed`);
        case "not_found":
          throw new ProviderNotFoundError(name, `${name} not found`);
        case "unavailable_then_success": {
          const count = callCount?.current ?? 0;
          if (callCount) callCount.current = count + 1;
          if (count === 0) {
            throw new ProviderUnavailableError(name, `${name} temporarily unavailable`);
          }
          return makeResult(name);
        }
      }
    }),
  };
}

describe("withFallback", () => {
  it("returns primary result when primary succeeds (fallback never called)", async () => {
    const primary = stubProvider("nvidia", "success");
    const fallback = stubProvider("mistral", "success");
    const result = await withFallback(primary, fallback, stubRequest, {
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });
    expect(result.provider_used).toBe("nvidia");
    expect(result.fallback_active).toBe(false);
    expect(result.fallback_reason).toBeNull();
    expect(primary.generate).toHaveBeenCalledOnce();
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it("retries primary then falls back on rate_limit", async () => {
    const primary = stubProvider("nvidia", "rate_limit");
    const fallback = stubProvider("mistral", "success");
    const result = await withFallback(primary, fallback, stubRequest, {
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });
    expect(result.provider_used).toBe("mistral");
    expect(result.fallback_active).toBe(true);
    expect(result.fallback_reason).toBe("rate_limit");
    expect(primary.generate).toHaveBeenCalledTimes(3);
    expect(fallback.generate).toHaveBeenCalledOnce();
  });

  it("retries primary then falls back on timeout", async () => {
    const primary = stubProvider("nvidia", "timeout");
    const fallback = stubProvider("mistral", "success");
    const result = await withFallback(primary, fallback, stubRequest, {
      maxRetries: 1,
      retryBaseDelayMs: 1,
    });
    expect(result.provider_used).toBe("mistral");
    expect(result.fallback_active).toBe(true);
    expect(result.fallback_reason).toBe("timeout");
    expect(primary.generate).toHaveBeenCalledTimes(2);
  });

  it("retries primary then falls back on unavailable (5xx)", async () => {
    const primary = stubProvider("nvidia", "unavailable");
    const fallback = stubProvider("mistral", "success");
    const result = await withFallback(primary, fallback, stubRequest, {
      maxRetries: 1,
      retryBaseDelayMs: 1,
    });
    expect(result.provider_used).toBe("mistral");
    expect(result.fallback_active).toBe(true);
    expect(result.fallback_reason).toBe("upstream_500");
  });

  it("throws immediately on primary auth failure (NOT retryable, NOT fallback-eligible)", async () => {
    const primary = stubProvider("nvidia", "auth");
    const fallback = stubProvider("mistral", "success");
    await expect(
      withFallback(primary, fallback, stubRequest, {
        maxRetries: 2,
        retryBaseDelayMs: 1,
      }),
    ).rejects.toThrow(ProviderAuthFailedError);
    expect(primary.generate).toHaveBeenCalledOnce();
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it("throws immediately on primary 404 (NOT retryable, NOT fallback-eligible)", async () => {
    const primary = stubProvider("nvidia", "not_found");
    const fallback = stubProvider("mistral", "success");
    await expect(
      withFallback(primary, fallback, stubRequest, {
        maxRetries: 2,
        retryBaseDelayMs: 1,
      }),
    ).rejects.toThrow(ProviderNotFoundError);
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it("throws classified CrexError when BOTH providers fail", async () => {
    const primary = stubProvider("nvidia", "unavailable");
    const fallback = stubProvider("mistral", "unavailable");
    await expect(
      withFallback(primary, fallback, stubRequest, {
        maxRetries: 0,
        retryBaseDelayMs: 1,
      }),
    ).rejects.toThrow(CrexError);
    expect(primary.generate).toHaveBeenCalledOnce();
    expect(fallback.generate).toHaveBeenCalledOnce();
  });

  it("retry counting matches maxRetries (0 = no retries, 1 call total)", async () => {
    const primary = stubProvider("nvidia", "rate_limit");
    const fallback = stubProvider("mistral", "success");
    await withFallback(primary, fallback, stubRequest, {
      maxRetries: 0,
      retryBaseDelayMs: 1,
    });
    expect(primary.generate).toHaveBeenCalledTimes(1);
  });

  it("retry counting matches maxRetries (2 = 3 calls total)", async () => {
    const primary = stubProvider("nvidia", "rate_limit");
    const fallback = stubProvider("mistral", "success");
    await withFallback(primary, fallback, stubRequest, {
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });
    expect(primary.generate).toHaveBeenCalledTimes(3);
  });

  it("succeeds on retry after transient failure", async () => {
    const callCount = { current: 0 };
    const primary = stubProvider("nvidia", "unavailable_then_success", callCount);
    const fallback = stubProvider("mistral", "success");
    const result = await withFallback(primary, fallback, stubRequest, {
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });
    expect(result.provider_used).toBe("nvidia");
    expect(result.fallback_active).toBe(false);
    expect(primary.generate).toHaveBeenCalledTimes(2);
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it("preserves fallback provider metadata in result", async () => {
    const primary = stubProvider("nvidia", "rate_limit");
    const fallback = stubProvider("mistral", "success");
    const result = await withFallback(primary, fallback, stubRequest, {
      maxRetries: 0,
      retryBaseDelayMs: 1,
    });
    expect(result.primary_provider).toBe("nvidia");
    expect(result.provider_used).toBe("mistral");
    expect(result.model).toBe("test-model");
  });
});
