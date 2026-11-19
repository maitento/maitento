import { describe, expect, it } from "vitest";
import { ConnectionError, RateLimitError } from "../src/index.js";
import { HttpClient, type HttpRequest } from "../src/core/http.js";
import { json, mockFetch, testClient, type Handler } from "./helpers.js";

function http(handler: Handler, maxRetries = 2): { client: HttpClient; calls: { length: number }; waits: number[] } {
  const { fetch, calls } = mockFetch(handler);
  const waits: number[] = [];
  const client = new HttpClient({
    baseUrl: "https://api.test",
    timeout: 5000,
    maxRetries,
    fetch,
    sleep: async (ms) => {
      waits.push(ms);
    },
    random: () => 0.5,
  });
  return { client, calls, waits };
}

const GET: HttpRequest = { method: "GET", path: "/ai-models", response: "AiModel[]" };

describe("retries: idempotent calls only", () => {
  it("retries a GET on 502, 503, 504 and 429 with exponential backoff", async () => {
    const statuses = [502, 503, 504];
    const { client, calls, waits } = http((_, i) => (i < statuses.length ? json({}, statuses[i]) : json([])), 3);
    await expect(client.request(GET)).resolves.toEqual([]);
    expect(calls.length).toBe(4);
    // 500 ms doubling, jitter fixed at 1.0 by random() = 0.5.
    expect(waits).toEqual([500, 1000, 2000]);
  });

  it("retries a network error on a GET", async () => {
    const { client, calls } = http((_, i) => {
      if (i === 0) throw new TypeError("socket hang up");
      return json([]);
    });
    await expect(client.request(GET)).resolves.toEqual([]);
    expect(calls.length).toBe(2);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const { client, calls } = http(() => json({}, 503), 2);
    await expect(client.request(GET)).rejects.toMatchObject({ status: 503 });
    expect(calls.length).toBe(3);
  });

  it("never retries a 4xx other than 429, nor a 500", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      const { client, calls } = http(() => json({}, status));
      await expect(client.request(GET)).rejects.toMatchObject({ status });
      expect(calls.length).toBe(1);
    }
  });

  it("honours Retry-After (seconds) and the 429 body's retryAfterSeconds", async () => {
    const header = http((_, i) => (i === 0 ? json({}, 503, { "retry-after": "2" }) : json([])));
    await header.client.request(GET);
    expect(header.waits).toEqual([2000]);

    const body = http((_, i) => (i === 0 ? json({ code: "api:rate-limited", retryAfterSeconds: 4 }, 429) : json([])));
    await body.client.request(GET);
    expect(body.waits).toEqual([4000]);
  });

  it("honours Retry-After as an HTTP date", async () => {
    const at = new Date(Date.now() + 3000).toUTCString();
    const { client, waits } = http((_, i) => (i === 0 ? json({}, 503, { "retry-after": at }) : json([])));
    await client.request(GET);
    expect(waits[0]).toBeGreaterThan(1000);
    expect(waits[0]).toBeLessThanOrEqual(3000);
  });

  it("does not sit out a Retry-After longer than a minute: the error comes back at once", async () => {
    const { client, calls, waits } = http(() => json({ retryAfterSeconds: 600 }, 429, { "retry-after": "600" }));
    await expect(client.request(GET)).rejects.toBeInstanceOf(RateLimitError);
    expect(calls.length).toBe(1);
    expect(waits).toEqual([]);
  });

  it("never retries a POST or PUT unless the SDK marks it idempotent", async () => {
    for (const method of ["POST", "PUT", "PATCH"] as const) {
      const { client, calls } = http(() => json({}, 503));
      await expect(client.request({ method, path: "/x", body: {}, response: "void" })).rejects.toMatchObject({ status: 503 });
      expect(calls.length).toBe(1);
    }
    const { client, calls } = http((_, i) => (i === 0 ? json({}, 503) : json({})));
    await client.request({ method: "PUT", path: "/x", body: {}, response: "void", idempotent: true });
    expect(calls.length).toBe(2);
  });

  it("DELETE is idempotent; a DELETE marked otherwise is not retried", async () => {
    const retried = http((_, i) => (i === 0 ? json({}, 502) : new Response(null, { status: 204 })));
    await retried.client.request({ method: "DELETE", path: "/x", response: "void" });
    expect(retried.calls.length).toBe(2);
    const once = http(() => json({}, 502));
    await expect(once.client.request({ method: "DELETE", path: "/x", response: "void", idempotent: false })).rejects.toBeTruthy();
    expect(once.calls.length).toBe(1);
  });

  it("maxRetries per call overrides the client's", async () => {
    const { client, calls } = http(() => json({}, 503), 5);
    await expect(client.request({ ...GET, options: { maxRetries: 0 } })).rejects.toBeTruthy();
    expect(calls.length).toBe(1);
  });
});

describe("retries: a 429 has its own budget", () => {
  // An edge that rate-limits (a 429 page, no Retry-After) blocks for a minute: `mt vfs-sync` failed a deploy on it.
  const edge429 = () => new Response("<html>Just a moment...</html>", { status: 429, headers: { "content-type": "text/html" } });

  it("waits out a 429 with no Retry-After for over a minute, 1 s doubling, then succeeds", async () => {
    const { client, calls, waits } = http((_, i) => (i < 6 ? edge429() : json([])), 0);
    await expect(client.request(GET)).resolves.toEqual([]);
    expect(calls.length).toBe(7);
    // random() = 0.5 adds an eighth: 1 s doubling to 32 s, each × 1.125.
    expect(waits).toEqual([1125, 2250, 4500, 9000, 18000, 36000]);
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThan(60_000);
  });

  it("does not spend the gateway retries on a 429", async () => {
    const { client, calls } = http((_, i) => (i < 2 ? edge429() : i === 2 ? json({}, 503) : json([])), 1);
    await expect(client.request(GET)).resolves.toEqual([]);
    expect(calls.length).toBe(4);
  });

  it("surfaces the 429 once its budget is spent, or at once with a budget of 0", async () => {
    const spent = http(() => edge429());
    await expect(spent.client.request({ ...GET, options: { maxRateLimitRetries: 2 } })).rejects.toBeInstanceOf(RateLimitError);
    expect(spent.calls.length).toBe(3);

    const none = http(() => edge429());
    await expect(none.client.request({ ...GET, options: { maxRateLimitRetries: 0 } })).rejects.toBeInstanceOf(RateLimitError);
    expect(none.calls.length).toBe(1);
  });

  it("retries an idempotent PUT through a 429, never a plain one", async () => {
    const marked = http((_, i) => (i < 2 ? edge429() : json({})));
    await marked.client.request({ method: "PUT", path: "/vfs/x/files/write/text", body: {}, response: "void", idempotent: true });
    expect(marked.calls.length).toBe(3);

    const plain = http(() => edge429());
    await expect(plain.client.request({ method: "PUT", path: "/vfs/x/files/append/text", body: {}, response: "void" })).rejects.toBeInstanceOf(RateLimitError);
    expect(plain.calls.length).toBe(1);
  });
});

describe("retries through the client: starts are never retried", () => {
  const starts: Array<[string, (mt: ReturnType<typeof testClient>["mt"]) => Promise<unknown>]> = [
    ["interactions.start", (mt) => mt.interactions.start("hello")],
    ["interactions.run", (mt) => mt.interactions.run("hello")],
    ["apps.start", (mt) => mt.apps.start("refund-flow")],
    ["capsules.start", (mt) => mt.capsules.start("sandbox")],
    ["pipelines.start", (mt) => mt.pipelines.start("fix-bug", { repos: [] })],
    ["automations.trigger", (mt) => mt.automations.trigger("a1")],
    ["pipelineRuns.restart", (mt) => mt.pipelineRuns.restart("p1")],
    ["files.upload", (mt) => mt.files.upload("p1", new Uint8Array([1, 2, 3]), { fileName: "a.txt" })],
    ["builds.submit", (mt) => mt.builds.submit({} as never)],
  ];

  for (const [name, call] of starts) {
    it(`${name}: one attempt on a 503, a 429 and a network error`, async () => {
      const unavailable = testClient(() => json({}, 503), { maxRetries: 5 });
      await expect(call(unavailable.mt)).rejects.toMatchObject({ status: 503 });
      expect(unavailable.calls).toHaveLength(1);

      const limited = testClient(() => json({ code: "api:rate-limited", retryAfterSeconds: 1 }, 429), { maxRateLimitRetries: 6 });
      await expect(call(limited.mt)).rejects.toMatchObject({ status: 429 });
      expect(limited.calls).toHaveLength(1);

      const offline = testClient(() => {
        throw new TypeError("connection reset");
      }, { maxRetries: 5 });
      await expect(call(offline.mt)).rejects.toBeInstanceOf(ConnectionError);
      expect(offline.calls).toHaveLength(1);
    });
  }

  it("a read is retried by the client with its default maxRetries", async () => {
    const { mt, calls } = testClient((_, i) => (i === 0 ? json({}, 503, { "retry-after": "0" }) : json([])), {
      maxRetries: 2,
    });
    await expect(mt.models.list()).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
  });
});
