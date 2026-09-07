import type { ZodType } from "zod";
import { createProvider, withFallback } from "@crex/ai";
import type { AiProviderResult, ProviderOptions, ProviderRequest } from "@crex/ai";
import { aiOutputSchema, type AiOutput } from "@crex/schemas/src/api";
import { CrexError } from "@crex/core/src/errors";

export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
export const DEFAULT_MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
export const DEFAULT_MISTRAL_MODEL = "mistral-large-latest";
export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct";
export const DEFAULT_AI_TIMEOUT_MS = 60000;
export const DEFAULT_AI_MAX_RETRIES = 2;
export const DEFAULT_AI_RETRY_BASE_DELAY_MS = 1000;

type AiTask = AiOutput["task"];

export interface AiEnv {
  NVIDIA_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  NVIDIA_BASE_URL?: string;
  NVIDIA_MODEL?: string;
  MISTRAL_BASE_URL?: string;
  MISTRAL_MODEL?: string;
  OPENROUTER_BASE_URL?: string;
  OPENROUTER_MODEL?: string;
  AI_TIMEOUT_MS?: string;
  AI_MAX_RETRIES?: string;
  AI_RETRY_BASE_DELAY_MS?: string;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function buildProviderOptions(env: AiEnv): ProviderOptions {
  return {
    nvidiaApiKey: env.NVIDIA_API_KEY,
    nvidiaBaseUrl: env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL,
    nvidiaModel: env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL,
    mistralApiKey: env.MISTRAL_API_KEY,
    mistralBaseUrl: env.MISTRAL_BASE_URL || DEFAULT_MISTRAL_BASE_URL,
    mistralModel: env.MISTRAL_MODEL || DEFAULT_MISTRAL_MODEL,
    openrouterApiKey: env.OPENROUTER_API_KEY,
    openrouterBaseUrl: env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL,
    openrouterModel: env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
    aiTimeoutMs: positiveInt(env.AI_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS),
    aiMaxRetries: nonNegativeInt(env.AI_MAX_RETRIES, DEFAULT_AI_MAX_RETRIES),
    aiRetryBaseDelayMs: positiveInt(env.AI_RETRY_BASE_DELAY_MS, DEFAULT_AI_RETRY_BASE_DELAY_MS),
  };
}

export function aiConfigured(options: ProviderOptions): boolean {
  return (
    (options.nvidiaApiKey?.trim() ?? "").length > 0 ||
    (options.mistralApiKey?.trim() ?? "").length > 0 ||
    (options.openrouterApiKey?.trim() ?? "").length > 0
  );
}

export function providerResultToAiOutput(
  result: AiProviderResult,
  task: AiTask,
  id: string = crypto.randomUUID(),
): AiOutput {
  return aiOutputSchema.parse({
    id,
    task,
    provider: result.provider_used,
    model: result.model,
    raw_output: result.raw_output,
    normalized: result.normalized,
    schema_version: result.schema_version,
    valid: result.valid,
    validation_errors: result.validation_errors,
    fallback_used: result.fallback_active,
    created_at: result.created_at,
  });
}

export function parseAiOutput(value: unknown): AiOutput {
  const result = aiOutputSchema.safeParse(value);
  if (!result.success) {
    throw new CrexError("INVALID_AI_OUTPUT", `invalid ai output: ${result.error.message}`);
  }
  return result.data;
}

export async function runGenerationTask(
  request: ProviderRequest,
  options: ProviderOptions,
  targetSchema?: ZodType<unknown>,
  fetchFn?: typeof globalThis.fetch,
): Promise<AiProviderResult> {
  if (!aiConfigured(options)) {
    throw new CrexError(
      "AI_NOT_CONFIGURED",
      "no AI provider API key is configured; set NVIDIA_API_KEY or MISTRAL_API_KEY",
    );
  }
  return withFallback(
    createProvider("nvidia", options),
    createProvider("openrouter", options),
    request,
    { maxRetries: options.aiMaxRetries, retryBaseDelayMs: options.aiRetryBaseDelayMs },
    targetSchema,
    fetchFn,
  );
}