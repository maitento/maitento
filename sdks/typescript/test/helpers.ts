import { Maitento, type MaitentoOptions } from "../src/index.js";

/** One request the mock fetch saw. */
export interface Recorded {
  method: string;
  url: URL;
  path: string;
  headers: Headers;
  /** The JSON-decoded body, the FormData, or undefined. */
  body: unknown;
  rawBody: string | undefined;
}

export type Handler = (request: Recorded, index: number) => Response | Promise<Response>;

/** A fetch that records every request and answers with `handler`. */
export function mockFetch(handler: Handler): { fetch: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    let body: unknown;
    let rawBody: string | undefined;
    if (typeof init?.body === "string") {
      rawBody = init.body;
      body = JSON.parse(init.body);
    } else if (init?.body instanceof FormData) {
      body = init.body;
    }
    const recorded: Recorded = { method: init?.method ?? "GET", url, path: url.pathname, headers, body, rawBody };
    calls.push(recorded);
    if (init?.signal?.aborted) {
      throw init.signal.reason;
    }
    return handler(recorded, calls.length - 1);
  };
  return { fetch: fetchImpl as typeof fetch, calls };
}

/** A JSON response. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

/** An empty response (204 by default). */
export function empty(status = 204, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

/** A plain-text response. */
export function text(body: string, status = 200, contentType = "text/plain; charset=utf-8"): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

export const USER_ID = "b814ac02-0000-4000-8000-000000000001";
export const SECRET = "c2VjcmV0LXNlY3JldC1zZWNyZXQ+/=";

/** A client over a mock fetch, with an API key and namespace `demo`. */
export function testClient(handler: Handler, options: MaitentoOptions = {}): { mt: Maitento; calls: Recorded[] } {
  const { fetch, calls } = mockFetch(handler);
  const mt = new Maitento({
    apiKey: `${USER_ID}:${SECRET}`,
    baseUrl: "https://api.test",
    namespace: "demo",
    fetch,
    maxRetries: 0,
    maxRateLimitRetries: 0,
    ...options,
  });
  return { mt, calls };
}

/** Builds an unsigned JWT with the given claims (the SDK only reads `exp` / `iat`). */
export function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

/** A minimal interaction run as the server writes it. */
export function interactionRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e4c2a1b3-9d8f-4e7a-b6c5-d4e3f2a1b0c9",
    tenantId: "11111111-1111-4111-8111-111111111111",
    userCreatedById: USER_ID,
    interaction: { id: "0e7d9b3c-2f1a-4c5e-9d8b-7a6f5e4d3c2b", version: 1 },
    status: "New",
    dateCreated: "2026-10-26T10:00:00.1234567Z",
    dateUpdated: "2026-10-26T10:00:00.1234567Z",
    dateStarted: null,
    dateEnded: null,
    executionTime: "00:00:00",
    inputs: [],
    output: null,
    failureDetails: null,
    pendingApproval: null,
    context: { agentMessage: [], toolCall: [] },
    ...overrides,
  };
}
