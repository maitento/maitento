import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { MaitentoError } from "../src/index.js";
import { empty, json, testClient, type Recorded } from "./helpers.js";

const line = (c: Recorded | undefined): string => `${c?.method} ${c?.path}${c?.url.search ?? ""}`;

describe("namespaces and by-name addressing", () => {
  it("lists the whole tenant by default and one namespace on request (the default namespace does not narrow a list)", async () => {
    const { mt, calls } = testClient(() => json([]));
    await mt.agents.list();
    await mt.agents.list({ namespace: "support" });
    expect(calls.map(line)).toEqual(["GET /agents", "GET /namespaces/support/agents"]);
  });

  it("by-name calls use the explicit namespace, else the client's, else explain", async () => {
    const { mt, calls } = testClient(() => json({}));
    await mt.interactions.getByName("hello");
    await mt.interactions.getByName("hello", { namespace: "other" });
    expect(calls.map(line)).toEqual([
      "GET /namespaces/demo/interactions/by-name/hello",
      "GET /namespaces/other/interactions/by-name/hello",
    ]);
    const { mt: bare } = testClient(() => json({}), { namespace: undefined });
    await expect(bare.interactions.getByName("hello")).rejects.toThrow(/No namespace/);
    await expect(bare.interactions.run("hello")).rejects.toBeInstanceOf(MaitentoError);
  });

  it("argument errors reject the returned promise instead of throwing", async () => {
    const { mt, calls } = testClient(() => json({}), { namespace: undefined });
    const empty = mt.agents.get("");
    const noNamespace = mt.apps.start("refund-flow");
    await expect(empty).rejects.toThrow(/path parameter is empty/);
    await expect(noNamespace).rejects.toThrow(/No namespace/);
    expect(calls).toHaveLength(0);
  });

  it("encodes path segments with encodeURIComponent (a space is %20, a slash %2F)", async () => {
    const { mt, calls } = testClient(() => json({}));
    await mt.secrets.getByName("my key");
    await mt.looms.pattern("l1", "acme/web-app");
    expect(calls.map((c) => c.url.pathname)).toEqual(["/secrets/by-name/my%20key", "/looms/by-id/l1/patterns/by-name/acme%2Fweb-app"]);
  });

  it("namespaces: get/find by NAME, getById/findById, create, rename", async () => {
    const { mt, calls } = testClient((req) => (req.path.includes("missing") ? empty(404) : json({ id: "n1", name: "x" })));
    await mt.namespaces.get("support");
    await expect(mt.namespaces.find("missing")).resolves.toBeNull();
    await mt.namespaces.getById("n1");
    await mt.namespaces.create({ name: "support" });
    await mt.namespaces.rename("n1", { name: "help" });
    expect(calls.map(line)).toEqual([
      "GET /namespaces/by-name/support",
      "GET /namespaces/by-name/missing",
      "GET /namespaces/by-id/n1",
      "POST /namespaces",
      "PUT /namespaces/by-id/n1",
    ]);
    expect(calls[4]?.body).toEqual({ name: "help" });
  });
});

describe("starts", () => {
  it("interactions.start by id uses the definition-id route; a version is refused", async () => {
    const { mt, calls } = testClient(() => json({ id: "r1", status: "New" }));
    await mt.interactions.start({ id: "i1" }, { inputs: [{ name: "a", value: "b" }] });
    expect(line(calls[0])).toBe("PUT /interactions/processes/by-id/i1/start");
    expect(calls[0]?.body).toEqual({ inputs: [{ name: "a", value: "b" }] });
    await expect(mt.interactions.start({ id: "i1", version: 2 } as never)).rejects.toThrow(/latest enabled version/);
  });

  it("apps.start by { id } finds the latest enabled version first", async () => {
    const { mt, calls } = testClient((req) =>
      req.method === "GET"
        ? json({ id: "a1", versions: [{ version: 1, isDisabled: false }, { version: 3, isDisabled: true }, { version: 2, isDisabled: false }] })
        : json({ id: "p1", status: "New" }),
    );
    await mt.apps.start({ id: "a1" });
    expect(calls.map(line)).toEqual(["GET /apps/by-id/a1", "PUT /apps/by-id/a1/versions/2/start"]);
    expect(calls[1]?.body).toEqual({ inputs: [] });
  });

  it("an app with no enabled version cannot start", async () => {
    const { mt } = testClient(() => json({ id: "a1", versions: [{ version: 1, isDisabled: true }] }));
    await expect(mt.capsules.start({ id: "c1" })).rejects.toThrow(/no enabled version/);
  });

  it("pipelines.start sends the start request with the credential discriminator first", async () => {
    const { mt, calls } = testClient(() => json({ id: "p1", status: "New" }));
    await mt.pipelines.start("fix-bug", {
      inputs: { issue: "Login fails" },
      repos: [{ name: "app", url: "https://github.com/acme/app.git", credentials: "t", branchSource: "main", branchWork: "fix", type: "http" }],
      processMax: 3_600_000,
    });
    expect(line(calls[0])).toBe("PUT /namespaces/demo/code-pipelines/by-name/fix-bug/start");
    expect(calls[0]?.rawBody).toContain('"repos":[{"type":"http","name":"app"');
    expect((calls[0]?.body as { processMax: string }).processMax).toBe("01:00:00");
    expect((calls[0]?.body as { inputs: unknown }).inputs).toEqual([{ name: "issue", value: "Login fails" }]);
  });
});

describe("interaction runs", () => {
  it("approve/reject send the wire's toolCallApprovalId", async () => {
    const { mt, calls } = testClient(() => empty());
    await mt.interactionRuns.approve("r1", { approvalId: "ap1" });
    await mt.interactionRuns.reject("r1", { approvalId: "ap1", reason: "Too large" });
    expect(calls.map(line)).toEqual(["POST /interactions/processes/by-id/r1/approve", "POST /interactions/processes/by-id/r1/reject"]);
    expect(calls[0]?.body).toEqual({ toolCallApprovalId: "ap1" });
    expect(calls[1]?.body).toEqual({ toolCallApprovalId: "ap1", reason: "Too large" });
  });

  it("listActive needs a namespace (the default one)", async () => {
    const { mt, calls } = testClient(() => json([]));
    await mt.interactionRuns.listActive();
    expect(line(calls[0])).toBe("GET /namespaces/demo/interactions/processes");
  });
});

describe("connectors", () => {
  it("createOpenApi takes httpMethod as a string and sends the wire's { method }", async () => {
    const { mt, calls } = testClient(() => json({ $type: "openapi", id: "c1" }));
    await mt.connectors.createOpenApi({
      name: "orders-get",
      url: "https://api.example.com/orders/{orderId}",
      description: "Reads an order",
      httpMethod: "GET",
      authenticationType: "None",
      pathParameters: [],
      queryParameters: [],
    });
    expect(line(calls[0])).toBe("POST /namespaces/demo/connectors/open-api");
    expect((calls[0]?.body as { httpMethod: unknown }).httpMethod).toEqual({ method: "GET" });
  });
});

describe("files", () => {
  it("upload sends one multipart part named `file`, with its name and content type, from bytes, a Blob, a stream or a path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maitento-sdk-upload-"));
    try {
      const path = join(dir, "handbook.pdf");
      await writeFile(path, "%PDF-1.7");
      const { mt, calls } = testClient(() => json({ id: "f1", dateCreated: "2026-10-26T10:00:00Z" }));
      await mt.files.upload("p1", new Uint8Array([104, 105]), { fileName: "notes.txt" });
      await mt.files.upload("p1", new Blob(["a,b\n1,2"], { type: "text/csv" }), { fileName: "data.csv" });
      await mt.files.upload("p1", Readable.from([Buffer.from("chunk1-"), Buffer.from("chunk2")]), { fileName: "s.md" });
      await mt.files.upload("p1", path);
      await mt.files.upload("p1", new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }));

      const parts = await Promise.all(
        calls.map(async (c) => {
          const file = (c.body as FormData).get("file") as File;
          return { name: file.name, type: file.type, text: await file.text() };
        }),
      );
      expect(parts).toEqual([
        { name: "notes.txt", type: "text/plain", text: "hi" },
        { name: "data.csv", type: "text/csv", text: "a,b\n1,2" },
        { name: "s.md", type: "text/markdown", text: "chunk1-chunk2" },
        { name: "handbook.pdf", type: "application/pdf", text: "%PDF-1.7" },
        { name: "file", type: "application/octet-stream", text: "\u0001" },
      ]);
      expect(calls.every((c) => c.method === "PUT" && c.path === "/files/partitions/p1")).toBe(true);
      // The JSON content type is never set on a multipart body (fetch adds the boundary).
      expect(calls[0]?.headers.get("content-type")).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("text unwraps { text }, and partitionId rides in the query", async () => {
    const { mt, calls } = testClient(() => json({ text: "Refunds within 30 days." }));
    await expect(mt.files.text("f1", { partitionId: "p1" })).resolves.toBe("Refunds within 30 days.");
    expect(line(calls[0])).toBe("GET /files/by-id/f1/text?partitionId=p1");
  });
});

describe("partitions, looms, runs, vfs", () => {
  it("embeddingStatus sends at most 500 ids per call", async () => {
    const { mt, calls } = testClient((req) =>
      json((req.body as { partitionIds: string[] }).partitionIds.map((id) => ({ partitionId: id }))),
    );
    const ids = Array.from({ length: 1201 }, (_, i) => `p${i}`);
    const statuses = await mt.partitions.embeddingStatus({ partitionIds: ids });
    expect(statuses).toHaveLength(1201);
    expect(calls.map((c) => (c.body as { partitionIds: string[] }).partitionIds.length)).toEqual([500, 500, 201]);
  });

  it("looms.list looks the namespace id up by name, or uses the id given", async () => {
    const { mt, calls } = testClient((req) => (req.path.startsWith("/namespaces") ? json({ id: "ns-1", name: "demo" }) : json([])));
    await mt.looms.list();
    await mt.looms.list({ namespaceId: "ns-2" });
    expect(calls.map(line)).toEqual(["GET /namespaces/by-name/demo", "GET /looms/by-namespace/ns-1", "GET /looms/by-namespace/ns-2"]);
  });

  it("runs: kill, retain and release address /processes/{type}/{id}", async () => {
    const { mt, calls } = testClient(() => json({}));
    await mt.runs.kill("r1", { type: "App" });
    await mt.runs.retain("r1", { type: "Interaction", note: "keep" });
    await mt.runs.release("r1", { type: "Interaction" });
    expect(calls.map(line)).toEqual([
      "POST /processes/App/r1/kill",
      "PUT /processes/Interaction/r1/retention-lease",
      "DELETE /processes/Interaction/r1/retention-lease",
    ]);
    expect(calls[1]?.body).toEqual({ note: "keep" });
  });

  it("runs.lane reads whether a run waits for a lane, with its dates as Dates", async () => {
    const { mt, calls } = testClient(() =>
      json({ processId: "r1", processType: "App", waiting: true, waitingSinceUtc: "2027-03-10T12:00:00Z", lane: "Standard", reason: "LanesInUse", lanesInUse: 2, laneLimit: 2, ahead: 1 }),
    );
    const wait = await mt.runs.lane("r1", { type: "App" });
    expect(line(calls[0])).toBe("GET /processes/App/r1/lane");
    expect(wait.waitingSinceUtc).toBeInstanceOf(Date);
    expect(wait.reason).toBe("LanesInUse");
    expect(wait.ahead).toBe(1);
  });

  it("vfs handles address by name or by id, and bytes are sent as base64", async () => {
    const { mt, calls } = testClient(() => json({}));
    await mt.vfs.open("team notes", { namespace: "support" }).writeBytes("/a.bin", new Uint8Array([0, 255, 16]));
    await mt.vfs.openById("v1").deleteDir("/old", { recursive: true });
    expect(line(calls[0])).toBe("PUT /namespaces/support/vfs/by-name/team%20notes/files/write/bytes?path=%2Fa.bin");
    expect(calls[0]?.body).toEqual({ content: "AP8Q" });
    expect(line(calls[1])).toBe("DELETE /vfs/by-id/v1/directories?path=%2Fold&recursive=true");
  });

  it("modelKeys and tenant.modelAccess", async () => {
    const { mt, calls } = testClient((req) =>
      req.path.endsWith("model-access")
        ? json({ forbidMaitentoCredentials: true, hasModelKeys: false })
        : req.method === "DELETE"
          ? empty()
          : json({ id: "k1", provider: "DeepSeek", dateCreated: "2026-10-26T10:00:00Z", dateUpdated: "2026-10-26T10:00:00Z" }),
    );
    await expect(mt.tenant.modelAccess()).resolves.toEqual({ forbidMaitentoCredentials: true, hasModelKeys: false });
    const key = await mt.modelKeys.create({ provider: "DeepSeek", label: "prod", apiKey: "sk-1" });
    expect(key.dateCreated).toBeInstanceOf(Date);
    await mt.modelKeys.update("k1", { label: "prod", priority: 1, isDisabled: true });
    await mt.modelKeys.delete("k1");
    expect(calls.map(line)).toEqual([
      "GET /tenants/self/model-access",
      "POST /tenants/self/model-keys",
      "PUT /tenants/self/model-keys/by-id/k1",
      "DELETE /tenants/self/model-keys/by-id/k1",
    ]);
    expect(calls[1]?.body).toEqual({ provider: "DeepSeek", label: "prod", apiKey: "sk-1" });
  });

  it("webhooks.create sends an empty header map when none is given", async () => {
    const { mt, calls } = testClient(() => json({}));
    await mt.webhooks.create({ type: "InteractionProcess", url: "https://example.com/hook", secret: "s" });
    expect(calls[0]?.body).toEqual({ type: "InteractionProcess", url: "https://example.com/hook", secret: "s", headers: {} });
  });

  it("webhooks.update sends signedOnly when given, and the registration says whether it is signed only", async () => {
    const { mt, calls } = testClient((req) => json({ id: "w1", url: "https://example.com/hook", signedOnly: req.method === "PUT" }));
    expect((await mt.webhooks.get("w1")).signedOnly).toBe(false);
    const updated = await mt.webhooks.update("w1", { url: "https://example.com/hook", signedOnly: true });
    await mt.webhooks.update("w1", { url: "https://example.com/hook" });
    expect(calls.map(line)).toEqual(["GET /web-hooks/by-id/w1", "PUT /web-hooks/by-id/w1", "PUT /web-hooks/by-id/w1"]);
    expect(calls[1]?.body).toEqual({ url: "https://example.com/hook", signedOnly: true });
    expect(calls[2]?.body).toEqual({ url: "https://example.com/hook" });
    expect(updated.signedOnly).toBe(true);
  });
});

describe("billing and the tenant's retention", () => {
  it("the billing reads go to their routes, and notices send the limit only when given", async () => {
    const { mt, calls } = testClient((req) => (req.path === "/billing/notices" ? json([{ kind: "PlanChanged" }]) : json({ tier: "Dev" })));
    await expect(mt.billing.standing()).resolves.toMatchObject({ tier: "Dev" });
    await mt.billing.plan();
    await mt.billing.balance();
    await mt.billing.catalogue();
    await mt.billing.autoTopUp();
    await mt.billing.alerts();
    const notices = await mt.billing.notices({ limit: 5 });
    await mt.billing.notices();
    expect(calls.map(line)).toEqual([
      "GET /billing/standing",
      "GET /billing/plan",
      "GET /billing/balance",
      "GET /billing/catalogue",
      "GET /billing/auto-top-up",
      "GET /billing/alerts",
      "GET /billing/notices?limit=5",
      "GET /billing/notices",
    ]);
    expect(notices[0]?.kind).toBe("PlanChanged");
  });

  it("the balance settings are PUT as the body", async () => {
    const { mt, calls } = testClient((req) => json(req.body));
    await expect(mt.billing.setAutoTopUp({ enabled: true, thresholdAmount: 10, topUpAmount: 50 })).resolves.toMatchObject({ enabled: true });
    await mt.billing.setAlerts({ emailAtPercentOfLastTopUp: 20, showPortalBanner: true, emailWhenWorkRefused: false });
    expect(calls.map(line)).toEqual(["PUT /billing/auto-top-up", "PUT /billing/alerts"]);
    expect(calls[0]?.body).toEqual({ enabled: true, thresholdAmount: 10, topUpAmount: 50 });
    expect(calls[1]?.body).toEqual({ emailAtPercentOfLastTopUp: 20, showPortalBanner: true, emailWhenWorkRefused: false });
  });

  it("tenant.setRetention PUTs the hours, and null goes back to the default", async () => {
    const { mt, calls } = testClient(() => json({ effectiveHours: 168, planMaxHours: 720 }));
    await expect(mt.tenant.setRetention({ hours: 168 })).resolves.toMatchObject({ planMaxHours: 720 });
    await mt.tenant.setRetention({ hours: null });
    await mt.tenant.retention();
    expect(calls.map(line)).toEqual(["PUT /tenants/self/retention", "PUT /tenants/self/retention", "GET /tenants/self/retention"]);
    expect(calls[0]?.body).toEqual({ hours: 168 });
    // Going back to the default sends the null itself, not an empty object.
    expect(calls[1]?.rawBody).toBe('{"hours":null}');
  });
});

describe("credentials and credential stacks", () => {
  const credential = {
    id: "c1",
    name: "openai-production",
    provider: "OpenAi",
    kind: "ApiKey",
    keys: [{ id: "k1", keyHint: "ab12", addedAtUtc: "2026-10-26T10:00:00Z" }],
    oAuth: null,
    health: { consecutiveFailures: 0, lastTestedAtUtc: "2026-10-26T11:00:00Z" },
    dateCreated: "2026-10-26T10:00:00Z",
    dateUpdated: "2026-10-26T10:00:00Z",
  };
  const stack = {
    id: "s1",
    name: "production",
    entries: [],
    version: 1,
    dateCreated: "2026-10-26T10:00:00Z",
    dateUpdated: "2026-10-26T10:00:00Z",
  };

  it("credentials: list (all, by tag), get, find, create, update, delete, deleteByTag, test", async () => {
    const { mt, calls } = testClient((req) => {
      if (req.path.includes("missing")) return empty(404);
      if (req.method === "DELETE" && req.path === "/credentials") return json(3);
      if (req.method === "DELETE") return empty();
      if (req.path.endsWith("/test")) {
        return json({ credentialId: "c1", succeeded: true, errorCode: null, testedAtUtc: "2026-10-26T12:00:00Z", keys: [] });
      }
      return req.method === "GET" && req.path === "/credentials" ? json([credential]) : json(credential);
    });
    const listed = await mt.credentials.list();
    await mt.credentials.list({ tag: "customer 42" });
    const got = await mt.credentials.get("c/1");
    await expect(mt.credentials.find("missing")).resolves.toBeNull();
    await mt.credentials.create({
      name: "openai-production",
      provider: "OpenAi",
      keys: [{ value: "sk-..." }],
      models: [{ model: "gpt-5", deploymentName: "gpt5-prod" }],
      tag: "customer-42",
    });
    await mt.credentials.update("c1", { name: "openai-production", provider: "OpenAi", keys: [{ id: "k1" }, { value: "sk-..." }] });
    await expect(mt.credentials.delete("c1")).resolves.toBeUndefined();
    await expect(mt.credentials.deleteByTag("customer-42")).resolves.toBe(3);
    const tested = await mt.credentials.test("c1");

    expect(calls.map(line)).toEqual([
      "GET /credentials",
      "GET /credentials?tag=customer+42",
      "GET /credentials/by-id/c%2F1",
      "GET /credentials/by-id/missing",
      "POST /credentials",
      "PUT /credentials/by-id/c1",
      "DELETE /credentials/by-id/c1",
      "DELETE /credentials?tag=customer-42",
      "POST /credentials/by-id/c1/test",
    ]);
    expect(calls[4]?.body).toEqual({
      name: "openai-production",
      provider: "OpenAi",
      keys: [{ value: "sk-..." }],
      models: [{ model: "gpt-5", deploymentName: "gpt5-prod" }],
      tag: "customer-42",
    });
    expect(calls[5]?.body).toEqual({ name: "openai-production", provider: "OpenAi", keys: [{ id: "k1" }, { value: "sk-..." }] });
    expect(calls[8]?.rawBody).toBeUndefined();

    // Dates are `Date`s, nested ones included; a key is served only as its hint.
    expect(listed[0]?.dateCreated).toBeInstanceOf(Date);
    expect(got.keys[0]?.addedAtUtc).toBeInstanceOf(Date);
    expect(got.keys[0]).not.toHaveProperty("value");
    expect(got.health.lastTestedAtUtc).toBeInstanceOf(Date);
    expect(tested.testedAtUtc).toBeInstanceOf(Date);
    expect(tested.succeeded).toBe(true);
  });

  it("credentials.testUnsaved posts the create body to /credentials/test, and credentialStacks.usage reads where a stack is used", async () => {
    const { mt, calls } = testClient((req) =>
      req.path === "/credentials/test"
        ? json({ credentialId: "00000000-0000-0000-0000-000000000000", succeeded: true, errorCode: null, testedAtUtc: "2026-10-26T12:00:00Z", keys: [] })
        : json({ credentialStackId: "s1", tenantDefault: true, namespaces: [{ id: "n1", name: "support" }], partitions: [] }),
    );
    const tested = await mt.credentials.testUnsaved({ name: "openai-production", provider: "OpenAi", keys: [{ value: "sk-..." }] });
    const usage = await mt.credentialStacks.usage("s 1");

    expect(calls.map(line)).toEqual(["POST /credentials/test", "GET /credential-stacks/by-id/s%201/usage"]);
    expect(calls[0]?.body).toEqual({ name: "openai-production", provider: "OpenAi", keys: [{ value: "sk-..." }] });
    expect(tested.succeeded).toBe(true);
    expect(tested.testedAtUtc).toBeInstanceOf(Date);
    expect(usage.tenantDefault).toBe(true);
    expect(usage.namespaces[0]?.name).toBe("support");
  });

  it("credentials: a sign-in is started and finished per tool (sent lower-case, as the route spells it)", async () => {
    const { mt, calls } = testClient((req) =>
      req.path.endsWith("/finish")
        ? json({ status: "Complete", credential })
        : json({
            signInId: "si1",
            tool: "Codex",
            verificationUrl: "https://example.com/device",
            userCode: "ABCD-1234",
            pollIntervalSeconds: 5,
            expiresAtUtc: "2026-10-26T10:15:00Z",
          }),
    );
    const started = await mt.credentials.startSignIn("Codex");
    await mt.credentials.startSignIn("Claude", { credentialId: "c1" });
    const finished = await mt.credentials.finishSignIn("Codex", { signInId: "si1", name: "team-chatgpt", tag: "team" });
    await mt.credentials.finishSignIn("claude", { signInId: "si2", code: "<the code Anthropic showed>" });

    expect(calls.map(line)).toEqual([
      "POST /credentials/sign-in/codex",
      "POST /credentials/sign-in/claude",
      "POST /credentials/sign-in/codex/finish",
      "POST /credentials/sign-in/claude/finish",
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      {},
      { credentialId: "c1" },
      { signInId: "si1", name: "team-chatgpt", tag: "team" },
      { signInId: "si2", code: "<the code Anthropic showed>" },
    ]);
    expect(started.expiresAtUtc).toBeInstanceOf(Date);
    expect(started.userCode).toBe("ABCD-1234");
    expect(finished.status).toBe("Complete");
    expect(finished.credential?.dateCreated).toBeInstanceOf(Date);
  });

  it("credentials: a sign-in's tokens you hold are brought, then replaced after each refresh", async () => {
    const { mt, calls } = testClient(() => json({ id: "c1", name: "acme-claude-max", kind: "OAuth" }));
    const expiresAtUtc = new Date("2027-04-16T17:00:00Z");
    const imported = await mt.credentials.importSignIn({
      tool: "Claude",
      accessToken: "at-...",
      refreshToken: "rt-...",
      expiresAtUtc,
      subscriptionType: "max",
      name: "acme-claude-max",
      tag: "acme",
    });
    await mt.credentials.replaceSignInTokens("c/1", { tool: "Codex", accessToken: "at-2", refreshToken: "rt-2", idToken: "id-2", expiresAtUtc });

    expect(calls.map(line)).toEqual(["POST /credentials/sign-in-tokens", "PUT /credentials/by-id/c%2F1/sign-in-tokens"]);
    expect(calls[0]?.body).toEqual({
      tool: "Claude",
      accessToken: "at-...",
      refreshToken: "rt-...",
      expiresAtUtc: "2027-04-16T17:00:00.000Z",
      subscriptionType: "max",
      name: "acme-claude-max",
      tag: "acme",
    });
    expect(calls[1]?.body).toMatchObject({ tool: "Codex", idToken: "id-2" });
    expect(imported.id).toBe("c1");
  });

  it("credentialStacks: list, get, find, create, update, delete", async () => {
    const { mt, calls } = testClient((req) =>
      req.path.includes("missing")
        ? empty(404)
        : req.method === "DELETE"
          ? empty()
          : req.method === "GET" && req.path === "/credential-stacks"
            ? json([stack])
            : json(stack),
    );
    const listed = await mt.credentialStacks.list();
    await mt.credentialStacks.get("s 1");
    await expect(mt.credentialStacks.find("missing")).resolves.toBeNull();
    const created = await mt.credentialStacks.create({
      name: "production",
      description: "Foundry first, then the public API",
      entries: [
        { credentialId: "c1", allowedEndpointKinds: ["Foundry"] },
        { credentialId: "c2", allowedModels: ["gpt-5"], enabled: false },
      ],
    });
    await mt.credentialStacks.update("s1", { name: "production", entries: [{ credentialId: "c2" }] });
    await expect(mt.credentialStacks.delete("s1")).resolves.toBeUndefined();
    await expect(mt.credentialStacks.findByName("missing")).resolves.toBeNull();
    await mt.credentialStacks.findByName("customer acme/coding");

    expect(calls.map(line)).toEqual([
      "GET /credential-stacks",
      "GET /credential-stacks/by-id/s%201",
      "GET /credential-stacks/by-id/missing",
      "POST /credential-stacks",
      "PUT /credential-stacks/by-id/s1",
      "DELETE /credential-stacks/by-id/s1",
      "GET /credential-stacks/by-name/missing",
      "GET /credential-stacks/by-name/customer%20acme%2Fcoding",
    ]);
    expect(calls[3]?.body).toEqual({
      name: "production",
      description: "Foundry first, then the public API",
      entries: [
        { credentialId: "c1", allowedEndpointKinds: ["Foundry"] },
        { credentialId: "c2", allowedModels: ["gpt-5"], enabled: false },
      ],
    });
    expect(calls[4]?.body).toEqual({ name: "production", entries: [{ credentialId: "c2" }] });
    expect(listed[0]?.dateCreated).toBeInstanceOf(Date);
    expect(created.dateUpdated).toBeInstanceOf(Date);
  });

  it("credentialStacks: the tenant's and a namespace's default, set by id and cleared with null", async () => {
    const { mt, calls } = testClient((req) =>
      json({ credentialStackId: req.method === "PUT" ? (req.body as { credentialStackId: string | null }).credentialStackId : "s1" }),
    );
    await expect(mt.credentialStacks.getTenantDefault()).resolves.toEqual({ credentialStackId: "s1" });
    await expect(mt.credentialStacks.setTenantDefault("s2")).resolves.toEqual({ credentialStackId: "s2" });
    await expect(mt.credentialStacks.setTenantDefault(null)).resolves.toEqual({ credentialStackId: null });
    await mt.credentialStacks.getNamespaceDefault("n/1");
    await mt.credentialStacks.setNamespaceDefault("n1", "s3");
    await mt.credentialStacks.setNamespaceDefault("n1", null);

    expect(calls.map(line)).toEqual([
      "GET /tenants/self/default-credential-stack",
      "PUT /tenants/self/default-credential-stack",
      "PUT /tenants/self/default-credential-stack",
      "GET /namespaces/by-id/n%2F1/default-credential-stack",
      "PUT /namespaces/by-id/n1/default-credential-stack",
      "PUT /namespaces/by-id/n1/default-credential-stack",
    ]);
    expect(calls[1]?.body).toEqual({ credentialStackId: "s2" });
    // Clearing sends the null itself, not an empty object.
    expect(calls[2]?.rawBody).toBe('{"credentialStackId":null}');
    expect(calls[4]?.body).toEqual({ credentialStackId: "s3" });
    expect(calls[5]?.rawBody).toBe('{"credentialStackId":null}');
  });

  it("partitions: the credential stack a knowledge base embeds with, set by id and cleared with null", async () => {
    const { mt, calls } = testClient((req) =>
      json({
        id: "p1",
        name: "handbook",
        embeddingCredentialStackId: (req.body as { credentialStackId: string | null }).credentialStackId,
      }),
    );
    const set = await mt.partitions.setEmbeddingCredentialStack("p/1", "s1");
    const cleared = await mt.partitions.setEmbeddingCredentialStack("p1", null);

    expect(calls.map(line)).toEqual([
      "PUT /partitions/by-id/p%2F1/embedding-credential-stack",
      "PUT /partitions/by-id/p1/embedding-credential-stack",
    ]);
    expect(calls[0]?.body).toEqual({ credentialStackId: "s1" });
    expect(calls[1]?.rawBody).toBe('{"credentialStackId":null}');
    expect(set.embeddingCredentialStackId).toBe("s1");
    expect(cleared.embeddingCredentialStackId).toBeNull();
  });

  it("automations: an app or interaction action names the stack its runs use", async () => {
    const { mt, calls } = testClient(() => json({ id: "a1", name: "nightly" }));
    await mt.automations.create(
      {
        name: "nightly",
        actions: [
          { config: { $type: "app", version: { id: "app1", version: 1 }, inputs: [], credentialStack: "customer-acme" } },
          { config: { $type: "interaction", version: { id: "i1", version: 2 }, inputs: [], credentialStack: null } },
        ],
      },
      { namespace: "demo" },
    );

    const sent = calls[0]?.body as { actions: { config: Record<string, unknown> }[] };
    expect(sent.actions[0]?.config.credentialStack).toBe("customer-acme");
    expect(sent.actions[1]?.config).toHaveProperty("credentialStack", null);
  });

  it("retries the PUTs on a 503, never the POSTs (create, test, sign-in)", async () => {
    const seen = new Set<string>();
    const { mt, calls } = testClient(
      (req) => {
        const key = `${req.method} ${req.path}`;
        if (!seen.has(key)) {
          seen.add(key);
          return json({}, 503, { "retry-after": "0" });
        }
        return json({ credentialStackId: null });
      },
      { maxRetries: 1 },
    );
    await mt.credentials.update("c1", { name: "x", provider: "OpenAi", keys: [{ id: "k1" }] });
    await mt.credentialStacks.update("s1", { name: "x", entries: [{ credentialId: "c1" }] });
    await mt.credentialStacks.setTenantDefault(null);
    await mt.credentialStacks.setNamespaceDefault("n1", "s1");
    expect(calls).toHaveLength(8);

    calls.length = 0;
    const once = [
      mt.credentials.create({ name: "x", provider: "OpenAi", keys: [{ value: "sk-..." }] }),
      mt.credentials.test("c1"),
      mt.credentials.startSignIn("Codex"),
      mt.credentials.finishSignIn("Codex", { signInId: "si1" }),
      mt.credentials.importSignIn({ tool: "Claude", accessToken: "at", refreshToken: "rt", expiresAtUtc: "2027-04-16T17:00:00Z" }),
      mt.credentialStacks.create({ name: "x", entries: [{ credentialId: "c1" }] }),
    ];
    for (const call of once) {
      await expect(call).rejects.toMatchObject({ status: 503 });
    }
    expect(calls.map(line).sort()).toEqual([
      "POST /credential-stacks",
      "POST /credentials",
      "POST /credentials/by-id/c1/test",
      "POST /credentials/sign-in-tokens",
      "POST /credentials/sign-in/codex",
      "POST /credentials/sign-in/codex/finish",
    ]);
  });
});
