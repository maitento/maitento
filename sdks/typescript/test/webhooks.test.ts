import { describe, expect, it } from "vitest";
import {
  MaitentoError,
  WEBHOOK_DEFAULT_TOLERANCE_SECONDS,
  WEBHOOK_HEADERS,
  constantTimeEqual,
  parseWebhook,
  signWebhook,
  verifyWebhook,
} from "../src/index.js";
import { interactionRun } from "./helpers.js";

const RUN_ID = "e4c2a1b3-9d8f-4e7a-b6c5-d4e3f2a1b0c9";

// The vector every Maitento SDK tests against.
const SECRET = "whsec_test_secret";
const TIMESTAMP = 1793260000;
const BODY = '{"id":"abc","status":"Finished"}';
const SIGNATURE = "v1=fcd362066648db6355d952ba1f00bf65504a4041eb38acae187a135015433cb6";
const AT = new Date(TIMESTAMP * 1000);

const signed = (signature: string = SIGNATURE, timestamp: string = String(TIMESTAMP)) => ({
  "x-mt-webhook-timestamp": timestamp,
  "x-mt-webhook-signature": signature,
});

describe("signWebhook", () => {
  it("signs the shared test vector", async () => {
    expect(await signWebhook(SECRET, TIMESTAMP, BODY)).toBe(SIGNATURE);
  });

  it("signs the same bytes the same way, whether text, bytes, a Buffer, an ArrayBuffer or a view into a larger buffer", async () => {
    const bytes = new TextEncoder().encode(BODY);
    expect(await signWebhook(SECRET, TIMESTAMP, bytes)).toBe(SIGNATURE);
    expect(await signWebhook(SECRET, TIMESTAMP, Buffer.from(BODY, "utf8"))).toBe(SIGNATURE);
    expect(await signWebhook(SECRET, TIMESTAMP, bytes.slice().buffer)).toBe(SIGNATURE);
    const padded = new TextEncoder().encode(`xx${BODY}yy`);
    expect(await signWebhook(SECRET, TIMESTAMP, padded.subarray(2, padded.length - 2))).toBe(SIGNATURE);
  });

  it("needs a secret, a whole-second timestamp and a raw body", async () => {
    await expect(signWebhook("", TIMESTAMP, BODY)).rejects.toThrow(MaitentoError);
    await expect(signWebhook(SECRET, 1793260000.5, BODY)).rejects.toThrow(/whole Unix seconds/);
    await expect(signWebhook(SECRET, -1, BODY)).rejects.toThrow(MaitentoError);
    await expect(signWebhook(SECRET, TIMESTAMP, { id: "abc" } as never)).rejects.toThrow(/raw body/);
  });
});

describe("verifyWebhook", () => {
  it("accepts a signed delivery from a fetch Headers, a Node headers object, or anything with get()", async () => {
    const fetchHeaders = new Headers({ "X-MT-WebHook-Timestamp": String(TIMESTAMP), "X-MT-WebHook-Signature": SIGNATURE });
    expect(await verifyWebhook(fetchHeaders, BODY, SECRET, { now: AT })).toBe(true);
    // Node lower-cases header names.
    expect(await verifyWebhook({ ...signed(), host: "example.com" }, BODY, SECRET, { now: AT })).toBe(true);
    const getter = { get: (name: string) => new Map<string, string>(Object.entries(signed())).get(name.toLowerCase()) };
    expect(await verifyWebhook(getter, BODY, SECRET, { now: AT })).toBe(true);
    expect(await verifyWebhook(signed(), Buffer.from(BODY), SECRET, { now: AT })).toBe(true);
  });

  it("accepts a delivery when any one of several v1 signatures matches, and ignores other schemes", async () => {
    const other = "v1=" + "0".repeat(64);
    expect(await verifyWebhook(signed(`${other}, ${SIGNATURE}`), BODY, SECRET, { now: AT })).toBe(true);
    expect(await verifyWebhook(signed(`${SIGNATURE},${other}`), BODY, SECRET, { now: AT })).toBe(true);
    expect(await verifyWebhook(signed(`v0=${SIGNATURE.slice(3)}, ${SIGNATURE}`), BODY, SECRET, { now: AT })).toBe(true);
    const repeated = { "x-mt-webhook-timestamp": String(TIMESTAMP), "x-mt-webhook-signature": [other, SIGNATURE] };
    expect(await verifyWebhook(repeated, BODY, SECRET, { now: AT })).toBe(true);
    expect(await verifyWebhook(signed(other), BODY, SECRET, { now: AT })).toBe(false);
    expect(await verifyWebhook(signed(`v0=${SIGNATURE.slice(3)}`), BODY, SECRET, { now: AT })).toBe(false);
  });

  it("refuses a wrong secret, a changed body, or a signature made for another timestamp", async () => {
    expect(await verifyWebhook(signed(), BODY, "whsec_other_secret", { now: AT })).toBe(false);
    // Parsed and turned back into JSON: the same data, but not the same bytes.
    expect(await verifyWebhook(signed(), JSON.stringify(JSON.parse(BODY), null, 2), SECRET, { now: AT })).toBe(false);
    expect(await verifyWebhook(signed(), BODY.replace("Finished", "Error"), SECRET, { now: AT })).toBe(false);
    expect(await verifyWebhook(signed(SIGNATURE, String(TIMESTAMP + 1)), BODY, SECRET, { now: AT })).toBe(false);
  });

  it("refuses a delivery whose headers are missing or malformed", async () => {
    expect(await verifyWebhook({}, BODY, SECRET, { now: AT })).toBe(false);
    expect(await verifyWebhook({ "x-mt-webhook-signature": SIGNATURE }, BODY, SECRET, { now: AT })).toBe(false);
    expect(await verifyWebhook({ "x-mt-webhook-timestamp": String(TIMESTAMP) }, BODY, SECRET, { now: AT })).toBe(false);
    expect(await verifyWebhook(signed(""), BODY, SECRET, { now: AT })).toBe(false);
    expect(await verifyWebhook(signed(SIGNATURE.slice(3)), BODY, SECRET, { now: AT })).toBe(false);
    for (const stamp of ["", "abc", "-1793260000", "1793260000.0", "1.79326e9", "0x6ae2f8e0"]) {
      expect(await verifyWebhook(signed(SIGNATURE, stamp), BODY, SECRET, { now: AT })).toBe(false);
    }
    // Before the body is looked at: an unsigned request is turned away, whatever its body.
    expect(await verifyWebhook({}, { id: "abc" } as never, SECRET)).toBe(false);
  });

  it("refuses a delivery signed more than the tolerance away from now, in either direction", async () => {
    expect(WEBHOOK_DEFAULT_TOLERANCE_SECONDS).toBe(300);
    const at = (seconds: number) => ({ now: new Date((TIMESTAMP + seconds) * 1000) });
    expect(await verifyWebhook(signed(), BODY, SECRET, at(300))).toBe(true);
    expect(await verifyWebhook(signed(), BODY, SECRET, at(-300))).toBe(true);
    expect(await verifyWebhook(signed(), BODY, SECRET, at(300.5))).toBe(false);
    expect(await verifyWebhook(signed(), BODY, SECRET, at(301))).toBe(false);
    expect(await verifyWebhook(signed(), BODY, SECRET, at(-301))).toBe(false);
    expect(await verifyWebhook(signed(), BODY, SECRET, { ...at(3600), toleranceSeconds: 3600 })).toBe(true);
    expect(await verifyWebhook(signed(), BODY, SECRET, { ...at(1), toleranceSeconds: 0 })).toBe(false);
    expect(await verifyWebhook(signed(), BODY, SECRET, { ...at(0), toleranceSeconds: 0 })).toBe(true);
  });

  it("checks the timestamp against the current time by default", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fresh = signed(await signWebhook(SECRET, now, BODY), String(now));
    expect(await verifyWebhook(fresh, BODY, SECRET)).toBe(true);
    const hourAgo = now - 3600;
    const replayed = signed(await signWebhook(SECRET, hourAgo, BODY), String(hourAgo));
    expect(await verifyWebhook(replayed, BODY, SECRET)).toBe(false);
  });

  it("needs a secret, a raw body and a sensible tolerance", async () => {
    await expect(verifyWebhook(signed(), BODY, "")).rejects.toThrow(MaitentoError);
    await expect(verifyWebhook(signed(), JSON.parse(BODY) as never, SECRET, { now: AT })).rejects.toThrow(/raw body/);
    await expect(verifyWebhook(signed(), BODY, SECRET, { toleranceSeconds: -1 })).rejects.toThrow(/tolerance/);
    await expect(verifyWebhook(signed(), BODY, SECRET, { toleranceSeconds: Number.NaN })).rejects.toThrow(/tolerance/);
  });

  it("names the headers it reads, and not the old plain-secret one", () => {
    expect(WEBHOOK_HEADERS.timestamp).toBe("X-MT-WebHook-Timestamp");
    expect(WEBHOOK_HEADERS.signature).toBe("X-MT-WebHook-Signature");
    expect(Object.values(WEBHOOK_HEADERS)).not.toContain("X-MT-WebHook-Secret");
  });
});

describe("constantTimeEqual", () => {
  it("compares by value, including non-ASCII", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("café", "café")).toBe(true);
    expect(constantTimeEqual("café", "cafe")).toBe(false);
  });

  it("does not short-circuit: a mismatch anywhere, including only in length, is detected", () => {
    const base = "a".repeat(64);
    for (let i = 0; i < base.length; i++) {
      const changed = base.slice(0, i) + "b" + base.slice(i + 1);
      expect(constantTimeEqual(changed, base)).toBe(false);
    }
    expect(constantTimeEqual(base + "\u0000", base)).toBe(false);
  });
});

describe("parseWebhook", () => {
  const headers = {
    "x-mt-webhook-type": "InteractionProcess",
    "x-mt-webhook-associatedid": RUN_ID,
  };

  it("reads type and id from the headers and the entity from the body, converted", () => {
    const body = JSON.stringify(interactionRun({ status: "Finished", executionTime: "00:00:05", output: "Hi" }));
    const delivery = parseWebhook(headers, body);
    expect(delivery.type).toBe("InteractionProcess");
    expect(delivery.id).toBe(RUN_ID);
    if (delivery.type !== "InteractionProcess") throw new Error("narrowing");
    expect(delivery.entity.status).toBe("Finished");
    expect(delivery.entity.output).toBe("Hi");
    expect(delivery.entity.dateUpdated).toBeInstanceOf(Date);
    expect(delivery.entity.executionTime).toBe(5000);
  });

  it("takes bytes, or an already-parsed body without changing it", () => {
    const raw = interactionRun();
    const bytes = new TextEncoder().encode(JSON.stringify(raw));
    expect(parseWebhook(headers, bytes).id).toBe(RUN_ID);
    const parsed = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    const delivery = parseWebhook(headers, parsed);
    expect((delivery.entity as { dateCreated: unknown }).dateCreated).toBeInstanceOf(Date);
    expect(parsed.dateCreated).toBe("2026-10-26T10:00:00.1234567Z");
  });

  it("parses the same raw body that was verified", async () => {
    const body = Buffer.from(JSON.stringify(interactionRun({ status: "Finished" })));
    const now = Math.floor(Date.now() / 1000);
    const delivery = { ...headers, ...signed(await signWebhook(SECRET, now, body), String(now)) };
    expect(await verifyWebhook(delivery, body, SECRET)).toBe(true);
    expect(parseWebhook(delivery, body).id).toBe(RUN_ID);
  });

  it("falls back to the entity id, and refuses a request that is not a delivery", () => {
    const { "x-mt-webhook-associatedid": _, ...withoutId } = headers;
    expect(parseWebhook(withoutId, JSON.stringify(interactionRun())).id).toBe(RUN_ID);
    expect(() => parseWebhook({}, "{}")).toThrow(/X-MT-WebHook-Type/);
  });

  it("passes an unknown type through as plain JSON", () => {
    const delivery = parseWebhook({ "x-mt-webhook-type": "SomethingNew" }, '{"id":"x","dateUpdated":"2026-10-26T10:00:00Z"}');
    expect(delivery.type).toBe("SomethingNew");
    expect((delivery.entity as { dateUpdated: unknown }).dateUpdated).toBe("2026-10-26T10:00:00Z");
  });
});
