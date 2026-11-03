import { MaitentoError } from "./errors.js";

/** An API key: the id of the USER that owns it (not the key's own id) and the secret. */
export interface ApiKeyCredential {
  userId: string;
  secret: string;
}

/**
 * How the SDK authenticates. Exactly one is used per client.
 * - `apiKey`: `Authorization: ApiKey <userId> <secret>` on every call.
 * - `jwt`: `Authorization: Bearer <token>`, renewed before it expires.
 */
export interface AuthProvider {
  readonly kind: "apiKey" | "jwt";
  /** The `Authorization` header value for the next request. */
  authorization(signal?: AbortSignal): Promise<string>;
  /** A JWT (for a browser WebSocket's `?authorization=`); throws for an API key. */
  jwt(signal?: AbortSignal): Promise<string>;
  /** Called after a 401: returns true when a fresh credential was obtained and the request may be tried again. */
  refreshAfterUnauthorized(): Promise<boolean>;
  /** Stops background renewal. */
  close(): void;
}

/** Parses the `"<userId>:<secret>"` form of an API key (what `MAITENTO_API_KEY` holds). */
export function parseApiKey(value: string | ApiKeyCredential): ApiKeyCredential {
  if (typeof value !== "string") {
    if (!value.userId || !value.secret) {
      throw new MaitentoError("An API key needs both userId and secret.");
    }
    return { userId: value.userId.trim(), secret: value.secret.trim() };
  }
  const trimmed = value.trim();
  const colon = trimmed.indexOf(":");
  const userId = colon > 0 ? trimmed.slice(0, colon).trim() : "";
  const secret = colon > 0 ? trimmed.slice(colon + 1).trim() : "";
  if (!userId || !secret) {
    // Never echo the value: it is a secret.
    throw new MaitentoError('An API key must have the form "<userId>:<secret>" (the portal shows it ready to copy).');
  }
  return { userId, secret };
}

export class ApiKeyAuth implements AuthProvider {
  readonly kind = "apiKey" as const;
  private readonly header: string;

  constructor(credential: ApiKeyCredential) {
    this.header = `ApiKey ${credential.userId} ${credential.secret}`;
  }

  authorization(): Promise<string> {
    return Promise.resolve(this.header);
  }

  jwt(): Promise<string> {
    return Promise.reject(
      new MaitentoError(
        "This client authenticates with an API key, and a browser WebSocket can only carry a JWT. " +
          "Use a token (or email and password) for live events in a browser.",
      ),
    );
  }

  refreshAfterUnauthorized(): Promise<boolean> {
    return Promise.resolve(false);
  }

  close(): void {
    // Nothing to stop.
  }
}

/** A JWT the SDK holds, with the instants that drive its renewal (epoch milliseconds). */
interface HeldToken {
  token: string;
  issuedAt: number;
  expiresAt: number;
}

/** The two calls JWT renewal needs, made without the client's own authentication. */
export interface AuthTransport {
  /** `PUT /auth` with an e-mail address and password: the login. */
  login(emailAddress: string, password: string, signal?: AbortSignal): Promise<{ token: string; expires?: Date | string | null }>;
  /** `GET /auth/renew` with `Authorization: Bearer <token>`: a fresh token for the same user. */
  renew(token: string, signal?: AbortSignal): Promise<{ token: string; expires?: Date | string | null }>;
}

export type TokenSource =
  | { type: "static"; token: string }
  | { type: "provider"; provider: () => string | Promise<string> }
  | { type: "password"; emailAddress: string; password: string };

/** Renewal threshold: renew once 80% of the lifetime has passed... */
const RENEW_AT_FRACTION = 0.8;
/** ...or when less than five minutes remain. */
const RENEW_WHEN_REMAINING_MS = 5 * 60 * 1000;

/** Reads `exp` (and `iat`) from a JWT without validating it (there is no JWKS; the server validates). */
export function readJwtTimes(token: string): { expiresAt?: number; issuedAt?: number } {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    return {};
  }
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown; iat?: unknown; nbf?: unknown };
    const result: { expiresAt?: number; issuedAt?: number } = {};
    if (typeof claims.exp === "number") result.expiresAt = claims.exp * 1000;
    if (typeof claims.iat === "number") result.issuedAt = claims.iat * 1000;
    else if (typeof claims.nbf === "number") result.issuedAt = claims.nbf * 1000;
    return result;
  } catch {
    return {};
  }
}

/**
 * Bearer-token authentication. The token is renewed proactively — at 80% of its lifetime (a background timer that
 * never keeps a Node process alive), or on the next call when less than five minutes remain — and never waits for
 * expiry, because the server accepts an expired token for renewal only within its two-minute clock skew.
 *
 * - A static token is renewed with `GET /auth/renew`.
 * - A password login is renewed the same way, and logs in again if renewal is refused.
 * - A token provider is simply asked again.
 */
export class JwtAuth implements AuthProvider {
  readonly kind = "jwt" as const;
  private held: HeldToken | undefined;
  private pending: Promise<HeldToken> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(
    private readonly source: TokenSource,
    private readonly transport: AuthTransport,
    private readonly now: () => number = Date.now,
  ) {
    if (source.type === "static") {
      this.held = this.hold(source.token);
      this.schedule();
    }
  }

  async authorization(signal?: AbortSignal): Promise<string> {
    return `Bearer ${await this.jwt(signal)}`;
  }

  async jwt(signal?: AbortSignal): Promise<string> {
    const held = this.held;
    if (held && !this.needsRenewal(held)) {
      return held.token;
    }
    return (await this.refresh(signal)).token;
  }

  async refreshAfterUnauthorized(): Promise<boolean> {
    if (this.source.type === "static") {
      return false;
    }
    // The server refused the token (revoked, roles changed): get a new one from scratch.
    this.held = undefined;
    try {
      await this.refresh(undefined, true);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.closed = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private needsRenewal(held: HeldToken): boolean {
    const now = this.now();
    const renewAt = held.issuedAt + (held.expiresAt - held.issuedAt) * RENEW_AT_FRACTION;
    return now >= renewAt || held.expiresAt - now < RENEW_WHEN_REMAINING_MS;
  }

  private refresh(signal?: AbortSignal, fromScratch = false): Promise<HeldToken> {
    if (!this.pending) {
      this.pending = this.obtain(signal, fromScratch)
        .then((held) => {
          this.held = held;
          this.schedule();
          return held;
        })
        .finally(() => {
          this.pending = undefined;
        });
    }
    return this.pending;
  }

  private async obtain(signal: AbortSignal | undefined, fromScratch: boolean): Promise<HeldToken> {
    const source = this.source;
    switch (source.type) {
      case "provider":
        return this.hold(await source.provider());
      case "static":
        return this.renew(this.held?.token ?? source.token, signal);
      case "password": {
        if (this.held && !fromScratch) {
          try {
            return await this.renew(this.held.token, signal);
          } catch {
            // Renewal refused (expired beyond the skew, account changed): log in again below.
          }
        }
        const login = await this.transport.login(source.emailAddress, source.password, signal);
        return this.hold(login.token, login.expires);
      }
    }
  }

  private async renew(token: string, signal: AbortSignal | undefined): Promise<HeldToken> {
    const renewed = await this.transport.renew(token, signal);
    return this.hold(renewed.token, renewed.expires);
  }

  private hold(token: string, expires?: Date | string | null): HeldToken {
    if (!token) {
      throw new MaitentoError("The token is empty.");
    }
    const times = readJwtTimes(token);
    const now = this.now();
    let expiresAt = times.expiresAt;
    if (expiresAt === undefined && expires) {
      const parsed = expires instanceof Date ? expires.getTime() : Date.parse(expires);
      if (!isNaN(parsed)) expiresAt = parsed;
    }
    // A token without a readable expiry is treated as good for an hour, then asked for again.
    expiresAt ??= now + 60 * 60 * 1000;
    const issuedAt = Math.min(times.issuedAt ?? now, expiresAt);
    return { token, issuedAt, expiresAt };
  }

  private schedule(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const held = this.held;
    if (this.closed || !held) {
      return;
    }
    const renewAt = Math.min(
      held.issuedAt + (held.expiresAt - held.issuedAt) * RENEW_AT_FRACTION,
      held.expiresAt - RENEW_WHEN_REMAINING_MS,
    );
    const delay = Math.max(1000, renewAt - this.now());
    // setTimeout's limit is 2^31-1 ms (~24.8 days); a longer wait is re-armed when it fires.
    const timer = setTimeout(() => {
      this.timer = undefined;
      if (this.closed) return;
      if (this.held && this.needsRenewal(this.held)) {
        this.refresh().catch(() => {
          // A failed background renewal is retried by the next call, which surfaces the error.
        });
      } else {
        this.schedule();
      }
    }, Math.min(delay, 2_147_483_647));
    (timer as { unref?: () => void }).unref?.();
    this.timer = timer;
  }
}
