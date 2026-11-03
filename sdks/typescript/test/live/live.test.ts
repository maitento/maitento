// Live smoke test against a running Maitento API. Opt-in: `npm run test:live`, never part of `npm test`.
//
//   MAITENTO_BASE_URL   the API (e.g. a dev env's http://127.0.0.1:<port>)
//   MAITENTO_API_KEY    "<userId>:<secret>" of a Tenant.Admin user
//   MAITENTO_TEST_DEEPSEEK_KEY  the DeepSeek key the runs bring
//
// It deploys test/live/project into namespace `sdk-ts-live`, runs it, and deletes what it created. No credential is
// ever printed.
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { Maitento, type EventStream, type InteractionStartRequest } from "../../src/index.js";

const NAMESPACE = "sdk-ts-live";
const MODEL = "deepseek.deepseek-v4-flash";
const PROJECT = join(import.meta.dirname, "project");

const configured = Boolean(process.env.MAITENTO_API_KEY && process.env.MAITENTO_BASE_URL);
const apiKey = process.env.MAITENTO_TEST_DEEPSEEK_KEY;

describe.skipIf(!configured || !apiKey)("live: @maitento/sdk against a running API", () => {
  let mt: Maitento;
  let events: EventStream | undefined;
  let namespaceExisted = false;
  const deployed: { agents: string[]; interactions: string[] } = { agents: [], interactions: [] };
  const withKey = (request: InteractionStartRequest): InteractionStartRequest => ({
    ...request,
    credentials: [{ provider: "DeepSeek", apiKey: apiKey!, credentialId: "sdk-live", isOwnLicense: true, priority: 0 }],
  });

  beforeAll(async () => {
    mt = new Maitento({ namespace: NAMESPACE, timeout: 120_000 });
    namespaceExisted = (await mt.namespaces.find(NAMESPACE)) !== null;
  });

  afterAll(async () => {
    await events?.close();
    // Clean up only what this test created: the interactions, then the agent they use, then the namespace if it
    // did not exist before. Runs are left to the tenant's retention.
    for (const id of deployed.interactions) await mt.interactions.delete(id).catch(() => undefined);
    for (const id of deployed.agents) await mt.agents.delete(id).catch(() => undefined);
    if (!namespaceExisted) {
      const ns = await mt.namespaces.find(NAMESPACE).catch(() => null);
      if (ns) await mt.namespaces.delete(ns.id).catch((e: unknown) => console.log(`namespace not deleted: ${String(e)}`));
    }
    await mt.close();
  });

  it("knows who it is and lists the model catalogue", async () => {
    const self = await mt.users.self();
    expect(self.user.id).toBeTruthy();
    const models = await mt.models.list();
    expect(models.length).toBeGreaterThan(0);
    expect(models.map((m) => m.name)).toContain(MODEL);
    const access = await mt.tenant.modelAccess();
    console.log(`user ${self.user.id} roles=${self.roles.join(",")}; ${models.length} models; model access ${JSON.stringify(access)}`);
  });

  it("validates, then deploys the project folder", async () => {
    const validation = await mt.validate(PROJECT);
    expect(validation.isSuccess, JSON.stringify(validation.log.filter((l) => l.logLevel === "Error"))).toBe(true);
    expect(validation.isDeployed).toBe(false);

    const started = Date.now();
    const build = await mt.deploy(PROJECT);
    expect(build.isSuccess).toBe(true);
    expect(build.isDeployed).toBe(true);
    deployed.agents.push(...build.agents.map((a) => a.entity.id));
    deployed.interactions.push(...build.interactions.oneShot.map((i) => i.entity.id));
    console.log(
      `deployed build ${build.buildId} in ${Date.now() - started} ms: agents ${build.agents.map((a) => `${a.entity.name}(${a.mode})`).join(", ")}; ` +
        `interactions ${build.interactions.oneShot.map((i) => `${i.entity.name}(${i.mode})`).join(", ")}`,
    );
    expect(deployed.interactions).toHaveLength(2);
  });

  it("runs hello, streaming its tokens over the event socket", async () => {
    events = await mt.events.connect();
    const tokens: string[] = [];
    const statuses: string[] = [];
    const started = Date.now();
    const run = await mt.interactions.run(
      "hello",
      withKey({ inputs: { message: "Say hello to the SDK test in one short sentence." } }),
      {
        onToken: (text) => tokens.push(text),
        onUpdate: (r) => statuses.push(r.status),
        timeout: 180_000,
      },
    );
    const elapsed = Date.now() - started;
    expect(run.status).toBe("Finished");
    expect(run.output?.trim()).toBeTruthy();
    expect(run.dateCreated).toBeInstanceOf(Date);
    expect(typeof run.executionTime).toBe("number");
    console.log(
      `run ${run.id} Finished in ${elapsed} ms (server executionTime ${run.executionTime} ms); statuses ${statuses.join(" > ")}; ` +
        `${tokens.length} streamed deltas; output: ${JSON.stringify(run.output)}`,
    );
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.join("").length).toBeGreaterThan(0);

    const entries = mt.interactionRuns.transcript(run);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("returns a structured answer that matches the schema", async () => {
    const started = Date.now();
    const run = await mt.interactions.run(
      "typed-answer",
      withKey({ inputs: { question: "What is the capital of France?" } }),
      { timeout: 180_000 },
    );
    const answer = JSON.parse(run.output ?? "{}") as { answer?: unknown; confidence?: unknown };
    expect(typeof answer.answer).toBe("string");
    expect(typeof answer.confidence).toBe("number");
    console.log(`structured run ${run.id} in ${Date.now() - started} ms: ${run.output}`);
  });

  it("pages through runs", async () => {
    const first = await mt.runs.list({ types: ["Interaction"], limit: 1 });
    expect(first.items).toHaveLength(1);
    const seen: string[] = [];
    for await (const summary of mt.runs.list({ types: ["Interaction"], limit: 1 })) {
      seen.push(summary.id);
      expect(summary.dateCreated).toBeInstanceOf(Date);
      if (seen.length === 3) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    console.log(`paged ${seen.length} runs one per page; first page nextCursor present: ${first.nextCursor !== null}`);
  });

  it("opens the event socket through the `ws` package (the Node 20 path)", async () => {
    const viaWs = new Maitento({ namespace: NAMESPACE, webSocket: WebSocket });
    try {
      // The server checks the credential BEFORE the upgrade, so an open socket proves the header reached it.
      const stream = await viaWs.events.connect();
      expect(stream.isOpen).toBe(true);
      // Frames arrive too: `setup` right after the upgrade (it can land before a handler is attached: delivery is
      // at-most-once) and the server's `ping` every 15 s.
      const first = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no frame within 20 s")), 20_000);
        const done = (name: string) => () => {
          clearTimeout(timer);
          resolve(name);
        };
        stream.on("setup", done("setup"));
        stream.on("ping", done("ping"));
      });
      expect(["setup", "ping"]).toContain(first);
    } finally {
      await viaWs.close();
    }
  });

  it("finds nothing where there is nothing, and get throws NotFoundError", async () => {
    expect(await mt.interactions.findByName("no-such-interaction")).toBeNull();
    await expect(mt.agents.get("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ name: "NotFoundError" });
  });
});
