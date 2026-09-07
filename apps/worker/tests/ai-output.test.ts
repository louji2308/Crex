import { describe, expect, it, vi } from "vitest";
import { CrexError } from "@crex/core/src/errors";
import type { AiProviderResult, ProviderRequest } from "@crex/ai";
import { sourceUnderstandingSchema } from "@crex/schemas/src/ai-tasks";
import {
  DEFAULT_AI_MAX_RETRIES,
  DEFAULT_AI_RETRY_BASE_DELAY_MS,
  DEFAULT_AI_TIMEOUT_MS,
  DEFAULT_MISTRAL_BASE_URL,
  DEFAULT_MISTRAL_MODEL,
  DEFAULT_NVIDIA_BASE_URL,
  DEFAULT_NVIDIA_MODEL,
  aiConfigured,
  buildProviderOptions,
  parseAiOutput,
  providerResultToAiOutput,
  runGenerationTask,
} from "../src/workflows/ai-output";

function stubFetchWith(content: string): typeof fetch {
  const body = {
    id: "cmpl-test",
    object: "chat.completion",
    created: 1,
    model: "stub-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
  };
  return (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
}

describe("buildProviderOptions", () => {
  it("applies sensible defaults when vars are absent", () => {
    const options = buildProviderOptions({});
    expect(options.nvidiaBaseUrl).toBe(DEFAULT_NVIDIA_BASE_URL);
    expect(options.nvidiaModel).toBe(DEFAULT_NVIDIA_MODEL);
    expect(options.mistralBaseUrl).toBe(DEFAULT_MISTRAL_BASE_URL);
    expect(options.mistralModel).toBe(DEFAULT_MISTRAL_MODEL);
    expect(options.aiTimeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS);
    expect(options.aiMaxRetries).toBe(DEFAULT_AI_MAX_RETRIES);
    expect(options.aiRetryBaseDelayMs).toBe(DEFAULT_AI_RETRY_BASE_DELAY_MS);
    expect(options.nvidiaApiKey).toBeUndefined();
    expect(options.mistralApiKey).toBeUndefined();
  });

  it("honors configured vars", () => {
    const options = buildProviderOptions({
      NVIDIA_API_KEY: "nvidia-key",
      NVIDIA_BASE_URL: "https://custom.nvidia.example/v1",
      NVIDIA_MODEL: "model-a",
      MISTRAL_API_KEY: "mistral-key",
      AI_TIMEOUT_MS: "5000",
      AI_MAX_RETRIES: "1",
      AI_RETRY_BASE_DELAY_MS: "250",
    });
    expect(options.nvidiaApiKey).toBe("nvidia-key");
    expect(options.nvidiaBaseUrl).toBe("https://custom.nvidia.example/v1");
    expect(options.nvidiaModel).toBe("model-a");
    expect(options.mistralApiKey).toBe("mistral-key");
    expect(options.aiTimeoutMs).toBe(5000);
    expect(options.aiMaxRetries).toBe(1);
    expect(options.aiRetryBaseDelayMs).toBe(250);
  });

  it("falls back to defaults for malformed numeric vars", () => {
    const options = buildProviderOptions({
      AI_TIMEOUT_MS: "0",
      AI_MAX_RETRIES: "not-a-number",
      AI_RETRY_BASE_DELAY_MS: "-5",
    });
    expect(options.aiTimeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS);
    expect(options.aiMaxRetries).toBe(DEFAULT_AI_MAX_RETRIES);
    expect(options.aiRetryBaseDelayMs).toBe(DEFAULT_AI_RETRY_BASE_DELAY_MS);
  });
});

describe("aiConfigured", () => {
  it("is false when no keys are set", () => {
    const options = buildProviderOptions({});
    expect(aiConfigured(options)).toBe(false);
  });

  it("is true when either key is set", () => {
    expect(aiConfigured(buildProviderOptions({ NVIDIA_API_KEY: "k" }))).toBe(true);
    expect(aiConfigured(buildProviderOptions({ MISTRAL_API_KEY: "k" }))).toBe(true);
  });
});

describe("providerResultToAiOutput", () => {
  const result: AiProviderResult = {
    primary_provider: "nvidia",
    provider_used: "mistral",
    fallback_active: true,
    fallback_reason: "upstream_500",
    model: "mistral-large-latest",
    raw_output: '{"summary":"s","claims":["c"]}',
    normalized: { summary: "s", claims: ["c"] },
    valid: true,
    validation_errors: [],
    task: "SEMANTIC_UNDERSTANDING",
    schema_version: "0.1.0",
    created_at: "2026-01-02T03:04:05.000Z",
    duration_ms: 120,
  };

  it("maps a provider result into an AiOutput envelope", () => {
    const output = providerResultToAiOutput(result, "SEMANTIC_UNDERSTANDING");
    expect(output.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(output.provider).toBe("mistral");
    expect(output.model).toBe("mistral-large-latest");
    expect(output.fallback_used).toBe(true);
    expect(output.raw_output).toBe(result.raw_output);
    expect(output.valid).toBe(true);
    expect(output.created_at).toBe(result.created_at);
    expect(output.task).toBe("SEMANTIC_UNDERSTANDING");
  });

  it("accepts a caller-provided id", () => {
    const output = providerResultToAiOutput(result, "SEMANTIC_UNDERSTANDING", "99999999-9999-4999-8999-999999999999");
    expect(output.id).toBe("99999999-9999-4999-8999-999999999999");
  });

  it("rejects an unknown task", () => {
    expect(() =>
      providerResultToAiOutput(result, "NOT_A_TASK" as "SEMANTIC_UNDERSTANDING"),
    ).toThrow();
  });
});

describe("parseAiOutput", () => {
  it("round-trips a valid AiOutput", () => {
    const output = providerResultToAiOutput(
      {
        primary_provider: "nvidia",
        provider_used: "nvidia",
        fallback_active: false,
        fallback_reason: null,
        model: "meta/llama-3.3-70b-instruct",
        raw_output: '{"summary":"s","claims":["c"]}',
        normalized: { summary: "s", claims: ["c"] },
        valid: true,
        validation_errors: [],
        task: "SEMANTIC_UNDERSTANDING",
        schema_version: "0.1.0",
        created_at: "2026-01-02T03:04:05.000Z",
        duration_ms: 9,
      },
      "SEMANTIC_UNDERSTANDING",
    );
    expect(parseAiOutput(output)).toEqual(output);
  });

  it("throws a CrexError for an invalid output", () => {
    try {
      parseAiOutput({ id: "not-a-uuid" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CrexError);
      expect((error as CrexError).code).toBe("INVALID_AI_OUTPUT");
    }
  });
});

describe("runGenerationTask", () => {
  const request: ProviderRequest = {
    messages: [
      {
        role: "system",
        content: "Respond with strict JSON matching the summary/claims shape.",
      },
      { role: "user", content: "Analyze: Test Project." },
    ],
    task: "SEMANTIC_UNDERSTANDING",
    response_format: { type: "json_object" },
  };

  it("throws AI_NOT_CONFIGURED when no API key is configured", async () => {
    await expect(runGenerationTask(request, buildProviderOptions({}))).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
  });

  it("generates, validates and returns a normalized result", async () => {
    const fetchFn = stubFetchWith(
      '{"summary":"The laptop holds a charge for eighteen hours.","claims":["The laptop battery lasts eighteen hours."]}',
    );
    const options = buildProviderOptions({ NVIDIA_API_KEY: "stub-key" });
    const result = await runGenerationTask(request, options, sourceUnderstandingSchema, fetchFn);
    expect(result.valid).toBe(true);
    expect(result.validation_errors).toEqual([]);
    expect(result.normalized).toEqual({
      summary: "The laptop holds a charge for eighteen hours.",
      claims: ["The laptop battery lasts eighteen hours."],
    });
    expect(result.provider_used).toBe("nvidia");
    expect(result.fallback_active).toBe(false);
  });

  it("marks invalid normalized output when the model ignores the schema", async () => {
    const fetchFn = stubFetchWith('{"unexpected": true}');
    const options = buildProviderOptions({ NVIDIA_API_KEY: "stub-key" });
    const result = await runGenerationTask(request, options, sourceUnderstandingSchema, fetchFn);
    expect(result.valid).toBe(false);
    expect(result.validation_errors.length).toBeGreaterThan(0);
  });

  it("falls back to the second provider when the primary fails", async () => {
    const failingPrimary = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("nvidia")) {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      const body = {
        id: "cmpl-test",
        object: "chat.completion",
        created: 1,
        model: "stub-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content:
                '{"summary":"The laptop holds a charge for eighteen hours.","claims":["The laptop battery lasts eighteen hours."]}',
            },
            finish_reason: "stop",
          },
        ],
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const options = buildProviderOptions({
      NVIDIA_API_KEY: "nvidia-key",
      OPENROUTER_API_KEY: "openrouter-key",
      AI_MAX_RETRIES: "0",
    });
    const result = await runGenerationTask(request, options, sourceUnderstandingSchema, failingPrimary);
    expect(result.provider_used).toBe("openrouter");
    expect(result.primary_provider).toBe("nvidia");
    expect(result.fallback_active).toBe(true);
    expect(result.fallback_reason).toBe("upstream_500");
  });

  it("propagates non-retryable provider errors", async () => {
    const unauthorized = (async () =>
      new Response(JSON.stringify({ error: "bad key" }), { status: 401 })) as typeof fetch;
    const options = buildProviderOptions({ NVIDIA_API_KEY: "bad-key", AI_MAX_RETRIES: "2" });
    await expect(
      runGenerationTask(request, options, sourceUnderstandingSchema, unauthorized),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
  });
});