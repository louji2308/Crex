const ALLOW_METHODS = "GET, POST, OPTIONS";
const ALLOW_HEADERS = "Content-Type";
const MAX_AGE = "86400";

const CORS_HEADER_NAMES = [
  "Access-Control-Allow-Origin",
  "Vary",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Headers",
  "Access-Control-Max-Age",
] as const;

export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin !== null && origin.length > 0) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
    headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
    headers.set("Access-Control-Max-Age", MAX_AGE);
  }
  return headers;
}

export function withCors(request: Request, response: Response): Response {
  if (response.headers.has("Access-Control-Allow-Origin")) {
    return response;
  }
  const origin = request.headers.get("Origin");
  if (origin === null || origin.length === 0) {
    return response;
  }
  const headers = corsHeaders(request);
  for (const name of CORS_HEADER_NAMES) {
    const value = headers.get(name);
    if (value !== null) {
      response.headers.set(name, value);
    }
  }
  return response;
}

export function corsPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}