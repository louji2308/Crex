import { describe, expect, it } from "vitest";
import {
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

  it("reports failure when no AI credential is configured", () => {
    const savedNvidia = process.env.NVIDIA_API_KEY;
    const savedMistral = process.env.MISTRAL_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    const result = validateConfig({ nvidiaApiKey: undefined, mistralApiKey: undefined });
    expect(result.ok).toBe(false);
    process.env.NVIDIA_API_KEY = savedNvidia;
    process.env.MISTRAL_API_KEY = savedMistral;
  });

  it("passes when at least one credential is present", () => {
    const result = validateConfig({ nvidiaApiKey: "nvidia-key", mistralApiKey: undefined });
    expect(result.ok).toBe(true);
  });
});