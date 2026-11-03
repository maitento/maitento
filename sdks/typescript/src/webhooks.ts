import { decode } from "./core/codec.js";
import { MaitentoError } from "./core/errors.js";
import { WEBHOOK_PAYLOAD_TYPES } from "./codec-table.js";
import type { WebHookPayloads } from "./models.js";

/**
 * Request headers as any framework hands them over: a fetch `Headers`, Node's `IncomingHttpHeaders`
 * (`req.headers`), or a plain object. Names are matched case-insensitively.
 */
export type HeadersLike =
  | Headers
  | Readonly<Record<string, string | readonly string[] | undefined>>
  | { get(name: string): string | null | undefined };

/**
 * A delivery's body exactly as it arrived: the raw bytes, or those bytes read as UTF-8 text. The signature covers
 * these bytes, so a body your framework has already parsed into an object can't be verified.
 */
export type WebhookBody = string | Uint8Array | ArrayBuffer;

/** The headers every delivery carries. */
export const WEBHOOK_HEADERS = {
  type: "X-MT-WebHook-Type",
  associatedId: "X-MT-WebHook-AssociatedId",
  /** When Maitento signed the delivery, in Unix seconds. */
  timestamp: "X-MT-WebHook-Timestamp",
  /** `v1=` and the HMAC-SHA256 of `"{timestamp}." + body`, keyed with your secret. Several are comma-separated. */
  signature: "X-MT-WebHook-Signature",
} as const;

/** How far a delivery's timestamp may be from your clock, either way, before `verifyWebhook` refuses it: 5 minutes. */
export const WEBHOOK_DEFAULT_TOLERANCE_SECONDS = 300;

/** Options for `verifyWebhook`. */
export interface VerifyWebhookOptions {
  /** How far the delivery's timestamp may be from `now`, either way, in seconds. Default 300 (5 minutes). */
  toleranceSeconds?: number;
  /** The time to check the timestamp against. Default: the current time. Useful in tests. */
  now?: Date;
}

const encoder = new TextEncoder();

/** A header's value; with `all`, every value of a repeated header, comma-separated (as fetch's `Headers` gives it). */
function header(headers: HeadersLike, name: string, all = false): string | undefined {
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === "function") {
    const value = (getter as (n: string) => string | null | undefined).call(headers, name);
    return value ?? undefined;
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, string | readonly string[] | undefined>)) {
    if (key.toLowerCase() !== wanted || value === undefined) continue;
    return typeof value === "string" ? value : all ? value.join(",") : value[0];
  }
  return undefined;
}

/**
 * Compares two strings in time that depends only on their lengths, never on where they first differ, so the
 * comparison cannot be used to guess a secret one character at a time.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return difference === 0;
}

function rawBytes(body: WebhookBody, caller: string): Uint8Array {
  if (typeof body === "string") return encoder.encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  throw new MaitentoError(
    `${caller} needs the raw body, exactly as it arrived (a string or bytes): a parsed JSON object can't be verified. ` +
      `In Express, read this route's body with express.raw({ type: "application/json" }).`,
  );
}

async function hmacHex(secret: string, message: Uint8Array<ArrayBuffer>): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new MaitentoError(
      "Checking a web-hook signature needs Web Crypto (globalThis.crypto.subtle): Node 20 or later, a browser or an edge runtime.",
    );
  }
  const key = await subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await subtle.sign("HMAC", key, message));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

function requireSecret(secret: string, caller: string): void {
  if (!secret) throw new MaitentoError(`${caller} needs the secret the web hook was registered with.`);
}

/**
 * The `X-MT-WebHook-Signature` value Maitento sends with a delivery: `v1=` and the lowercase hex HMAC-SHA256 of
 * `"{timestamp}." + body`, keyed with your secret. Use it in your receiver's tests, to sign a delivery of your own.
 *
 * `timestamp` is in Unix seconds (a whole number), and `body` is the raw body.
 */
export async function signWebhook(secret: string, timestamp: number, body: WebhookBody): Promise<string> {
  requireSecret(secret, "signWebhook");
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new MaitentoError(`signWebhook needs the timestamp in whole Unix seconds, not ${timestamp}.`);
  }
  const prefix = encoder.encode(`${timestamp}.`);
  const bytes = rawBytes(body, "signWebhook");
  const message = new Uint8Array(prefix.length + bytes.length);
  message.set(prefix);
  message.set(bytes, prefix.length);
  return `v1=${await hmacHex(secret, message)}`;
}

/**
 * Whether a delivery really came from Maitento: its `X-MT-WebHook-Signature` matches your secret, and its
 * `X-MT-WebHook-Timestamp` is within `toleranceSeconds` (default 300) of now, either way. Answer 401 when it doesn't.
 *
 * `body` must be the **raw** body, exactly as it arrived, because the signature covers those bytes: a body that was
 * parsed and turned back into JSON won't match, and an already-parsed object throws. The signature is compared in
 * constant time. A missing or malformed header, a signature that doesn't match, or a timestamp too far from now gives
 * `false`.
 */
export async function verifyWebhook(
  headers: HeadersLike,
  body: WebhookBody,
  secret: string,
  options: VerifyWebhookOptions = {},
): Promise<boolean> {
  requireSecret(secret, "verifyWebhook");
  const tolerance = options.toleranceSeconds ?? WEBHOOK_DEFAULT_TOLERANCE_SECONDS;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new MaitentoError(`verifyWebhook needs a tolerance of zero seconds or more, not ${tolerance}.`);
  }

  const stamp = header(headers, WEBHOOK_HEADERS.timestamp)?.trim();
  if (!stamp || !/^\d{1,15}$/.test(stamp)) return false;
  const timestamp = Number(stamp);
  const now = (options.now ?? new Date()).getTime() / 1000;
  if (!(Math.abs(now - timestamp) <= tolerance)) return false;

  const signatures = (header(headers, WEBHOOK_HEADERS.signature, true) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="));
  if (signatures.length === 0) return false;

  const expected = await signWebhook(secret, timestamp, body);
  let matched = false;
  for (const signature of signatures) {
    // Every value is compared, so the time taken doesn't say which one matched.
    matched = constantTimeEqual(signature, expected) || matched;
  }
  return matched;
}

/** A parsed delivery: which entity, and its latest state (converted like every SDK response). */
export type ParsedWebhook = {
  [K in keyof WebHookPayloads]: { type: K; id: string; entity: WebHookPayloads[K] };
}[keyof WebHookPayloads];

/**
 * Reads a delivery: `type` (the `X-MT-WebHook-Type` header), `id` (`X-MT-WebHook-AssociatedId`) and `entity`, the
 * entity's whole latest state. Deliveries are at-least-once and unordered: treat each as "the latest snapshot of
 * `id`" and ignore one whose `entity.dateUpdated` is older than the one you hold.
 *
 * Parsing doesn't check where the delivery came from: call `verifyWebhook` with the raw body first, then parse that
 * same body. `body` is the raw body (string or bytes) or the already-parsed JSON (which is not modified).
 */
export function parseWebhook(headers: HeadersLike, body: string | Uint8Array | ArrayBuffer | object): ParsedWebhook {
  const type = header(headers, WEBHOOK_HEADERS.type);
  if (!type) {
    throw new MaitentoError(`Not a Maitento web-hook delivery: the ${WEBHOOK_HEADERS.type} header is missing.`);
  }
  let entity: unknown;
  if (typeof body === "string") {
    entity = JSON.parse(body);
  } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    entity = JSON.parse(new TextDecoder().decode(body));
  } else {
    // Parsed by the framework: copy it, so converting dates does not change the caller's object.
    entity = JSON.parse(JSON.stringify(body));
  }
  const payloadType = WEBHOOK_PAYLOAD_TYPES[type];
  if (payloadType) {
    entity = decode(payloadType, entity);
  }
  const fromBody =
    typeof entity === "object" && entity !== null ? (entity as { id?: unknown }).id : undefined;
  const id = header(headers, WEBHOOK_HEADERS.associatedId) ?? (typeof fromBody === "string" ? fromBody : "");
  return { type, id, entity } as ParsedWebhook;
}
