import { describe, expect, it } from "vitest";
import { corsHeaders, corsPreflight, withCors } from "../src/cors";

describe("corsHeaders", () => {
  it("returns no headers when Origin is absent", () => {
    const headers = corsHeaders(new Request("https://worker.example/health"));
    expect(headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("echoes the request origin and advertises allowed methods/headers", () => {
    const headers = corsHeaders(
      new Request("https://worker.example/health", {
        headers: { Origin: "https://crex.pages.dev" },
      }),
    );
    expect(headers.get("Access-Control-Allow-Origin")).toBe("https://crex.pages.dev");
    expect(headers.get("Vary")).toBe("Origin");
    expect(headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(headers.get("Access-Control-Max-Age")).toBe("86400");
  });
});

describe("withCors", () => {
  it("returns the response unchanged when Origin is absent", () => {
    const request = new Request("https://worker.example/health");
    const response = Response.json({ ok: true });
    expect(withCors(request, response)).toBe(response);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("adds CORS headers to a response for a cross-origin request", () => {
    const request = new Request("https://worker.example/health", {
      headers: { Origin: "https://crex.pages.dev" },
    });
    const response = withCors(request, Response.json({ ok: true }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://crex.pages.dev");
  });

  it("adds CORS headers to error responses", () => {
    const request = new Request("https://worker.example/not-found", {
      headers: { Origin: "https://crex.pages.dev" },
    });
    const response = withCors(request, Response.json({ error: "nope" }, { status: 404 }));
    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://crex.pages.dev");
  });

  it("does not override existing CORS headers", () => {
    const request = new Request("https://worker.example/health", {
      headers: { Origin: "https://crex.pages.dev" },
    });
    const response = new Response(null, {
      headers: { "Access-Control-Allow-Origin": "https://allow.example" },
    });
    expect(withCors(request, response)).toBe(response);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://allow.example");
  });
});

describe("corsPreflight", () => {
  it("answers OPTIONS with 204 and CORS headers", () => {
    const request = new Request("https://worker.example/api", {
      method: "OPTIONS",
      headers: {
        Origin: "https://crex.pages.dev",
        "Access-Control-Request-Method": "POST",
      },
    });
    const response = corsPreflight(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://crex.pages.dev");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });
});