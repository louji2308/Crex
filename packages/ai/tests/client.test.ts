import { describe, expect, it, vi, beforeEach } from "vitest";
import { chatCompletions, chatCompletionsWithSchema } from "../src/client.js";
import {
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderAuthFailedError,
  ProviderNotFoundError,
  ProviderInvalidRequestError,
  ProviderUnavailableError,
  ProviderParseError,
  ProviderSchemaRejectionError,
} from "../src/errors.js";

const BASE_URL = "https://example.com/v1";
const API_KEY = "test-api-key";
const MODEL = "test-model";

function makeOpenAIResponse(content: string) {
  return {
    id: "cmpl-test",
    object: "chat.completion",
    created: 1700000000,
    model: MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function stubFetch(responseBody: string | object, status = 200, headers?: Record<string, string>) {
  const bodyStr = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers ?? {})),
    text: vi.fn().mockResolvedValue(bodyStr),
  });
}

function stubFetchNeverResolves() {
  return vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    return new Promise<never>((_, reject) => {
      if (init?.signal) {
        init.signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }
    });
  });
}

describe("chatCompletions", () => {
  it("sends correct HTTP method, URL, Authorization header, and body", async () => {
    const fetchFn = stubFetch(makeOpenAIResponse("hello"));
    const body = { messages: [{ role: "user" as const, content: "hi" }] };
    await chatCompletions(BASE_URL, API_KEY, MODEL, body, {
      timeoutMs: 5000,
      fetch: fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://example.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${API_KEY}`);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.model).toBe(MODEL);
    expect(sentBody.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("returns parsed OpenAI response on 200", async () => {
    const fetchFn = stubFetch(makeOpenAIResponse("result text"));
    const result = await chatCompletions(
      BASE_URL,
      API_KEY,
      MODEL,
      { messages: [{ role: "user", content: "test" }] },
      { timeoutMs: 5000, fetch: fetchFn },
    );
    expect(result.id).toBe("cmpl-test");
    expect(result.choices[0]?.message.content).toBe("result text");
    expect(result.choices).toHaveLength(1);
  });

  it("strips trailing slashes from baseUrl", async () => {
    const fetchFn = stubFetch(makeOpenAIResponse("ok"));
    await chatCompletions(
      "https://example.com/v1///",
      API_KEY,
      MODEL,
      { messages: [{ role: "user", content: "x" }] },
      { timeoutMs: 5000, fetch: fetchFn },
    );
    const [url] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://example.com/v1/chat/completions");
  });

  it("throws ProviderRateLimitError on HTTP 429", async () => {
    const fetchFn = stubFetch('{"error":"rate limited"}', 429);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderRateLimitError);
  });

  it("throws ProviderAuthFailedError on HTTP 401", async () => {
    const fetchFn = stubFetch('{"error":"unauthorized"}', 401);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderAuthFailedError);
  });

  it("throws ProviderAuthFailedError on HTTP 403", async () => {
    const fetchFn = stubFetch('{"error":"forbidden"}', 403);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderAuthFailedError);
  });

  it("throws ProviderNotFoundError on HTTP 404", async () => {
    const fetchFn = stubFetch('{"error":"not found"}', 404);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderNotFoundError);
  });

  it("throws ProviderInvalidRequestError on HTTP 400", async () => {
    const fetchFn = stubFetch('{"error":"bad request"}', 400);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderInvalidRequestError);
  });

  it("throws ProviderUnavailableError on HTTP 500", async () => {
    const fetchFn = stubFetch('{"error":"internal"}', 500);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it("throws ProviderUnavailableError on HTTP 503", async () => {
    const fetchFn = stubFetch('{"error":"service unavailable"}', 503);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it("throws ProviderTimeoutError when fetch never resolves", async () => {
    const fetchFn = stubFetchNeverResolves();
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 50, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderTimeoutError);
  });

  it("throws ProviderParseError on non-JSON body", async () => {
    const fetchFn = stubFetch("not json at all {{{", 200);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderParseError);
  });

  it("throws ProviderParseError on malformed OpenAI shape (no choices)", async () => {
    const fetchFn = stubFetch({ id: "x", choices: [] }, 200);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderParseError);
  });

  it("throws ProviderParseError on missing choices field", async () => {
    const fetchFn = stubFetch({ id: "x" }, 200);
    await expect(
      chatCompletions(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderParseError);
  });
});

describe("chatCompletionsWithSchema", () => {
  it("parses JSON content from choices[0].message.content", async () => {
    const contentObj = { score: 42, label: "good" };
    const fetchFn = stubFetch(makeOpenAIResponse(JSON.stringify(contentObj)));
    const result = await chatCompletionsWithSchema(
      BASE_URL,
      API_KEY,
      MODEL,
      {
        messages: [{ role: "user", content: "analyze" }],
        response_format: { type: "json_object" },
      },
      { timeoutMs: 5000, provider: "nvidia", fetch: fetchFn },
    );
    expect(result.parsed).toEqual(contentObj);
    expect(result.content).toBe(JSON.stringify(contentObj));
  });

  it("throws ProviderSchemaRejectionError on non-JSON content in json_object mode", async () => {
    const fetchFn = stubFetch(makeOpenAIResponse("this is not json"));
    await expect(
      chatCompletionsWithSchema(
        BASE_URL,
        API_KEY,
        MODEL,
        {
          messages: [{ role: "user", content: "analyze" }],
        },
        { timeoutMs: 5000, provider: "mistral", fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderSchemaRejectionError);
  });

  it("throws ProviderParseError when message.content is missing", async () => {
    const badResponse = {
      id: "cmpl-test",
      object: "chat.completion",
      created: 1700000000,
      model: MODEL,
      choices: [{ index: 0, message: { role: "assistant" }, finish_reason: "stop" }],
    };
    const fetchFn = stubFetch(badResponse);
    await expect(
      chatCompletionsWithSchema(
        BASE_URL,
        API_KEY,
        MODEL,
        { messages: [{ role: "user", content: "x" }] },
        { timeoutMs: 5000, provider: "nvidia", fetch: fetchFn },
      ),
    ).rejects.toThrow(ProviderParseError);
  });

  it("sets response_format field in the request body", async () => {
    const fetchFn = stubFetch(makeOpenAIResponse('{"a":1}'));
    await chatCompletionsWithSchema(
      BASE_URL,
      API_KEY,
      MODEL,
      {
        messages: [{ role: "user", content: "x" }],
        response_format: { type: "json_object" },
        response_format_field: { schema: { type: "object" } },
      },
      { timeoutMs: 5000, provider: "nvidia", fetch: fetchFn },
    );
    const sentBody = JSON.parse(fetchFn.mock.calls[0]![1].body as string);
    expect(sentBody.response_format).toEqual({ type: "json_object", schema: { type: "object" } });
  });
});
