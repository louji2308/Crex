import {
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderAuthFailedError,
  ProviderNotFoundError,
  ProviderInvalidRequestError,
  ProviderUnavailableError,
  ProviderParseError,
  ProviderSchemaRejectionError,
} from "./errors.js";
import type { OpenAIChatCompletionBody, OpenAIChatCompletionResponse } from "./types.js";

export interface ChatCompletionsOptions {
  timeoutMs: number;
  fetch?: typeof globalThis.fetch;
}

function classifyHttpStatus(provider: string, status: number, body: string): never {
  if (status === 429) {
    throw new ProviderRateLimitError(
      provider,
      `${provider} returned HTTP 429 rate limit: ${truncate(body, 200)}`,
    );
  }
  if (status === 401 || status === 403) {
    throw new ProviderAuthFailedError(
      provider,
      `${provider} rejected credentials (HTTP ${status}): ${truncate(body, 200)}`,
    );
  }
  if (status === 404) {
    throw new ProviderNotFoundError(
      provider,
      `${provider} model or endpoint not found (HTTP 404): ${truncate(body, 200)}`,
    );
  }
  if (status === 400) {
    throw new ProviderInvalidRequestError(
      provider,
      `${provider} rejected request as invalid (HTTP 400): ${truncate(body, 200)}`,
    );
  }
  if (status >= 500) {
    throw new ProviderUnavailableError(
      provider,
      `${provider} upstream error (HTTP ${status}): ${truncate(body, 200)}`,
    );
  }
  throw new ProviderParseError(
    provider,
    `${provider} returned unexpected HTTP ${status}: ${truncate(body, 200)}`,
  );
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

export async function chatCompletions(
  baseUrl: string,
  apiKey: string,
  model: string,
  body: Omit<OpenAIChatCompletionBody, "model">,
  opts: ChatCompletionsOptions,
): Promise<OpenAIChatCompletionResponse> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const fullBody: OpenAIChatCompletionBody = { ...body, model };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const fetchFn = opts.fetch ?? globalThis.fetch;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(fullBody),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    clearTimeout(timer);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderTimeoutError(
        `request to ${url} timed out after ${opts.timeoutMs}ms`,
        `request to ${url} timed out after ${opts.timeoutMs}ms`,
        { cause: error },
      );
    }
    throw new ProviderParseError(
      `network request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
      `network request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  clearTimeout(timer);

  const rawBody = await response.text();

  if (!response.ok) {
    classifyHttpStatus(url, response.status, rawBody);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (error: unknown) {
    throw new ProviderParseError(
      `${url} returned non-JSON body: ${truncate(rawBody, 200)}`,
      `${url} returned non-JSON body: ${truncate(rawBody, 200)}`,
      { cause: error },
    );
  }

  const completion = parsed as OpenAIChatCompletionResponse;
  if (!completion.choices || !Array.isArray(completion.choices) || completion.choices.length === 0) {
    throw new ProviderParseError(
      `${url} returned malformed OpenAI response: missing or empty "choices" array`,
      `${url} returned malformed OpenAI response: missing or empty "choices" array`,
    );
  }

  return completion;
}

export interface ChatCompletionsWithSchemaOptions extends ChatCompletionsOptions {
  provider: string;
}

export async function chatCompletionsWithSchema(
  baseUrl: string,
  apiKey: string,
  model: string,
  body: Omit<OpenAIChatCompletionBody, "model"> & {
    response_format?: { type: "json_object" };
    response_format_field?: Record<string, unknown>;
  },
  opts: ChatCompletionsWithSchemaOptions,
): Promise<{ content: string; parsed: unknown }> {
  const schemaBody: Omit<OpenAIChatCompletionBody, "model"> = {
    ...body,
    response_format: body.response_format ?? { type: "json_object" },
  };
  if (body.response_format_field) {
    (schemaBody as Record<string, unknown>)["response_format"] = {
      type: "json_object",
      ...body.response_format_field,
    };
  }

  const completion = await chatCompletions(baseUrl, apiKey, model, schemaBody, {
    timeoutMs: opts.timeoutMs,
    fetch: opts.fetch,
  });

  const message = completion.choices[0]?.message;
  if (!message || typeof message.content !== "string") {
    throw new ProviderParseError(
      `${opts.provider} response missing message.content`,
      `${opts.provider} response missing message.content`,
    );
  }

  const content = message.content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error: unknown) {
    throw new ProviderSchemaRejectionError(
      `${opts.provider} returned non-JSON content despite json_object response format: ${truncate(content, 200)}`,
      `${opts.provider} returned non-JSON content despite json_object response format: ${truncate(content, 200)}`,
      { cause: error },
    );
  }

  return { content, parsed };
}
