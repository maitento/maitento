import { afterEach, describe, expect, it, vi } from "vitest";
import { AbortError, ProcessFailedError, TimeoutError, transcript } from "../src/index.js";
import { fakeSockets } from "./fake-socket.js";
import { empty, interactionRun, json, testClient, type Recorded } from "./helpers.js";

afterEach(() => {
  vi.useRealTimers();
});

const RUN_ID = "e4c2a1b3-9d8f-4e7a-b6c5-d4e3f2a1b0c9";

function at(seconds: number): string {
  return new Date(Date.UTC(2026, 9, 26, 10, 0, seconds)).toISOString();
}

/** A server that starts a run, then answers each GET with the next state in `states`. */
function scripted(states: Array<Record<string, unknown>>): (req: Recorded) => Response {
  let polls = 0;
  return (req) => {
    if (req.method === "PUT" && req.path.endsWith("/start")) return json(interactionRun({ status: "New", dateUpdated: at(0) }));
    if (req.method === "POST" && req.path.endsWith("/kill")) return empty();
    const state = states[Math.min(polls, states.length - 1)] ?? {};
    polls++;
    return json(interactionRun(state));
  };
}

describe("run(): polling (no event stream)", () => {
  it("starts, polls (1 s growing to 5 s) and resolves with the finished run", async () => {
    vi.useFakeTimers();
    const { mt, calls } = testClient(
      scripted([
        { status: "Running", dateUpdated: at(1) },
        { status: "Running", dateUpdated: at(1) },
        { status: "Finished", dateUpdated: at(3), output: "Hello! How are you?", dateEnded: at(3) },
      ]),
    );
    const updates: string[] = [];
    const promise = mt.interactions.run("hello", { inputs: { message: "Hi" } }, { onUpdate: (r) => updates.push(r.status) });
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "PUT /namespaces/demo/interactions/by-name/hello/start",
      `GET /interactions/processes/by-id/${RUN_ID}`,
    ]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(2250);
    const run = await promise;
    expect(run.status).toBe("Finished");
    expect(run.output).toBe("Hello! How are you?");
    expect(run.dateEnded).toBeInstanceOf(Date);
    // onUpdate fires per new state, not per poll.
    expect(updates).toEqual(["New", "Running", "Finished"]);
  });

  it("calls onWaiting once per waiting state, and keeps following", async () => {
    vi.useFakeTimers();
    const { mt } = testClient(
      scripted([
        { status: "PendingApproval", dateUpdated: at(1), pendingApproval: { id: "ap1", functionName: "refund" } },
        { status: "PendingApproval", dateUpdated: at(1) },
        { status: "Running", dateUpdated: at(2) },
        { status: "HumanInteractionRequired", dateUpdated: at(3) },
        { status: "Finished", dateUpdated: at(4) },
      ]),
    );
    const waiting: string[] = [];
    const promise = mt.interactions.run("hello", undefined, { onWaiting: (r) => waiting.push(r.status) });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(promise).resolves.toMatchObject({ status: "Finished" });
    expect(waiting).toEqual(["PendingApproval", "HumanInteractionRequired"]);
  });

  it("calls onWaiting again for a new pending approval, even when the redraft in between is not seen", async () => {
    vi.useFakeTimers();
    // A rejected call that the agent redrafts: PendingApproval, a moment of Running that polling misses, then
    // PendingApproval again with a new approval, which needs an answer too.
    const { mt } = testClient(
      scripted([
        { status: "PendingApproval", dateUpdated: at(1), pendingApproval: { id: "ap1", functionName: "refund" } },
        { status: "PendingApproval", dateUpdated: at(2), pendingApproval: { id: "ap1", functionName: "refund" } },
        { status: "PendingApproval", dateUpdated: at(3), pendingApproval: { id: "ap2", functionName: "refund" } },
        { status: "Finished", dateUpdated: at(4) },
      ]),
    );
    const asked: string[] = [];
    const promise = mt.interactions.run("hello", undefined, { onWaiting: (r) => asked.push(r.pendingApproval?.id ?? "") });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(promise).resolves.toMatchObject({ status: "Finished" });
    expect(asked).toEqual(["ap1", "ap2"]);
  });

  it("waits on an async onWaiting, and rejects with its error when it fails", async () => {
    vi.useFakeTimers();
    const answered = testClient(
      scripted([
        { status: "HumanInteractionRequired", dateUpdated: at(1) },
        { status: "Finished", dateUpdated: at(2) },
      ]),
    );
    const seen: string[] = [];
    const ok = answered.mt.interactions.run("hello", undefined, {
      onWaiting: async (r) => {
        await Promise.resolve();
        seen.push(r.status);
      },
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(ok).resolves.toMatchObject({ status: "Finished" });
    expect(seen).toEqual(["HumanInteractionRequired"]);

    const failing = testClient(scripted([{ status: "HumanInteractionRequired", dateUpdated: at(1) }]));
    const problem = new Error("the terminal closed");
    const rejected = failing.mt.interactions
      .run("hello", undefined, { onWaiting: async () => { throw problem; } })
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await rejected).toBe(problem);
  });

  it("throws ProcessFailedError for Error and Killed, carrying the run and its failureDetails", async () => {
    vi.useFakeTimers();
    const { mt } = testClient(
      scripted([{ status: "Error", dateUpdated: at(2), failureDetails: "No key for DeepSeek [api:model-keys:none-for-provider]" }]),
    );
    const promise = mt.interactions.run("hello").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000);
    const error = (await promise) as ProcessFailedError<{ id: string }>;
    expect(error).toBeInstanceOf(ProcessFailedError);
    expect(error.status).toBe("Error");
    expect(error.failureDetails).toContain("[api:model-keys:none-for-provider]");
    expect(error.run.id).toBe(RUN_ID);

    const killed = testClient(scripted([{ status: "Killed", dateUpdated: at(2) }]));
    const pending = killed.mt.interactions.run("hello", undefined, { throwOnFailure: false });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toMatchObject({ status: "Killed" });
  });

  it("names the kind of run, its id, its status and its failure in the error, as every SDK does", async () => {
    vi.useFakeTimers();
    const failed = testClient(scripted([{ status: "Error", dateUpdated: at(2), failureDetails: "The model refused." }]));
    const error = failed.mt.interactions.run("hello").catch((e: unknown) => e);
    const killed = testClient(scripted([{ status: "Killed", dateUpdated: at(2) }]));
    const killedError = killed.mt.interactions.run("hello").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(((await error) as Error).message).toBe(`Interaction run ${RUN_ID} ended Error: The model refused.`);
    expect(((await killedError) as Error).message).toBe(`Interaction run ${RUN_ID} ended Killed.`);

    const others = testClient((req) => {
      const body = { id: "p1", status: req.method === "PUT" ? "New" : "Error", dateUpdated: at(1), dateCreated: at(0) };
      if (req.method === "PUT") return json(body);
      if (req.path.includes("/apps/")) return json({ ...body, failureDetails: "Tell me which product." });
      if (req.path.includes("/capsule-processes/")) return json({ ...body, failureDetails: "exit code 1" });
      return json({ ...body, failureDetails: "", failureReason: "AgentTimedOut" });
    });
    const app = others.mt.apps.run("taglines").catch((e: unknown) => e);
    const capsule = others.mt.capsules.run("sandbox").catch((e: unknown) => e);
    const pipeline = others.mt.pipelines.run("fix-bug", { repos: [] }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000);
    expect(((await app) as Error).message).toBe("App run p1 ended Error: Tell me which product.");
    expect(((await capsule) as Error).message).toBe("Capsule run p1 ended Error: exit code 1");
    expect(((await pipeline) as Error).message).toBe("Code pipeline run p1 ended Error: AgentTimedOut");
  });

  it("an abort stops following (AbortError) and kills the run only with killOnAbort", async () => {
    vi.useFakeTimers();
    const keep = testClient(scripted([{ status: "Running", dateUpdated: at(1) }]));
    const controller = new AbortController();
    const kept = keep.mt.interactions.run("hello", undefined, { signal: controller.signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2500);
    controller.abort();
    expect(await kept).toBeInstanceOf(AbortError);
    expect(keep.calls.some((c) => c.path.endsWith("/kill"))).toBe(false);

    const kill = testClient(scripted([{ status: "Running", dateUpdated: at(1) }]));
    const second = new AbortController();
    const killed = kill.mt.interactions
      .run("hello", undefined, { signal: second.signal, killOnAbort: true })
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1500);
    second.abort();
    expect(await killed).toBeInstanceOf(AbortError);
    const killCall = kill.calls.find((c) => c.path.endsWith("/kill"));
    expect(killCall?.method).toBe("POST");
    expect(killCall?.path).toBe(`/processes/Interaction/${RUN_ID}/kill`);
  });

  it("a timeout throws TimeoutError (and kills with killOnAbort)", async () => {
    vi.useFakeTimers();
    const { mt, calls } = testClient(scripted([{ status: "Running", dateUpdated: at(1) }]));
    const promise = mt.interactions.run("hello", undefined, { timeout: 10_000, killOnAbort: true }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await promise;
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as Error).message).toBe(`Interaction run ${RUN_ID} did not finish within 10s.`);
    expect(calls.some((c) => c.path === `/processes/Interaction/${RUN_ID}/kill`)).toBe(true);
  });

  it("apps, capsules and pipelines follow their own runs", async () => {
    vi.useFakeTimers();
    const done = { status: "Finished", dateUpdated: at(5), dateCreated: at(0) };
    const { mt, calls } = testClient((req) => {
      if (req.method === "PUT") return json({ id: "p1", status: "New", dateUpdated: at(0), dateCreated: at(0) });
      return json({ id: "p1", ...done });
    });
    const app = mt.apps.run("refund-flow", { inputs: { orderId: "A-1" } });
    const capsule = mt.capsules.run("sandbox");
    const pipeline = mt.pipelines.run("fix-bug", { repos: [] });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(app).resolves.toMatchObject({ status: "Finished" });
    await expect(capsule).resolves.toMatchObject({ status: "Finished" });
    await expect(pipeline).resolves.toMatchObject({ status: "Finished" });
    const gets = calls.filter((c) => c.method === "GET").map((c) => c.path).sort();
    expect(gets).toEqual(["/apps/processes/by-id/p1", "/capsule-processes/by-id/p1", "/code-pipelines/processes/by-id/p1"]);
    expect(calls.find((c) => c.path.includes("/apps/"))?.body).toEqual({ inputs: [{ name: "orderId", value: "A-1" }] });
  });
});

describe("run(): over an open event stream", () => {
  it("follows interaction-process-updated pushes, streams Chat tokens via onToken, and does not poll", async () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeSockets();
    const { mt, calls } = testClient(scripted([{ status: "New", dateUpdated: at(0) }]), { webSocket: factory });
    const events = await mt.events.connect();
    const socket = sockets[0]!;
    const tokens: string[] = [];
    const promise = mt.interactions.run("hello", undefined, { onToken: (t, agent) => tokens.push(`${agent}:${t}`) });
    // The start, then one read in case the run moved before the subscription.
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.method)).toEqual(["PUT", "GET"]);

    const stream = (text: string, type: string, id = RUN_ID): unknown => ({
      name: "interaction-process-stream",
      id: 1,
      message: { stream: text, sequence: 0, associatedId: id, agentName: "Greeter", date: at(1), type },
    });
    socket.receive({ name: "interaction-process-updated", id: 2, message: interactionRun({ status: "Running", dateUpdated: at(1) }) });
    socket.receive(stream("Hel", "Chat"));
    socket.receive(stream("getWeather(city=Paris)", "Function"));
    socket.receive(stream("lo", "Chat"));
    socket.receive(stream("not mine", "Chat", "ffffffff-0000-4000-8000-000000000000"));
    socket.receive({
      name: "interaction-process-updated",
      id: 3,
      message: interactionRun({ status: "Finished", dateUpdated: at(2), output: "Hello" }),
    });
    const run = await promise;
    expect(run.output).toBe("Hello");
    expect(tokens).toEqual(["Greeter:Hel", "Greeter:lo"]);
    expect(calls).toHaveLength(2);
    await events.close();
  });

  it("with onToken and no stream open: opens one before the start, streams the tokens, and closes it after", async () => {
    // Passing onToken without connecting first used to stream nothing at all, silently.
    vi.useFakeTimers();
    const { factory, sockets } = fakeSockets();
    const order: string[] = [];
    const { mt, calls } = testClient(
      (req) => {
        order.push(req.method);
        return scripted([{ status: "Running", dateUpdated: at(1) }])(req);
      },
      {
        webSocket: (url, init) => {
          order.push("socket");
          return factory(url, init);
        },
      },
    );
    const tokens: string[] = [];
    const promise = mt.interactions.run("hello", undefined, { onToken: (t) => tokens.push(t) });
    await vi.advanceTimersByTimeAsync(0);
    expect(order.slice(0, 2)).toEqual(["socket", "PUT"]);

    const socket = sockets[0]!;
    socket.receive({
      name: "interaction-process-stream",
      id: 1,
      message: { stream: "Once ", sequence: 0, associatedId: RUN_ID, agentName: "Storyteller", date: at(1), type: "Chat" },
    });
    socket.receive({
      name: "interaction-process-updated",
      id: 2,
      message: interactionRun({ status: "Finished", dateUpdated: at(2), output: "Once upon a time" }),
    });
    const run = await promise;
    expect(run.output).toBe("Once upon a time");
    expect(tokens).toEqual(["Once "]);
    expect(sockets).toHaveLength(1);
    expect(socket.readyState).toBe(3);
    expect(mt.events.active()).toBeUndefined();
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  it("with onToken and a stream already open: uses it, and leaves it open", async () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeSockets();
    const { mt } = testClient(scripted([{ status: "Finished", dateUpdated: at(1) }]), { webSocket: factory });
    const events = await mt.events.connect();
    await expect(mt.interactions.run("hello", undefined, { onToken: () => undefined })).resolves.toMatchObject({ status: "Finished" });
    expect(sockets).toHaveLength(1);
    expect(events.isOpen).toBe(true);
    await events.close();
  });

  it("without onToken: opens no stream", async () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeSockets();
    const { mt } = testClient(scripted([{ status: "Finished", dateUpdated: at(1) }]), { webSocket: factory });
    const promise = mt.interactions.run("hello");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ status: "Finished" });
    expect(sockets).toHaveLength(0);
  });

  it("with onToken when no stream can be opened: warns, and follows the run by polling", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { factory } = fakeSockets(() => "fail");
    const { mt } = testClient(scripted([{ status: "Finished", dateUpdated: at(1) }]), { webSocket: factory });
    const promise = mt.interactions.run("hello", undefined, { onToken: () => undefined });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ status: "Finished" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("onToken will receive nothing"));
    warn.mockRestore();
  });

  it("re-reads the run after a reconnect (at-most-once delivery)", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { factory, sockets } = fakeSockets();
    const states = [
      { status: "Running", dateUpdated: at(1) },
      { status: "Finished", dateUpdated: at(9), output: "done while we were away" },
    ];
    const { mt, calls } = testClient(scripted(states), { webSocket: factory });
    const events = await mt.events.connect();
    const promise = mt.interactions.run("hello");
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
    sockets[0]!.drop();
    await vi.advanceTimersByTimeAsync(1000);
    const run = await promise;
    expect(run.output).toBe("done while we were away");
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
    vi.mocked(Math.random).mockRestore();
    await events.close();
  });

  it("tenant scope: re-reads the run on each process-updated summary for it", async () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeSockets();
    const { mt, calls } = testClient(
      scripted([
        { status: "Running", dateUpdated: at(1) },
        { status: "Finished", dateUpdated: at(2) },
      ]),
      { webSocket: factory },
    );
    const events = await mt.events.connect({ scope: "tenant" });
    const promise = mt.interactions.run("hello");
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.receive({
      name: "process-updated",
      id: 1,
      message: { schemaVersion: 1, type: "Interaction", id: RUN_ID, status: "Finished", state: "Terminal", dateUpdated: at(2) },
    });
    await expect(promise).resolves.toMatchObject({ status: "Finished" });
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
    await events.close();
  });

  it("still re-reads every 15 s in case an event was lost", async () => {
    vi.useFakeTimers();
    const { factory } = fakeSockets();
    const { mt, calls } = testClient(
      scripted([
        { status: "Running", dateUpdated: at(1) },
        { status: "Finished", dateUpdated: at(2) },
      ]),
      { webSocket: factory },
    );
    const events = await mt.events.connect();
    const promise = mt.interactions.run("hello");
    await vi.advanceTimersByTimeAsync(14_000);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ status: "Finished" });
    await events.close();
  });
});

describe("transcript()", () => {
  it("merges every context array, sorted by sequence and tagged with its kind", () => {
    const entries = transcript({
      context: {
        agentMessage: [
          { sequence: 3, message: "Hello!" },
          { sequence: 1, message: "Thinking" },
        ],
        humanMessage: [{ sequence: 0, message: "Hi" }],
        toolCall: [{ sequence: 2, functionName: "getWeather" }],
        aFutureKind: [{ sequence: 4, text: "new" }],
      },
    } as never);
    expect(entries.map((e) => `${e.sequence}:${e.kind}`)).toEqual([
      "0:humanMessage",
      "1:agentMessage",
      "2:toolCall",
      "3:agentMessage",
      "4:aFutureKind",
    ]);
  });
});
