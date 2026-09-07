import type { ZodType } from "zod";
import type { ProviderOptions, ProviderRequest, AiProviderResult } from "./types.js";
import { chatCompletionsWithSchema } from "./client.js";
import { ProviderAuthFailedError, ProviderNotFoundError } from "./errors.js";

export interface AiProvider {
  readonly name: "nvidia" | "mistral" | "openrouter";
  generate(
    request: ProviderRequest,
    targetSchema?: ZodType<unknown>,
    fetch?: typeof globalThis.fetch,
  ): Promise<AiProviderResult>;
}

interface ProviderConfig {
  name: "nvidia" | "mistral" | "openrouter";
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

function buildProviderConfig(
  name: "nvidia" | "mistral" | "openrouter",
  options: ProviderOptions,
): ProviderConfig {
  if (name === "nvidia") {
    return {
      name: "nvidia",
      apiKey: options.nvidiaApiKey,
      baseUrl: options.nvidiaBaseUrl,
      model: options.nvidiaModel,
      timeoutMs: options.aiTimeoutMs,
    };
  }
  if (name === "openrouter") {
    return {
      name: "openrouter",
      apiKey: options.openrouterApiKey,
      baseUrl: options.openrouterBaseUrl,
      model: options.openrouterModel,
      timeoutMs: options.aiTimeoutMs,
    };
  }
  return {
    name: "mistral",
    apiKey: options.mistralApiKey,
    baseUrl: options.mistralBaseUrl,
    model: options.mistralModel,
    timeoutMs: options.aiTimeoutMs,
  };
}

function createProviderInstance(config: ProviderConfig): AiProvider {
  return {
    name: config.name,
    async generate(
      request: ProviderRequest,
      targetSchema?: ZodType<unknown>,
      fetchFn?: typeof globalThis.fetch,
    ): Promise<AiProviderResult> {
      if (!config.apiKey) {
        if (config.name === "nvidia") {
          throw new ProviderAuthFailedError(
            config.name,
            `NVIDIA API key is not configured; cannot generate via ${config.name}`,
          );
        }
        if (config.name === "openrouter") {
          throw new ProviderAuthFailedError(
            config.name,
            `OpenRouter API key is not configured; cannot generate via ${config.name}`,
          );
        }
        throw new ProviderAuthFailedError(
          config.name,
          `Mistral API key is not configured; cannot generate via ${config.name}`,
        );
      }

      const start = performance.now();
      const body: Record<string, unknown> = {
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      };
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
      if (request.response_format) body.response_format = request.response_format;

      const responseFormatField: Record<string, unknown> | undefined =
        targetSchema !== undefined ? { schema: targetSchema } : undefined;

      const { content, parsed } = await chatCompletionsWithSchema(
        config.baseUrl,
        config.apiKey,
        config.model,
        {
          messages: body.messages as { role: "system" | "user" | "assistant"; content: string }[],
          temperature: body.temperature as number | undefined,
          max_tokens: body.max_tokens as number | undefined,
          response_format: request.response_format ?? { type: "json_object" },
          response_format_field: responseFormatField,
        },
        {
          timeoutMs: config.timeoutMs,
          provider: config.name,
          fetch: fetchFn,
        },
      );

      const duration = performance.now() - start;

      let valid = true;
      let validationErrors: string[] = [];
      if (targetSchema !== undefined) {
        const result = targetSchema.safeParse(parsed);
        if (result.success) {
          valid = true;
        } else {
          valid = false;
          validationErrors = result.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          );
        }
      }

      return {
        primary_provider: config.name,
        provider_used: config.name,
        fallback_active: false,
        fallback_reason: null,
        model: config.model,
        raw_output: content,
        normalized: parsed,
        valid,
        validation_errors: validationErrors,
        task: request.task,
        schema_version: "0.1.0",
        created_at: new Date().toISOString(),
        duration_ms: Math.round(duration),
      };
    },
  };
}

export function createProvider(
  name: "nvidia" | "mistral" | "openrouter",
  options: ProviderOptions,
): AiProvider {
  const config = buildProviderConfig(name, options);
  return createProviderInstance(config);
}
