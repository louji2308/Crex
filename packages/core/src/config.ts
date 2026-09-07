import { existsSync } from "node:fs";
import { join } from "node:path";
import { apiErrorSchema } from "@crex/schemas";

export interface EnvConfig {
  nvidiaApiKey: string | undefined;
  mistralApiKey: string | undefined;
}

export interface LoadConfigOptions {
  envPath?: string;
}

export function readToken(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

export function configFromEnv(): EnvConfig {
  return {
    nvidiaApiKey: readToken("NVIDIA_API_KEY"),
    mistralApiKey: readToken("MISTRAL_API_KEY"),
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