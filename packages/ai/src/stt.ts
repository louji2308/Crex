import {
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderAuthFailedError,
  ProviderNotFoundError,
  ProviderInvalidRequestError,
  ProviderUnavailableError,
  ProviderParseError,
} from "./errors.js";

export interface SttProvider {
  readonly name: "mistral" | "openrouter";
  transcribe(
    audioBase64: string,
    options: SttTranscribeOptions,
    fetch?: typeof globalThis.fetch,
  ): Promise<SttTranscriptionResult>;
}

export interface SttTranscribeOptions {
  language?: string;
  model?: string;
  responseFormat?: "json" | "verbose_json";
  timestampGranularities?: ("segment" | "word")[];
}

export interface SttTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: SttSegment[];
  provider: string;
  model: string;
  fallbackUsed: boolean;
}

export interface SttSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
}

interface SttProviderConfig {
  name: "mistral" | "openrouter";
  apiKey: string | undefined;
  baseUrl: string;
  defaultModel: string;
  timeoutMs: number;
}

function classifySttHttpStatus(provider: string, status: number, body: string): never {
  if (status === 429) {
    throw new ProviderRateLimitError(provider, `${provider} STT returned HTTP 429 rate limit: ${truncate(body, 200)}`);
  }
  if (status === 401 || status === 403) {
    throw new ProviderAuthFailedError(provider, `${provider} STT rejected credentials (HTTP ${status}): ${truncate(body, 200)}`);
  }
  if (status === 404) {
    throw new ProviderNotFoundError(provider, `${provider} STT model not found (HTTP 404): ${truncate(body, 200)}`);
  }
  if (status === 400) {
    throw new ProviderInvalidRequestError(provider, `${provider} STT rejected request (HTTP 400): ${truncate(body, 200)}`);
  }
  if (status >= 500) {
    throw new ProviderUnavailableError(provider, `${provider} STT upstream error (HTTP ${status}): ${truncate(body, 200)}`);
  }
  throw new ProviderParseError(provider, `${provider} STT unexpected HTTP ${status}: ${truncate(body, 200)}`);
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function createMistralSttProvider(config: SttProviderConfig): SttProvider {
  return {
    name: "mistral",
    async transcribe(audioBase64: string, options: SttTranscribeOptions, fetchFn?: typeof globalThis.fetch): Promise<SttTranscriptionResult> {
      if (!config.apiKey) {
        throw new ProviderAuthFailedError("mistral", "Mistral API key is not configured; cannot use Mistral STT");
      }

      const model = options.model ?? config.defaultModel;
      const url = `${config.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      const doFetch = fetchFn ?? globalThis.fetch;

      const requestBody = {
        model,
        input_audio: {
          data: audioBase64,
          format: "wav",
        },
        language: options.language,
        response_format: options.responseFormat ?? "verbose_json",
      };

      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } catch (error: unknown) {
        clearTimeout(timer);
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ProviderTimeoutError("mistral", `Mistral STT request timed out after ${config.timeoutMs}ms`, { cause: error });
        }
        throw new ProviderParseError("mistral", `Mistral STT request failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      clearTimeout(timer);

      const rawBody = await response.text();
      if (!response.ok) {
        classifySttHttpStatus("mistral", response.status, rawBody);
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawBody) as Record<string, unknown>;
      } catch (error: unknown) {
        throw new ProviderParseError("mistral", `Mistral STT returned non-JSON: ${truncate(rawBody, 200)}`, { cause: error });
      }

      const text = typeof parsed.text === "string" ? parsed.text : "";
      const language = typeof parsed.language === "string" ? parsed.language : undefined;
      const duration = typeof parsed.duration === "number" ? parsed.duration : undefined;

      const segments: SttSegment[] | undefined = Array.isArray(parsed.segments)
        ? (parsed.segments as Record<string, unknown>[]).map((seg) => ({
            id: typeof seg.id === "number" ? seg.id : undefined,
            start: typeof seg.start === "number" ? seg.start : 0,
            end: typeof seg.end === "number" ? seg.end : 0,
            text: typeof seg.text === "string" ? seg.text : "",
          }))
        : undefined;

      return {
        text,
        language,
        duration,
        segments,
        provider: "mistral",
        model,
        fallbackUsed: false,
      };
    },
  };
}

function createOpenRouterSttProvider(config: SttProviderConfig): SttProvider {
  return {
    name: "openrouter",
    async transcribe(audioBase64: string, options: SttTranscribeOptions, fetchFn?: typeof globalThis.fetch): Promise<SttTranscriptionResult> {
      if (!config.apiKey) {
        throw new ProviderAuthFailedError("openrouter", "OpenRouter API key is not configured; cannot use OpenRouter STT");
      }

      const model = options.model ?? config.defaultModel;
      const url = `${config.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      const doFetch = fetchFn ?? globalThis.fetch;

      const requestBody: Record<string, unknown> = {
        model,
        input_audio: {
          data: audioBase64,
          format: "wav",
        },
      };
      if (options.language) requestBody.language = options.language;
      if (options.responseFormat) requestBody.response_format = options.responseFormat;

      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } catch (error: unknown) {
        clearTimeout(timer);
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ProviderTimeoutError("openrouter", `OpenRouter STT request timed out after ${config.timeoutMs}ms`, { cause: error });
        }
        throw new ProviderParseError("openrouter", `OpenRouter STT request failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      clearTimeout(timer);

      const rawBody = await response.text();
      if (!response.ok) {
        classifySttHttpStatus("openrouter", response.status, rawBody);
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawBody) as Record<string, unknown>;
      } catch (error: unknown) {
        throw new ProviderParseError("openrouter", `OpenRouter STT returned non-JSON: ${truncate(rawBody, 200)}`, { cause: error });
      }

      const text = typeof parsed.text === "string" ? parsed.text : "";
      const language = typeof parsed.language === "string" ? parsed.language : undefined;
      const duration = typeof parsed.duration === "number" ? parsed.duration : undefined;

      const segments: SttSegment[] | undefined = Array.isArray(parsed.segments)
        ? (parsed.segments as Record<string, unknown>[]).map((seg) => ({
            id: typeof seg.id === "number" ? seg.id : undefined,
            start: typeof seg.start === "number" ? seg.start : 0,
            end: typeof seg.end === "number" ? seg.end : 0,
            text: typeof seg.text === "string" ? seg.text : "",
          }))
        : undefined;

      return {
        text,
        language,
        duration,
        segments,
        provider: "openrouter",
        model,
        fallbackUsed: false,
      };
    },
  };
}

export interface CreateSttProviderOptions {
  mistralApiKey?: string;
  mistralBaseUrl: string;
  mistralModel: string;
  openrouterApiKey?: string;
  openrouterBaseUrl: string;
  openrouterModel: string;
  timeoutMs: number;
}

export function createSttProvider(
  name: "mistral" | "openrouter",
  options: CreateSttProviderOptions,
): SttProvider {
  if (name === "mistral") {
    return createMistralSttProvider({
      name: "mistral",
      apiKey: options.mistralApiKey,
      baseUrl: options.mistralBaseUrl,
      defaultModel: options.mistralModel,
      timeoutMs: options.timeoutMs,
    });
  }
  return createOpenRouterSttProvider({
    name: "openrouter",
    apiKey: options.openrouterApiKey,
    baseUrl: options.openrouterBaseUrl,
    defaultModel: options.openrouterModel,
    timeoutMs: options.timeoutMs,
  });
}

export interface WithSttFallbackOptions {
  maxRetries: number;
  retryBaseDelayMs: number;
}

function isRetryableSttError(error: unknown): boolean {
  return (
    error instanceof ProviderRateLimitError ||
    error instanceof ProviderTimeoutError ||
    error instanceof ProviderUnavailableError ||
    error instanceof ProviderParseError
  );
}

function sttRetryableReason(error: unknown): string {
  if (error instanceof ProviderRateLimitError) return "rate_limit";
  if (error instanceof ProviderTimeoutError) return "timeout";
  if (error instanceof ProviderUnavailableError) return "upstream_500";
  if (error instanceof ProviderParseError) return "parse_error";
  return "unknown";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withSttFallback(
  primary: SttProvider,
  fallback: SttProvider,
  audioBase64: string,
  options: SttTranscribeOptions,
  fallbackOptions: WithSttFallbackOptions,
  fetchFn?: typeof globalThis.fetch,
): Promise<SttTranscriptionResult> {
  let lastPrimaryError: unknown = undefined;

  for (let attempt = 0; attempt <= fallbackOptions.maxRetries; attempt++) {
    try {
      return await primary.transcribe(audioBase64, options, fetchFn);
    } catch (error: unknown) {
      if (!isRetryableSttError(error)) {
        throw error;
      }
      lastPrimaryError = error;
      if (attempt < fallbackOptions.maxRetries) {
        await delay(fallbackOptions.retryBaseDelayMs * Math.pow(2, attempt));
      }
    }
  }

  const primaryReason = sttRetryableReason(lastPrimaryError);
  const fallbackResult = await fallback.transcribe(audioBase64, options, fetchFn);

  return {
    ...fallbackResult,
    provider: fallback.name,
    fallbackUsed: true,
  };
}
