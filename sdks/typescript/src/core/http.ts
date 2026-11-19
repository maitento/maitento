import type { AuthProvider } from "./auth.js";
import { decode, encode } from "./codec.js";
import { SDK_VERSION, isServerRuntime, runtimeDescription } from "./env.js";
import {
  AbortError,
  ApiError,
  type ApiErrorInit,
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
  type ValidationFailure,
} from "./errors.js";

/** Options every call accepts. */
export interface RequestOptions {
  /** Milliseconds before the call is abandoned with a `TimeoutError` (each attempt). Defaults to the client's. */
  timeout?: number;
  /** Cancels the call (an `AbortError`). */
  signal?: AbortSignal;
  /** Retries for an idempotent call after a network error, 502, 503 or 504. Defaults to the client's. */
  maxRetries?: number;
  /** Times an idempotent call waits out a 429 and is sent again. Defaults to the client's. */
  maxRateLimitRetries?: number;
  /** Extra request headers. */
  headers?: Record<string, string>;
}

export type QueryValue = string | number | boolean | Date | null | undefined | ReadonlyArray<string | number | boolean | Date>;

/**
 * What a response is read as:
 * - a wire type from routes.json (`"Agent"`, `"Agent[]"`, `"boolean"`): JSON, converted by the codec;
 * - `"void"`: nothing (204, or a 200/202 with an empty body);
 * - `"text"`: a plain-text body (decided by `Content-Type`; a JSON string body is unquoted);
 * - `"bytes"`: the raw body as a `Uint8Array`;
 * - `"file"`: the raw body with its content type and file name.
 */
export type ResponseKind = string;

export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path with every segment already encoded, starting with `/`. */
  path: string;
  query?: Record<string, QueryValue> | undefined;
  /** A JSON body. */
  body?: unknown;
  /** The body's wire type, so the codec can convert it (`"InteractionProcessStartRequest"`). */
  bodyType?: string | undefined;
  /** A multipart body (file upload). */
  form?: FormData | undefined;
  response: ResponseKind;
  /**
   * Whether the call may be retried. Defaults to true for GET and DELETE, false otherwise. A call that starts work
   * (start, run, build, ingest) is never idempotent.
   */
  idempotent?: boolean | undefined;
  /** `get` (throw `NotFoundError`, the default) or `find` (return `null`) on a 404 or an empty 204. */
  notFound?: "throw" | "null" | undefined;
  /** Send the client's credential (default true). */
  authenticate?: boolean | undefined;
  /** Use this `Authorization` header instead of the client's credential. */
  authorization?: string | undefined;
  options?: RequestOptions | undefined;
}

export interface FileContent {
  bytes: Uint8Array;
  contentType: string | null;
  fileName: string | null;
}

export interface HttpClientConfig {
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  /** Times an idempotent call waits out a 429 and is sent again. Defaults to `DEFAULT_MAX_RATE_LIMIT_RETRIES`. */
  maxRateLimitRetries?: number | undefined;
  fetch: typeof fetch;
  userAgent?: string | undefined;
  defaultHeaders?: Record<string, string> | undefined;
  auth?: AuthProvider | undefined;
  /** Injected for tests: waits `ms` (honouring `signal`). */
  sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
  random?: (() => number) | undefined;
}

/** One request on the wire: its response, and the timeout/abort wiring that stays live while the body is read. */
interface Exchange {
  response: Response;
  /** Awaits a body read, turning a cut-short read into `TimeoutError` / `AbortError`. */
  guard<R>(work: Promise<R>): Promise<R>;
  /** Releases the timer and the abort listener. */
  done(): void;
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Times an idempotent call waits out a 429 by default. Without a `Retry-After` the waits are 1, 2, 4, 8, 16 and 32
 * seconds (plus up to a quarter more, never less), over a minute in all: an edge that rate-limits typically blocks for
 * a minute and sends no `Retry-After`, and the quick retries the gateway statuses get would all land inside it.
 */
export const DEFAULT_MAX_RATE_LIMIT_RETRIES = 6;

/** Sleeps `ms`, rejecting with the signal's reason when it aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason;
  if (reason instanceof MaitentoError) return reason;
  return new AbortError("The operation was aborted.", { cause: reason });
}

/** Builds `?a=1&b=x&b=y`: arrays repeat the name, dates are ISO-8601, `undefined`/`null` are left out. */
export function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  const text = (v: string | number | boolean | Date): string => (v instanceof Date ? v.toISOString() : String(v));
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value as ReadonlyArray<string | number | boolean | Date>) params.append(name, text(item));
    } else {
      params.append(name, text(value as string | number | boolean | Date));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Encodes one path segment (`encodeURIComponent`: a space is `%20`, never `+`). */
export function seg(value: string | number): string {
  const text = String(value);
  if (text === "") {
    throw new MaitentoError("A path parameter is empty.");
  }
  return encodeURIComponent(text);
}

/** The HTTP layer: authentication, retries, timeouts, error mapping and the wire conversions. */
export class HttpClient {
  readonly baseUrl: string;
  private readonly config: HttpClientConfig;
  private readonly sleepFn: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: () => number;

  constructor(config: HttpClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.sleepFn = config.sleep ?? sleep;
    this.random = config.random ?? Math.random;
  }

  get auth(): AuthProvider | undefined {
    return this.config.auth;
  }

  /** The client's default per-call timeout, in milliseconds. */
  get timeout(): number {
    return this.config.timeout;
  }

  async request<T>(req: HttpRequest): Promise<T> {
    const options = req.options ?? {};
    const idempotent = req.idempotent ?? (req.method === "GET" || req.method === "DELETE");
    const maxRetries = idempotent ? Math.max(0, options.maxRetries ?? this.config.maxRetries) : 0;
    // A 429 has its own, longer budget (see DEFAULT_MAX_RATE_LIMIT_RETRIES).
    const maxRateLimitRetries = idempotent
      ? Math.max(0, options.maxRateLimitRetries ?? this.config.maxRateLimitRetries ?? DEFAULT_MAX_RATE_LIMIT_RETRIES)
      : 0;
    let rateLimitAttempt = 0;
    let refreshedAuth = false;
    for (let attempt = 0; ; attempt++) {
      let exchange: Exchange;
      try {
        exchange = await this.send(req, options);
      } catch (error) {
        if (error instanceof ConnectionError && attempt < maxRetries) {
          await this.sleepFn(this.backoff(attempt), options.signal);
          continue;
        }
        throw error;
      }

      const { response } = exchange;
      let error: ApiError;
      try {
        if (response.ok) {
          return (await exchange.guard(this.read(req, response))) as T;
        }

        if (response.status === 404 && req.notFound === "null") {
          await discard(response);
          return null as T;
        }

        if (
          response.status === 401 &&
          !refreshedAuth &&
          req.authenticate !== false &&
          !req.authorization &&
          this.config.auth
        ) {
          // The request was refused before anything ran, so sending it again with a fresh credential is safe.
          refreshedAuth = true;
          if (await this.config.auth.refreshAfterUnauthorized()) {
            await discard(response);
            attempt--;
            continue;
          }
        }

        error = await exchange.guard(this.toError(req, response));
      } finally {
        exchange.done();
      }
      if (response.status === 429) {
        if (rateLimitAttempt < maxRateLimitRetries) {
          const wait = this.retryDelay(response, error, rateLimitAttempt, this.rateLimitBackoff(rateLimitAttempt));
          if (wait !== undefined) {
            rateLimitAttempt++;
            // A rate-limited call is not one of the gateway retries: give back the attempt the loop counts.
            attempt--;
            await this.sleepFn(wait, options.signal);
            continue;
          }
        }
      } else if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
        const wait = this.retryDelay(response, error, attempt);
        if (wait !== undefined) {
          await this.sleepFn(wait, options.signal);
          continue;
        }
      }
      throw error;
    }
  }

  private backoff(attempt: number): number {
    const base = Math.min(8000, 500 * 2 ** attempt);
    return Math.round(base * (0.75 + this.random() * 0.5));
  }

  /** The wait before re-sending a 429 that named none: 1 s doubling to 32 s, jittered upwards only. */
  private rateLimitBackoff(attempt: number): number {
    const base = Math.min(32_000, 1000 * 2 ** attempt);
    return Math.round(base * (1 + this.random() * 0.25));
  }

  /** The delay before a retry: `Retry-After` when the server set it (capped), else `fallback` (exponential backoff). */
  private retryDelay(response: Response, error: ApiError, attempt: number, fallback?: number): number | undefined {
    let seconds: number | undefined;
    const header = response.headers.get("retry-after");
    if (header) {
      const asNumber = Number(header);
      if (!isNaN(asNumber)) {
        seconds = asNumber;
      } else {
        const date = Date.parse(header);
        if (!isNaN(date)) seconds = Math.max(0, (date - Date.now()) / 1000);
      }
    }
    if (seconds === undefined && error instanceof RateLimitError) {
      seconds = error.retryAfter;
    }
    if (seconds === undefined) {
      return fallback ?? this.backoff(attempt);
    }
    const ms = seconds * 1000;
    // A server that asks for a long wait gets the error instead of a silently blocked call.
    return ms > MAX_RETRY_AFTER_MS ? undefined : ms;
  }

  private async send(req: HttpRequest, options: RequestOptions): Promise<Exchange> {
    const url = this.baseUrl + req.path + buildQuery(req.query);
    const headers = new Headers(this.config.defaultHeaders);
    if (req.response === "text") {
      headers.set("Accept", "text/plain");
    } else if (req.response === "bytes" || req.response === "file") {
      headers.set("Accept", "*/*");
    } else {
      headers.set("Accept", "application/json");
    }
    if (isServerRuntime()) {
      headers.set(
        "User-Agent",
        `maitento-sdk-typescript/${SDK_VERSION} ${runtimeDescription()}${this.config.userAgent ? " " + this.config.userAgent : ""}`,
      );
    }
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      headers.set(name, value);
    }

    let body: BodyInit | undefined;
    if (req.form) {
      body = req.form;
    } else if (req.body !== undefined) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      body = JSON.stringify(req.bodyType ? encode(req.bodyType, req.body) : req.body);
    }

    const timeoutMs = options.timeout ?? this.config.timeout;
    if (options.signal?.aborted) {
      throw abortReason(options.signal);
    }
    const controller = new AbortController();
    const onAbort = (): void => controller.abort(abortReason(options.signal));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer =
      timeoutMs > 0 && isFinite(timeoutMs)
        ? setTimeout(() => {
            timedOut = true;
            controller.abort(new TimeoutError(`${req.method} ${req.path} timed out after ${timeoutMs} ms.`));
          }, timeoutMs)
        : undefined;
    const done = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const translate = (error: unknown): Error => {
      if (timedOut) {
        return new TimeoutError(`${req.method} ${req.path} timed out after ${timeoutMs} ms.`, { cause: error });
      }
      if (options.signal?.aborted) {
        return abortReason(options.signal);
      }
      if (error instanceof MaitentoError) {
        return error;
      }
      return new ConnectionError(`${req.method} ${req.path} could not reach the Maitento API.`, { cause: error });
    };
    try {
      if (req.authorization) {
        headers.set("Authorization", req.authorization);
      } else if (req.authenticate !== false && this.config.auth) {
        headers.set("Authorization", await this.config.auth.authorization(controller.signal));
      }
      const response = await this.config.fetch(url, { method: req.method, headers, body, signal: controller.signal });
      return {
        response,
        done,
        guard: async <R>(work: Promise<R>): Promise<R> => {
          try {
            return await work;
          } catch (error) {
            // A body read cut short by the timeout or the caller's signal; other errors pass through.
            throw timedOut || options.signal?.aborted ? translate(error) : error;
          }
        },
      };
    } catch (error) {
      done();
      throw translate(error);
    }
  }

  private async read(req: HttpRequest, response: Response): Promise<unknown> {
    if (req.response === "bytes") {
      return new Uint8Array(await response.arrayBuffer());
    }
    if (req.response === "file") {
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type"),
        fileName: fileNameOf(response.headers.get("content-disposition")),
      } satisfies FileContent;
    }
    const text = response.status === 204 ? "" : await response.text();
    if (req.response === "void") {
      return undefined;
    }
    if (text === "") {
      // An empty success where a body was expected: "not found" for a read (`Ok(null)` answers 204).
      if (req.notFound === "null") return null;
      if (req.method === "GET") {
        throw new NotFoundError(`${req.method} ${req.path}: no such resource (empty ${response.status}).`, {
          status: response.status,
          method: req.method,
          path: req.path,
          body: null,
          headers: response.headers,
        });
      }
      return undefined;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (req.response === "text") {
      if (/json/i.test(contentType)) {
        const value: unknown = JSON.parse(text);
        return typeof value === "string" ? value : text;
      }
      return text;
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (cause) {
      throw new MaitentoError(`${req.method} ${req.path} answered ${response.status} with a body that is not JSON.`, {
        cause,
      });
    }
    return decode(req.response, value);
  }

  private async toError(req: HttpRequest, response: Response): Promise<ApiError> {
    let text = "";
    try {
      text = await response.text();
    } catch {
      // The body could not be read: map on the status alone.
    }
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const failures = readFailures(record.validationFailures);
    const code = typeof record.code === "string" ? record.code : failures[0]?.code;
    const init: ApiErrorInit = {
      status: response.status,
      method: req.method,
      path: req.path,
      body,
      code,
      headers: response.headers,
    };
    const detail =
      failures[0]?.message ??
      (typeof record.error === "string" ? record.error : undefined) ??
      (typeof record.title === "string" ? record.title : undefined);
    const message = `${req.method} ${req.path} failed with ${response.status}${code ? ` (${code})` : ""}${detail ? `: ${detail}` : "."}`;

    switch (response.status) {
      case 400:
        return failures.length ? new ValidationError(message, init, failures) : new ApiError(message, init);
      case 401:
        return new AuthenticationError(message, init);
      case 403:
        return new PermissionError(message, init);
      case 404:
        return new NotFoundError(message, init);
      case 409:
        return new ConflictError(message, init);
      case 413:
        return new RequestTooLargeError(
          message,
          init,
          typeof record.maxRequestBodyBytes === "number" ? record.maxRequestBodyBytes : undefined,
        );
      case 422:
        return new FileIngestionError(message, init, {
          category: typeof record.category === "string" ? record.category : undefined,
          ocrAttempted: typeof record.ocrAttempted === "boolean" ? record.ocrAttempted : undefined,
          guidance: typeof record.guidance === "string" ? record.guidance : undefined,
        });
      case 429: {
        // No header is no wait given (Number(null) would read it as 0, and a 0 s wait re-sends at once).
        const raw = response.headers.get("retry-after");
        const header = raw === null || raw.trim() === "" ? NaN : Number(raw);
        const retryAfter =
          typeof record.retryAfterSeconds === "number" ? record.retryAfterSeconds : isNaN(header) ? undefined : header;
        return new RateLimitError(message, init, retryAfter);
      }
      default:
        return new ApiError(message, init);
    }
  }
}

function readFailures(value: unknown): ValidationFailure[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
    .map((f) => ({
      code: typeof f.errorCode === "string" ? f.errorCode : typeof f.code === "string" ? f.code : "",
      member: typeof f.memberName === "string" ? f.memberName : null,
      message: typeof f.message === "string" ? f.message : "",
    }));
}

function fileNameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(disposition);
  return plain?.[1]?.trim() ?? null;
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Nothing to release.
  }
}
