import { z } from "zod";
import type { ZodType } from "zod";
import type { AiProviderResult } from "./types.js";
import { nowIso } from "@crex/schemas";

export interface ValidateAiResultOptions {
  task: string;
  provider_used: string;
  primary_provider: string;
  model: string;
  raw_output: string;
  schema_version: string;
  duration_ms: number;
  fallback_active: boolean;
  fallback_reason: string | null;
}

export function validateAiResult(
  parsedJson: unknown,
  targetSchema: ZodType<unknown>,
  meta: ValidateAiResultOptions,
): AiProviderResult {
  const result = targetSchema.safeParse(parsedJson);
  if (result.success) {
    return {
      primary_provider: meta.primary_provider as AiProviderResult["primary_provider"],
      provider_used: meta.provider_used as AiProviderResult["provider_used"],
      fallback_active: meta.fallback_active,
      fallback_reason: meta.fallback_reason,
      model: meta.model,
      raw_output: meta.raw_output,
      normalized: parsedJson,
      valid: true,
      validation_errors: [],
      task: meta.task,
      schema_version: meta.schema_version,
      created_at: nowIso(),
      duration_ms: meta.duration_ms,
    };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return {
    primary_provider: meta.primary_provider as AiProviderResult["primary_provider"],
    provider_used: meta.provider_used as AiProviderResult["provider_used"],
    fallback_active: meta.fallback_active,
    fallback_reason: meta.fallback_reason,
    model: meta.model,
    raw_output: meta.raw_output,
    normalized: parsedJson,
    valid: false,
    validation_errors: errors,
    task: meta.task,
    schema_version: meta.schema_version,
    created_at: nowIso(),
    duration_ms: meta.duration_ms,
  };
}
