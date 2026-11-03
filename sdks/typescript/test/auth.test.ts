import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, Maitento, MaitentoError } from "../src/index.js";
import { JwtAuth, readJwtTimes, type AuthTransport } from "../src/core/auth.js";
import { SECRET, USER_ID, json, jwt, mockFetch, testClient } from "./helpers.js";

const HOUR = 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
  delete process.env.MAITENTO_API_KEY;
  delete process.env.MAITENTO_BASE_URL;
  delete process.env.MAITENTO_NAMESPACE;
});

describe("API key", () => {
  it('sends "<userId>:<secret>" as Authorization: ApiKey <userId> <secret>', async () => {
    const { mt, calls } = testClient(() => json([]));
    await mt.models.list();
    expect(calls[0]?.headers.get("authorization")).toBe(`ApiKey ${USER_ID} ${SECRET}`);
  });

  it("takes { userId, secret } too", async () => {
    const { mt, calls } = testClient(() => json([]), { apiKey: { userId: USER_ID, secret: SECRET } });
    await mt.models.list();
    expect(calls[0]?.headers.get("authorization")).toBe(`ApiKey ${USER_ID} ${SECRET}`);
  });

  it("reads MAITENTO_API_KEY, MAITENTO_BASE_URL and MAITENTO_NAMESPACE", async () => {
    process.env.MAITENTO_API_KEY = `${USER_ID}:${SECRET}`;
    process.env.MAITENTO_BASE_URL = "https://api.dev.example.com/";
    process.env.MAITENTO_NAMESPACE = "from-env";
    const { fetch, calls } = mockFetch(() => json({ id: "a" }));
    const mt = new Maitento({ fetch });
    expect(mt.baseUrl).toBe("https://api.dev.example.com");
    expect(mt.namespace).toBe("from-env");
    await mt.agents.getByName("greeter");
    expect(calls[0]?.url.href).toBe("https://api.dev.example.com/namespaces/from-env/agents/by-name/greeter");
    expect(calls[0]?.headers.get("authorization")).toBe(`ApiKey ${USER_ID} ${SECRET}`);
  });

  it("defaults to https://api.maitento.com", () => {
    const mt = new Maitento({ apiKey: `${USER_ID}:${SECRET}`, fetch: mockFetch(() => json([])).fetch });
    expect(mt.baseUrl).toBe("https://api.maitento.com");
  });

  it("refuses a malformed key without echoing it", () => {
    const attempt = (): Maitento => new Maitento({ apiKey: "just-a-secret-value", fetch: mockFetch(() => json([])).fetch });
    expect(attempt).toThrow(MaitentoError);
    try {
      attempt();
    } catch (error) {
      expect((error as Error).message).not.toContain("just-a-secret-value");
    }
  });

  it("needs a credential, and only one", () => {
    const fetch = mockFetch(() => json([])).fetch;
    expect(() => new Maitento({ fetch })).toThrow(/No credential/);
    expect(() => new Maitento({ fetch, apiKey: `${USER_ID}:${SECRET}`, token: "t" })).toThrow(/one credential/);
    expect(() => new Maitento({ fetch, email: "ada@example.com" })).toThrow(/both email and password/);
  });

  it("cannot open a browser WebSocket", async () => {
    const { mt } = testClient(() => json([]));
    const auth = (mt as unknown as { auth: { jwt(): Promise<string> } }).auth;
    await expect(auth.jwt()).rejects.toThrow(/browser WebSocket can only carry a JWT/);
  });
});

describe("JWT renewal", () => {
  function transport(): AuthTransport & { renewals: string[]; logins: number } {
    const result = {
      renewals: [] as string[],
      logins: 0,
      login: vi.fn(async () => {
        result.logins++;
        const now = Math.floor(Date.now() / 1000);
        return { token: jwt({ iat: now, exp: now + 24 * 3600, n: `login-${result.logins}` }), expires: null };
      }),
      renew: vi.fn(async (token: string) => {
        result.renewals.push(token);
        const now = Math.floor(Date.now() / 1000);
        return { token: jwt({ iat: now, exp: now + 24 * 3600, n: `renewal-${result.renewals.length}` }), expires: null };
      }),
    };
    return result;
  }

  it("reads exp and iat from the token", () => {
    expect(readJwtTimes(jwt({ iat: 100, exp: 200 }))).toEqual({ issuedAt: 100_000, expiresAt: 200_000 });
    expect(readJwtTimes("not-a-jwt")).toEqual({});
  });

  it("keeps a fresh token, and renews at 80% of its lifetime, before it expires", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T00:00:00Z") });
    const t = transport();
    const issued = Math.floor(Date.now() / 1000);
    const original = jwt({ iat: issued, exp: issued + 10 * 3600 });
    const auth = new JwtAuth({ type: "static", token: original }, t);

    expect(await auth.authorization()).toBe(`Bearer ${original}`);
    vi.setSystemTime(Date.now() + 7.9 * HOUR);
    expect(await auth.authorization()).toBe(`Bearer ${original}`);
    expect(t.renewals).toEqual([]);

    // Past 80%: the next call renews first, with the CURRENT token.
    vi.setSystemTime(Date.now() + 0.2 * HOUR);
    const renewed = await auth.authorization();
    expect(t.renewals).toEqual([original]);
    expect(renewed).not.toBe(`Bearer ${original}`);
    auth.close();
  });

  it("renews in the background when 80% of the lifetime has passed", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T00:00:00Z") });
    const t = transport();
    const issued = Math.floor(Date.now() / 1000);
    const auth = new JwtAuth({ type: "static", token: jwt({ iat: issued, exp: issued + 10 * 3600 }) }, t);
    await vi.advanceTimersByTimeAsync(7.99 * HOUR);
    expect(t.renewals).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(0.02 * HOUR);
    expect(t.renewals).toHaveLength(1);
    auth.close();
  });

  it("renews on the first call when less than five minutes remain", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T00:00:00Z") });
    const t = transport();
    const now = Math.floor(Date.now() / 1000);
    // Issued long ago, so the 80% mark is not what triggers: only 4 minutes remain.
    const auth = new JwtAuth({ type: "static", token: jwt({ exp: now + 240 }) }, t);
    await auth.authorization();
    expect(t.renewals).toHaveLength(1);
    auth.close();
  });

  it("renews concurrent callers once", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T00:00:00Z") });
    const t = transport();
    const now = Math.floor(Date.now() / 1000);
    const auth = new JwtAuth({ type: "static", token: jwt({ iat: now - 9 * 3600, exp: now + 3600 }) }, t);
    const headers = await Promise.all([auth.authorization(), auth.authorization(), auth.authorization()]);
    expect(t.renewals).toHaveLength(1);
    expect(new Set(headers).size).toBe(1);
    auth.close();
  });

  it("password: logs in first, renews later, and logs in again when renewal is refused", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T00:00:00Z") });
    const t = transport();
    const auth = new JwtAuth({ type: "password", emailAddress: "ada@example.com", password: "pw" }, t);
    await auth.authorization();
    expect(t.logins).toBe(1);
    vi.setSystemTime(Date.now() + 20 * HOUR);
    await auth.authorization();
    expect(t.renewals).toHaveLength(1);
    vi.mocked(t.renew).mockRejectedValueOnce(new AuthenticationError("refused", { status: 401, method: "GET", path: "/auth/renew", body: null }));
    vi.setSystemTime(Date.now() + 20 * HOUR);
    await auth.authorization();
    expect(t.logins).toBe(2);
    auth.close();
  });

  it("token provider: asked again once the token is old", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T00:00:00Z") });
    let calls = 0;
    const provider = vi.fn(() => {
      calls++;
      const now = Math.floor(Date.now() / 1000);
      return jwt({ iat: now, exp: now + 3600, n: calls });
    });
    const auth = new JwtAuth({ type: "provider", provider }, transport());
    await auth.authorization();
    await auth.authorization();
    expect(provider).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 50 * 60 * 1000);
    await auth.authorization();
    expect(provider).toHaveBeenCalledTimes(2);
    auth.close();
  });

  it("client: email + password logs in with PUT /auth, then sends Bearer", async () => {
    const token = jwt({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 });
    const { mt, calls } = testClient(
      (req) =>
        req.path === "/auth"
          ? json({ authenticationToken: { token, expires: "2026-10-27T10:00:00Z" }, user: {}, tenantName: "Acme" })
          : json([]),
      { apiKey: undefined, email: "ada@example.com", password: "correct horse" },
    );
    await mt.models.list();
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.path).toBe("/auth");
    expect(calls[0]?.body).toEqual({ emailAddress: "ada@example.com", password: "correct horse" });
    expect(calls[0]?.headers.get("authorization")).toBeNull();
    expect(calls[1]?.headers.get("authorization")).toBe(`Bearer ${token}`);
    await mt.close();
  });

  it("client: a static token is renewed with GET /auth/renew carrying the old token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const old = jwt({ iat: now - 23 * 3600, exp: now + 3600 });
    const fresh = jwt({ iat: now, exp: now + 86400 });
    const { mt, calls } = testClient(
      (req) => (req.path === "/auth/renew" ? json({ authenticationToken: { token: fresh, expires: null } }) : json([])),
      { apiKey: undefined, token: old },
    );
    await mt.models.list();
    expect(calls[0]?.path).toBe("/auth/renew");
    expect(calls[0]?.headers.get("authorization")).toBe(`Bearer ${old}`);
    expect(calls[1]?.headers.get("authorization")).toBe(`Bearer ${fresh}`);
    await mt.close();
  });

  it("client: a 401 with a password login gets a fresh token and one retry", async () => {
    const now = Math.floor(Date.now() / 1000);
    let logins = 0;
    const { mt, calls } = testClient(
      (req) => {
        if (req.path === "/auth") {
          logins++;
          return json({ authenticationToken: { token: jwt({ iat: now, exp: now + 86400, n: logins }), expires: null } });
        }
        return logins === 1 ? new Response(null, { status: 401 }) : json([]);
      },
      { apiKey: undefined, email: "ada@example.com", password: "pw" },
    );
    await expect(mt.models.list()).resolves.toEqual([]);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["PUT /auth", "GET /ai-models", "PUT /auth", "GET /ai-models"]);
    await mt.close();
  });

  it("client: a 401 with an API key is an AuthenticationError, not retried", async () => {
    const { mt, calls } = testClient(() => new Response(null, { status: 401 }));
    await expect(mt.models.list()).rejects.toBeInstanceOf(AuthenticationError);
    expect(calls).toHaveLength(1);
  });
});
