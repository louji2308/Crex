import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_MAX_RETRIES,
  DEFAULT_AI_RETRY_BASE_DELAY_MS,
  DEFAULT_AI_TIMEOUT_MS,
  DEFAULT_MISTRAL_BASE_URL,
  DEFAULT_NVIDIA_BASE_URL,
  configFromEnv,
  loadConfig,
  validateConfig,
} from "../src/config.js";

describe("config", () => {
  it("reads provider tokens from environment", () => {
    process.env.NVIDIA_API_KEY = "nv-test-key";
    process.env.MISTRAL_API_KEY = "mi-test-key";
    const config = configFromEnv();
    expect(config.nvidiaApiKey).toBe("nv-test-key");
    expect(config.mistralApiKey).toBe("mi-test-key");
    delete process.env.NVIDIA_API_KEY;
    delete process.env.MISTRAL_API_KEY;
  });

  it("treats a missing or blank token as undefined", () => {
    delete process.env.NVIDIA_API_KEY;
    process.env.MISTRAL_API_KEY = "";
    const config = configFromEnv();
    expect(config.nvidiaApiKey).toBeUndefined();
    expect(config.mistralApiKey).toBeUndefined();
    delete process.env.MISTRAL_API_KEY;
  });

  it("loads .env into the process environment", () => {
    const envPath = `${process.cwd()}/tests/fixtures/test.env`;
    const config = loadConfig({ envPath });
    expect(typeof config.nvidiaApiKey).toBe("string");
    expect(config.nvidiaApiKey).toBe("fixture-nvidia-key");
  });

  it("applies documented defaults for provider endpoints and tuning", () => {
    delete process.env.NVIDIA_BASE_URL;
    delete process.env.MISTRAL_BASE_URL;
    delete process.env.AI_TIMEOUT_MS;
    delete process.env.AI_MAX_RETRIES;
    delete process.env.AI_RETRY_BASE_DELAY_MS;
    const config = configFromEnv();
    expect(config.nvidiaBaseUrl).toBe(DEFAULT_NVIDIA_BASE_URL);
    expect(config.mistralBaseUrl).toBe(DEFAULT_MISTRAL_BASE_URL);
    expect(config.nvidiaModel).toBe("meta/llama-3.3-70b-instruct");
    expect(config.mistralModel).toBe("mistral-large-latest");
    expect(config.aiTimeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS);
    expect(config.aiMaxRetries).toBe(DEFAULT_AI_MAX_RETRIES);
    expect(config.aiRetryBaseDelayMs).toBe(DEFAULT_AI_RETRY_BASE_DELAY_MS);
  });

  it("parses tuning overrides from the environment", () => {
    process.env.AI_TIMEOUT_MS = "30000";
    process.env.AI_MAX_RETRIES = "3";
    process.env.AI_RETRY_BASE_DELAY_MS = "250";
    const config = configFromEnv();
    expect(config.aiTimeoutMs).toBe(30000);
    expect(config.aiMaxRetries).toBe(3);
    expect(config.aiRetryBaseDelayMs).toBe(250);
    delete process.env.AI_TIMEOUT_MS;
    delete process.env.AI_MAX_RETRIES;
    delete process.env.AI_RETRY_BASE_DELAY_MS;
  });

  it("ignores non-positive tuning values and falls back to defaults", () => {
    process.env.AI_TIMEOUT_MS = "0";
    process.env.AI_MAX_RETRIES = "-1";
    process.env.AI_RETRY_BASE_DELAY_MS = "abc";
    const config = configFromEnv();
    expect(config.aiTimeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS);
    expect(config.aiMaxRetries).toBe(DEFAULT_AI_MAX_RETRIES);
    expect(config.aiRetryBaseDelayMs).toBe(DEFAULT_AI_RETRY_BASE_DELAY_MS);
    delete process.env.AI_TIMEOUT_MS;
    delete process.env.AI_MAX_RETRIES;
    delete process.env.AI_RETRY_BASE_DELAY_MS;
  });

  it("reports failure when no AI credential is configured", () => {
    const savedNvidia = process.env.NVIDIA_API_KEY;
    const savedMistral = process.env.MISTRAL_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    const result = validateConfig({ ...configFromEnv(), nvidiaApiKey: undefined, mistralApiKey: undefined });
    expect(result.ok).toBe(false);
    process.env.NVIDIA_API_KEY = savedNvidia;
    process.env.MISTRAL_API_KEY = savedMistral;
  });

  it("passes when at least one credential is present", () => {
    const result = validateConfig({ ...configFromEnv(), nvidiaApiKey: "nvidia-key", mistralApiKey: undefined });
    expect(result.ok).toBe(true);
  });
});