import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EXCLUDED_ROUTES, ROUTE_MAP, routeMapJson } from "../src/route-map.js";
import { VfsHandle } from "../src/resources/vfs.js";
import { fakeSockets } from "./fake-socket.js";
import { json, testClient } from "./helpers.js";

const packageRoot = join(import.meta.dirname, "..");

interface Route {
  verb: string;
  path: string;
  sdk: boolean;
  anonymous: boolean;
  websocket: boolean;
}

async function routes(): Promise<Route[]> {
  return (JSON.parse(await readFile(join(packageRoot, "..", "routes.json"), "utf8")) as { routes: Route[] }).routes;
}

const key = (r: Route): string => `${r.verb} ${r.path}`;

describe("route map ↔ routes.json", () => {
  it("covers every sdk:true route exactly: no route missing, none unknown, none twice", async () => {
    const sdk = (await routes()).filter((r) => r.sdk).map(key);
    const mapped = ROUTE_MAP.map((e) => e.route);
    const excluded = EXCLUDED_ROUTES.map((e) => e.route);
    const covered = [...mapped, ...excluded];

    expect(covered.filter((r) => !sdk.includes(r)), "routes that are not sdk:true routes").toEqual([]);
    expect(sdk.filter((r) => !covered.includes(r)), "sdk:true routes the SDK does not reach").toEqual([]);
    expect(new Set(mapped).size, "a route mapped twice").toBe(mapped.length);
    expect(mapped.filter((r) => excluded.includes(r)), "mapped and excluded").toEqual([]);
    expect(mapped.length + excluded.length).toBe(sdk.length);
  });

  it("excludes only anonymous sign-up and account-recovery routes, each with a reason", async () => {
    const byKey = new Map((await routes()).map((r) => [key(r), r]));
    for (const excluded of EXCLUDED_ROUTES) {
      expect(byKey.get(excluded.route)?.anonymous, excluded.route).toBe(true);
      expect(excluded.reason.length).toBeGreaterThan(10);
    }
  });

  it("names a real SDK method for every route", () => {
    const { mt } = testClient(() => json([]));
    const client = mt as unknown as Record<string, Record<string, unknown>>;
    for (const entry of ROUTE_MAP) {
      if (entry.method.startsWith("new Maitento")) {
        expect(["PUT /auth", "GET /auth/renew"]).toContain(entry.route);
        continue;
      }
      const handle = /^vfs\.(?:open\(name\)|openById\(id\))\.(\w+)$/.exec(entry.method);
      if (handle) {
        expect(typeof (VfsHandle.prototype as unknown as Record<string, unknown>)[handle[1]!], entry.method).toBe("function");
        continue;
      }
      const [group, method] = entry.method.split(".");
      expect(typeof client[group!]?.[method!], entry.method).toBe("function");
      expect(entry.example, entry.route).toContain(`mt.${group === "builds" && method === "deploy" ? "deploy" : `${group}.${method}`}`);
    }
  });

  it("route-map.json is up to date (npm run route-map)", async () => {
    const committed = (await readFile(join(packageRoot, "route-map.json"), "utf8")).replace(/\r\n/g, "\n");
    expect(committed).toBe(routeMapJson());
  });
});

describe("every example runs and reaches its route", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "maitento-sdk-examples-"));
    await mkdir(join(dir, "maitento", "agents"), { recursive: true });
    await writeFile(join(dir, "maitento", "agents", "greeter.mtr"), 'model = @ref("deepseek.deepseek-v4-flash")');
    await writeFile(join(dir, "handbook.pdf"), "%PDF-1.7");
    await writeFile(join(dir, "handbook-v2.pdf"), "%PDF-1.7 v2");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Turns a one-line TypeScript example into JavaScript (drops `!` non-null assertions) with local paths. */
  function toJavaScript(example: string): string {
    return example
      .replace(/([\w\])])!(?=[\s,)\];}.])/g, "$1")
      .replace(/"\.\/maitento"/g, JSON.stringify(join(dir, "maitento")))
      .replace(/"\.\/(handbook(?:-v2)?\.pdf)"/g, (_m, file: string) => JSON.stringify(join(dir, file)));
  }

  const placeholders: Record<string, unknown> = {
    definition: { name: "hello", prompt: "Say hello." },
    repos: [],
    edits: [],
    operations: [],
    credentials: [],
    accessToken: "at-...",
    refreshToken: "rt-...",
    expiresAtUtc: new Date("2027-04-16T17:00:00Z"),
    profile: {},
    digestConfig: { $type: "interaction", inputs: [], version: { id: "0e7d9b3c-2f1a-4c5e-9d8b-7a6f5e4d3c2b", version: 1 } },
    pngBytes: new Uint8Array([137, 80, 78, 71]),
    jwt: "header.payload.signature",
    run: { pendingApproval: { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" } },
  };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    ...args: string[]
  ) => (...values: unknown[]) => Promise<void>;

  /** A response every call can read: it has what the SDK touches after a call. */
  const anything = (req: { path: string }): Response =>
    req.path === "/partitions/embedding-status"
      ? json([])
      : json({
      id: "4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d",
      status: "Finished",
      dateCreated: "2026-10-26T10:00:00Z",
      dateUpdated: "2026-10-26T10:00:05Z",
      items: [],
      nextCursor: null,
      versions: [{ version: 1, isDisabled: false }],
      isSuccess: true,
      isDeployed: true,
      log: [],
      text: "",
      processId: "4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d",
      secret: "s",
      user: {},
      tenant: {},
      roles: [],
      forbidMaitentoCredentials: false,
      hasModelKeys: true,
    });

  const runnable = ROUTE_MAP.filter((e) => !e.method.startsWith("new Maitento"));

  it.each(runnable.map((e) => [e.route, e] as const))("%s", async (_route, entry) => {
    const { factory, sockets } = fakeSockets();
    const { mt, calls } = testClient(anything, { webSocket: factory });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Placeholders stand in for values a real program has; an example that declares the name itself wins.
      const names = Object.keys(placeholders).filter(
        (n) => !new RegExp(String.raw`\b(?:const|let)\s+${n}\b`).test(entry.example),
      );
      const fn = new AsyncFunction("mt", ...names, toJavaScript(entry.example));
      await fn(mt, ...names.map((n) => placeholders[n]));
    } finally {
      log.mockRestore();
      await mt.close();
    }
    const [verb, path] = entry.route.split(" ") as [string, string];
    const pattern = new RegExp("^" + path.replace(/\{[^}]+\}/g, "[^/]+") + "$");
    if (entry.route === "GET /notifications") {
      expect(sockets.map((s) => new URL(s.url).pathname)).toEqual(["/notifications"]);
      return;
    }
    const hit = calls.some((c) => c.method === verb && pattern.test(c.path));
    expect(hit, `${entry.example}\n→ ${calls.map((c) => `${c.method} ${c.path}`).join(", ")}`).toBe(true);
  });
});
