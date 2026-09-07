import type { AiProvider } from "./providers.js";
import type { ProviderRequest, AiProviderResult, ProviderOptions } from "./types.js";
import type { ZodType } from "zod";
import {
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  ProviderParseError,
  ProviderSchemaRejectionError,
} from "./errors.js";

function isRetryableError(error: unknown): boolean {
  return (
    error instanceof ProviderRateLimitError ||
    error instanceof ProviderTimeoutError ||
    error instanceof ProviderUnavailableError ||
    error instanceof ProviderParseError ||
    error instanceof ProviderSchemaRejectionError
  );
}

function retryableErrorReason(error: unknown): string {
  if (error instanceof ProviderRateLimitError) return "rate_limit";
  if (error instanceof ProviderTimeoutError) return "timeout";
  if (error instanceof ProviderUnavailableError) return "upstream_500";
  if (error instanceof ProviderParseError) return "parse_error";
  if (error instanceof ProviderSchemaRejectionError) return "schema_rejection";
  return "unknown";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WithFallbackOptions {
  maxRetries: number;
  retryBaseDelayMs: number;
}

export async function withFallback(
  primary: AiProvider,
  fallback: AiProvider,
  request: ProviderRequest,
  options: WithFallbackOptions,
  targetSchema?: ZodType<unknown>,
  fetchFn?: typeof globalThis.fetch,
): Promise<AiProviderResult> {
  let lastPrimaryError: unknown = undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const result = await primary.generate(request, targetSchema, fetchFn);
      return result;
    } catch (error: unknown) {
      if (!isRetryableError(error)) {
        throw error;
      }
      lastPrimaryError = error;
      if (attempt < options.maxRetries) {
        const backoff = options.retryBaseDelayMs * Math.pow(2, attempt);
        await delay(backoff);
      }
    }
  }

  const primaryReason = retryableErrorReason(lastPrimaryError);

  try {
    const result = await fallback.generate(request, targetSchema, fetchFn);
    return {
      ...result,
      primary_provider: primary.name,
      fallback_active: true,
      fallback_reason: primaryReason,
    };
  } catch (fallbackError: unknown) {
    throw fallbackError;
  }
}
