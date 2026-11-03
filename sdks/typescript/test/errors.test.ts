import { describe, expect, it, vi } from "vitest";
import {
  AbortError,
  ApiError,
  AuthenticationError,
  ConflictError,
  ConnectionError,
  FileIngestionError,
  MaitentoError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  RequestTooLargeError,
  TimeoutError,
  ValidationError,
} from "../src/index.js";
import { HttpClient } from "../src/core/http.js";
import { empty, json, mockFetch, testClient, text } from "./helpers.js";

async function failure(response: () => Response): Promise<unknown> {
  const { mt } = testClient(response);
  return mt.agents.get("7c9e6679-7425-40de-944b-e07fc1f90ae7").catch((e: unknown) => e);
}

describe("error mapping: the four body shapes and every status", () => {
  it("400 validationFailures → ValidationError with failures and codes", async () => {
    const error = await failure(() =>
      json(
        {
          validationFailures: [
            { errorCode: "api:validation-failure:system-prompt", memberName: "SystemPrompt", message: "SystemPrompt is required" },
            { errorCode: "name", memberName: "Name", message: "Name is too long" },
          ],
        },
        400,
      ),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(MaitentoError);
    const v = error as ValidationError;
    expect(v.status).toBe(400);
    expect(v.code).toBe("api:validation-failure:system-prompt");
    expect(v.codes).toEqual(["api:validation-failure:system-prompt", "name"]);
    expect(v.failures[1]).toEqual({ code: "name", member: "Name", message: "Name is too long" });
    expect(v.message).toContain("SystemPrompt is required");
  });

  it("400 { error } (VFS) → ApiError carrying the body", async () => {
    const error = (await failure(() => json({ error: "Path must be absolute" }, 400))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ValidationError);
    expect(error.body).toEqual({ error: "Path must be absolute" });
    expect(error.message).toContain("Path must be absolute");
  });

  it("401 empty → AuthenticationError", async () => {
    expect(await failure(() => empty(401))).toBeInstanceOf(AuthenticationError);
  });

  it("403 empty → PermissionError without a code; 403 { code, error } → PermissionError with the code", async () => {
    const bare = (await failure(() => empty(403))) as PermissionError;
    expect(bare).toBeInstanceOf(PermissionError);
    expect(bare.code).toBeUndefined();
    const coded = (await failure(() => json({ code: "api:model-keys:admin-only", error: "Only admins" }, 403))) as PermissionError;
    expect(coded.code).toBe("api:model-keys:admin-only");
  });

  it("404 empty, 404 { error }, and 404 problem+json → NotFoundError", async () => {
    expect(await failure(() => empty(404))).toBeInstanceOf(NotFoundError);
    expect(await failure(() => json({ error: "VFS not found" }, 404))).toBeInstanceOf(NotFoundError);
    const problem = new Response(JSON.stringify({ type: "about:blank", title: "Not Found", status: 404 }), {
      status: 404,
      headers: { "content-type": "application/problem+json" },
    });
    expect(await failure(() => problem)).toBeInstanceOf(NotFoundError);
  });

  it("an empty 204 on a get → NotFoundError; on a find → null", async () => {
    const { mt } = testClient(() => empty(204));
    await expect(mt.agents.get("x")).rejects.toBeInstanceOf(NotFoundError);
    await expect(mt.agents.find("x")).resolves.toBeNull();
  });

  it("find → null on 404, but other errors still throw", async () => {
    const { mt: missing } = testClient(() => empty(404));
    await expect(missing.agents.find("x")).resolves.toBeNull();
    await expect(missing.agents.findByName("greeter")).resolves.toBeNull();
    const { mt: denied } = testClient(() => empty(403));
    await expect(denied.agents.find("x")).rejects.toBeInstanceOf(PermissionError);
  });

  it("409 → ConflictError", async () => {
    expect(await failure(() => json({ error: "The loom changed" }, 409))).toBeInstanceOf(ConflictError);
  });

  it("413 → RequestTooLargeError with maxRequestBodyBytes", async () => {
    const error = (await failure(() =>
      json({ code: "api:request-too-large", error: "Request body too large", maxRequestBodyBytes: 30_000_000 }, 413),
    )) as RequestTooLargeError;
    expect(error).toBeInstanceOf(RequestTooLargeError);
    expect(error.code).toBe("api:request-too-large");
    expect(error.maxRequestBodyBytes).toBe(30_000_000);
  });

  it("422 → FileIngestionError with category, ocrAttempted, guidance", async () => {
    const error = (await failure(() =>
      json({ error: "Too little text", category: "ImplausiblyThin", ocrAttempted: true, guidance: "Upload a text PDF" }, 422),
    )) as FileIngestionError;
    expect(error).toBeInstanceOf(FileIngestionError);
    expect(error.category).toBe("ImplausiblyThin");
    expect(error.ocrAttempted).toBe(true);
    expect(error.guidance).toBe("Upload a text PDF");
    const plain = (await failure(() => json({ error: "Unreadable" }, 422))) as FileIngestionError;
    expect(plain.category).toBeUndefined();
  });

  it("429 → RateLimitError with retryAfter (body or header)", async () => {
    const fromBody = (await failure(() =>
      json({ code: "api:rate-limited", error: "Slow down", retryAfterSeconds: 7 }, 429),
    )) as RateLimitError;
    expect(fromBody).toBeInstanceOf(RateLimitError);
    expect(fromBody.retryAfter).toBe(7);
    const fromHeader = (await failure(() => json({}, 429, { "retry-after": "3" }))) as RateLimitError;
    expect(fromHeader.retryAfter).toBe(3);
  });

  it("500 (and any other status) → ApiError with status and raw body", async () => {
    const error = (await failure(() => text("boom", 500))) as ApiError;
    expect(error.constructor).toBe(ApiError);
    expect(error.status).toBe(500);
    expect(error.body).toBe("boom");
    expect(error.method).toBe("GET");
    expect(error.path).toBe("/agents/by-id/7c9e6679-7425-40de-944b-e07fc1f90ae7");
  });

  it("never puts the credential in an error", async () => {
    const error = (await failure(() => empty(401))) as ApiError;
    expect(JSON.stringify({ message: error.message, body: error.body, path: error.path })).not.toContain("ApiKey");
  });

  it("network failure → ConnectionError (with the cause)", async () => {
    const { mt } = testClient(() => {
      throw new TypeError("fetch failed");
    });
    const error = (await mt.models.list().catch((e: unknown) => e)) as ConnectionError;
    expect(error).toBeInstanceOf(ConnectionError);
    expect((error.cause as Error).message).toBe("fetch failed");
  });

  it("timeout → TimeoutError; the caller's signal → AbortError", async () => {
    const hang = (_url: unknown, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const http = new HttpClient({ baseUrl: "https://api.test", timeout: 20, maxRetries: 0, fetch: hang as typeof fetch });
    await expect(http.request({ method: "GET", path: "/ai-models", response: "AiModel[]" })).rejects.toBeInstanceOf(TimeoutError);

    const controller = new AbortController();
    const pending = http.request({
      method: "GET",
      path: "/ai-models",
      response: "AiModel[]",
      options: { signal: controller.signal, timeout: 10_000 },
    });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AbortError);

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      http.request({ method: "GET", path: "/ai-models", response: "AiModel[]", options: { signal: aborted.signal } }),
    ).rejects.toBeInstanceOf(AbortError);
  });

  it("a non-JSON 200 where JSON was expected is a MaitentoError, not a crash", async () => {
    const { mt } = testClient(() => text("<html>proxy page</html>", 200, "text/html"));
    await expect(mt.models.list()).rejects.toThrow(/not JSON/);
  });

  it("errors are thrown per call, and the client stays usable", async () => {
    const handler = vi.fn((_: unknown, i: number) => (i === 0 ? empty(404) : json([])));
    const { mt } = testClient(handler);
    await expect(mt.agents.get("x")).rejects.toBeInstanceOf(NotFoundError);
    await expect(mt.models.list()).resolves.toEqual([]);
  });

  it("mockFetch sanity: records method, path and JSON body", async () => {
    const { fetch, calls } = mockFetch(() => json({}));
    await fetch("https://api.test/a?b=1", { method: "POST", body: JSON.stringify({ x: 1 }) });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/a", body: { x: 1 } });
  });
});
