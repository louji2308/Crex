import { existsSync } from "node:fs";
import { join } from "node:path";
import { apiErrorSchema } from "@crex/schemas";

export interface EnvConfig {
  nvidiaApiKey: string | undefined;
  mistralApiKey: string | undefined;
  nvidiaBaseUrl: string;
  nvidiaModel: string;
  mistralBaseUrl: string;
  mistralModel: string;
  aiTimeoutMs: number;
  aiMaxRetries: number;
  aiRetryBaseDelayMs: number;
}

export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
export const DEFAULT_AI_TIMEOUT_MS = 60_000;
export const DEFAULT_AI_MAX_RETRIES = 2;
export const DEFAULT_AI_RETRY_BASE_DELAY_MS = 1_000;

export interface LoadConfigOptions {
  envPath?: string;
}

export function readToken(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function configFromEnv(): EnvConfig {
  return {
    nvidiaApiKey: readToken("NVIDIA_API_KEY"),
    mistralApiKey: readToken("MISTRAL_API_KEY"),
    nvidiaBaseUrl:
      readToken("NVIDIA_BASE_URL") ?? DEFAULT_NVIDIA_BASE_URL,
    nvidiaModel: readToken("NVIDIA_MODEL") ?? "meta/llama-3.3-70b-instruct",
    mistralBaseUrl:
      readToken("MISTRAL_BASE_URL") ?? DEFAULT_MISTRAL_BASE_URL,
    mistralModel: readToken("MISTRAL_MODEL") ?? "mistral-large-latest",
    aiTimeoutMs: readPositiveInt("AI_TIMEOUT_MS", DEFAULT_AI_TIMEOUT_MS),
    aiMaxRetries: readPositiveInt("AI_MAX_RETRIES", DEFAULT_AI_MAX_RETRIES),
    aiRetryBaseDelayMs: readPositiveInt(
      "AI_RETRY_BASE_DELAY_MS",
      DEFAULT_AI_RETRY_BASE_DELAY_MS,
    ),
  };
}

export function loadConfig(options: LoadConfigOptions = {}): EnvConfig {
  const envPath = options.envPath ?? join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
  return configFromEnv();
}

export function validateConfig(config: EnvConfig): { ok: boolean; error?: { code: string; message: string } } {
  if (config.nvidiaApiKey === undefined && config.mistralApiKey === undefined) {
    return {
      ok: false,
      error: {
        code: "MISSING_AI_CREDENTIALS",
        message: "At least one of NVIDIA_API_KEY or MISTRAL_API_KEY must be set.",
      },
    };
  }
  return { ok: true };
}

export function validateApiErrorShape(value: unknown): { ok: boolean } {
  const result = apiErrorSchema.safeParse(value);
  return { ok: result.success };
}