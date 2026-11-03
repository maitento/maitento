/**
 * Every error the SDK throws derives from {@link MaitentoError}. Branch on the error TYPE and its `code`, never on
 * its message: messages are for people and may change.
 */
export class MaitentoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** One failed check from a 400 `validationFailures` body. */
export interface ValidationFailure {
  /** Stable machine code, e.g. `api:validation-failure:system-prompt` or `api:agent:delete:in-use`. */
  code: string;
  /** The request member that failed, e.g. `SystemPrompt`. */
  member: string | null;
  /** Human-readable text. Never branch on it. */
  message: string;
}

/** What the SDK knows about a failed HTTP call. */
export interface ApiErrorInit {
  status: number;
  method: string;
  path: string;
  body: unknown;
  code?: string | undefined;
  headers?: Headers | undefined;
}

/** A non-2xx answer from the API that has no more specific error class. */
export class ApiError extends MaitentoError {
  /** The HTTP status. */
  readonly status: number;
  /** The stable error code from the body (`code`, or the first validation failure's code), when there is one. */
  readonly code: string | undefined;
  /** The parsed JSON body, the raw text when it was not JSON, or `null` when it was empty. */
  readonly body: unknown;
  /** The request method. */
  readonly method: string;
  /** The request path (no host, no query string). */
  readonly path: string;
  /** The response headers. */
  readonly headers: Headers | undefined;

  constructor(message: string, init: ApiErrorInit) {
    super(message);
    this.status = init.status;
    this.code = init.code;
    this.body = init.body;
    this.method = init.method;
    this.path = init.path;
    this.headers = init.headers;
  }
}

/** 400 with `validationFailures`: the request was refused before anything ran. */
export class ValidationError extends ApiError {
  readonly failures: ValidationFailure[];
  /** Every failure's code, for quick checks: `err.codes.includes("api:agent:delete:in-use")`. */
  readonly codes: string[];

  constructor(message: string, init: ApiErrorInit, failures: ValidationFailure[]) {
    super(message, init);
    this.failures = failures;
    this.codes = failures.map((f) => f.code);
  }
}

/** 401: no credential, a wrong or expired one, or a disabled account. */
export class AuthenticationError extends ApiError {}

/** 403: authenticated, but not allowed (a missing role, or a service-level refusal carrying a `code`). */
export class PermissionError extends ApiError {}

/** 404, or an empty 204 where a `get…` call expected a body. `find…` calls return `null` instead. */
export class NotFoundError extends ApiError {}

/** 409: a concurrent change won. Re-read and try again. */
export class ConflictError extends ApiError {}

/** 413: the request body is over the server's limit. */
export class RequestTooLargeError extends ApiError {
  /** The limit the server applied, in bytes, when it said. */
  readonly maxRequestBodyBytes: number | undefined;

  constructor(message: string, init: ApiErrorInit, maxRequestBodyBytes: number | undefined) {
    super(message, init);
    this.maxRequestBodyBytes = maxRequestBodyBytes;
  }
}

/** 422 from file ingestion: the file could not be turned into text. Permanent: do not retry the same file. */
export class FileIngestionError extends ApiError {
  /** Why, when the server classified it (e.g. the extracted text is implausibly thin). */
  readonly category: string | undefined;
  /** Whether OCR was tried. */
  readonly ocrAttempted: boolean | undefined;
  /** What to do about it, for a person. */
  readonly guidance: string | undefined;

  constructor(
    message: string,
    init: ApiErrorInit,
    details: { category?: string | undefined; ocrAttempted?: boolean | undefined; guidance?: string | undefined },
  ) {
    super(message, init);
    this.category = details.category;
    this.ocrAttempted = details.ocrAttempted;
    this.guidance = details.guidance;
  }
}

/** 429: rate limited. Idempotent calls are retried automatically after `retryAfter`. */
export class RateLimitError extends ApiError {
  /** Seconds to wait before trying again, when the server said. */
  readonly retryAfter: number | undefined;

  constructor(message: string, init: ApiErrorInit, retryAfter: number | undefined) {
    super(message, init);
    this.retryAfter = retryAfter;
  }
}

/**
 * How every Maitento SDK names a run in its errors: `Interaction run <id>`, `App run <id>`, `Capsule run <id>`,
 * `Code pipeline run <id>`. `type` is the process type (`Interaction`, `App`, `Capsule`, `CodePipeline`).
 */
export function describeRun(type: string | undefined, id: string | undefined): string {
  const kind = type === "CodePipeline" ? "Code pipeline" : type;
  const noun = kind ? `${kind} run` : "Run";
  return id ? `${noun} ${id}` : noun;
}

/** A duration in milliseconds as the errors write it, in seconds: `2s`, `0.25s`. */
export function describeSeconds(milliseconds: number): string {
  return `${Number((milliseconds / 1000).toFixed(3))}s`;
}

/**
 * A run followed by a `run()` helper ended `Error` or `Killed` (unless `throwOnFailure: false`). The message names the
 * kind of run, its id, its status and what it recorded about the failure, the same in every SDK:
 * `App run <id> ended Error: <failure details>`.
 */
export class ProcessFailedError<TRun = unknown> extends MaitentoError {
  /** The run, in its terminal state. */
  readonly run: TRun;
  /** The run's status: `Error` or `Killed`. */
  readonly status: string;
  /** What the run recorded about the failure. */
  readonly failureDetails: string | null;

  /** `processType` is the kind of run (`Interaction`, `App`, `Capsule`, `CodePipeline`), for the message. */
  constructor(run: TRun, status: string, failureDetails: string | null, processType?: string) {
    const id = (run as { id?: unknown } | null | undefined)?.id;
    super(
      `${describeRun(processType, typeof id === "string" ? id : undefined)} ended ${status}` +
        (failureDetails?.trim() ? `: ${failureDetails}` : "."),
    );
    this.run = run;
    this.status = status;
    this.failureDetails = failureDetails;
  }
}

/**
 * The capsule run ended (it was terminated, ran out of time or failed) before a command that
 * `capsuleRuns.execAndWait` was waiting for could finish, so the command ended `AbortedOnTermination`. The message is
 * the same in every SDK: `Capsule command <id> ended AbortedOnTermination: <failure details>`.
 */
export class CapsuleCommandAbortedError<TCommand = unknown> extends MaitentoError {
  /** The command, in its final state. */
  readonly command: TCommand;
  /** The id of the capsule run the command was sent to. */
  readonly runId: string;
  /** Why the command did not finish. */
  readonly failureDetails: string | null;

  constructor(command: TCommand, runId: string) {
    const { id, status, failureDetails } = (command ?? {}) as { id?: unknown; status?: unknown; failureDetails?: unknown };
    const details = typeof failureDetails === "string" ? failureDetails : null;
    super(
      `Capsule command ${typeof id === "string" ? id : "?"} ended ${typeof status === "string" ? status : "AbortedOnTermination"}` +
        (details?.trim() ? `: ${details}` : "."),
    );
    this.command = command;
    this.runId = runId;
    this.failureDetails = details;
  }
}

/** A deploy whose sources did not compile. Nothing was deployed; `log` says why. */
export class BuildFailedError extends MaitentoError {
  /** The build response, with `isSuccess: false`. */
  readonly response: unknown;
  /** The compilation log entries at level `Error`. */
  readonly errors: ReadonlyArray<{ text: string; filename?: string | null; lineNumber?: number | null }>;

  constructor(
    response: unknown,
    errors: ReadonlyArray<{ text: string; filename?: string | null; lineNumber?: number | null }>,
  ) {
    const first = errors[0];
    const where = first?.filename ? ` (${first.filename}${first.lineNumber ? `:${first.lineNumber}` : ""})` : "";
    super(
      errors.length
        ? `The build failed with ${errors.length} error(s). First: ${first?.text ?? ""}${where}`
        : "The build failed.",
    );
    this.response = response;
    this.errors = errors;
  }
}

/** The request could not reach the API (DNS, refused connection, reset, TLS). */
export class ConnectionError extends MaitentoError {}

/** The call, or a `run()` helper, took longer than its `timeout`. */
export class TimeoutError extends MaitentoError {}

/** The caller's `AbortSignal` fired. */
export class AbortError extends MaitentoError {}
