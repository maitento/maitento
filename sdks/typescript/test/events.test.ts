import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionError, EventStream, PING_INTERVAL_MS, reconnectDelay } from "../src/index.js";
import { ApiKeyAuth, JwtAuth } from "../src/core/auth.js";
import { socketTarget } from "../src/events.js";
import { FakeSocket, fakeSockets } from "./fake-socket.js";
import { SECRET, USER_ID, interactionRun, json, jwt, testClient } from "./helpers.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const RUN_ID = "e4c2a1b3-9d8f-4e7a-b6c5-d4e3f2a1b0c9";
const OTHER_RUN = "aaaaaaaa-9d8f-4e7a-b6c5-d4e3f2a1b0c9";

function streamFrame(associatedId: string, stream: string, type = "Chat"): unknown {
  return {
    name: "interaction-process-stream",
    id: 123,
    message: { stream, sequence: 0, associatedId, agentName: "Greeter", date: "2026-10-26T10:00:00Z", type },
  };
}

async function connected(options: { scope?: "user" | "tenant"; behaviour?: (attempt: number) => "open" | "fail" | "manual" } = {}) {
  const sockets = fakeSockets(options.behaviour);
  const { mt } = testClient(() => json([]), { webSocket: sockets.factory });
  const events = await mt.events.connect({ scope: options.scope ?? "user" });
  return { mt, events, sockets: sockets.sockets };
}

describe("connecting", () => {
  it("opens /notifications over wss with the credential in the Authorization header", async () => {
    const { events, sockets } = await connected();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe("wss://api.test/notifications?scope=user");
    expect(sockets[0]?.init.headers).toEqual({ Authorization: `ApiKey ${USER_ID} ${SECRET}` });
    expect(events.isOpen).toBe(true);
    await events.close();
  });

  it("asks for tenant scope", async () => {
    const { events, sockets } = await connected({ scope: "tenant" });
    expect(sockets[0]?.url).toBe("wss://api.test/notifications?scope=tenant");
    expect(events.scope).toBe("tenant");
    await events.close();
  });

  it("rejects with ConnectionError when the first connection fails, and does not retry it", async () => {
    vi.useFakeTimers();
    const sockets = fakeSockets(() => "fail");
    const { mt } = testClient(() => json([]), { webSocket: sockets.factory });
    await expect(mt.events.connect()).rejects.toBeInstanceOf(ConnectionError);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets.sockets).toHaveLength(1);
  });

  it("in a browser, a JWT rides in ?authorization= and an API key is refused with a clear error", async () => {
    const token = jwt({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
    const jwtAuth = new JwtAuth({ type: "static", token }, { login: vi.fn(), renew: vi.fn() });
    const target = await socketTarget({ baseUrl: "https://api.maitento.com/", auth: jwtAuth }, "user", false);
    expect(target.url).toBe(`wss://api.maitento.com/notifications?scope=user&authorization=${encodeURIComponent(token)}`);
    expect(target.headers).toBeUndefined();
    jwtAuth.close();

    const keyAuth = new ApiKeyAuth({ userId: USER_ID, secret: SECRET });
    await expect(socketTarget({ baseUrl: "https://api.maitento.com", auth: keyAuth }, "user", false)).rejects.toThrow(
      /can only carry a JWT/,
    );
    const local = await socketTarget({ baseUrl: "http://127.0.0.1:4201", auth: keyAuth }, "tenant", true);
    expect(local.url).toBe("ws://127.0.0.1:4201/notifications?scope=tenant");
  });

  it("explains how to use `ws` when there is no WebSocket (Node 20)", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const { mt } = testClient(() => json([]));
    await expect(mt.events.connect()).rejects.toThrow(/Install the `ws` package/);
  });

  it("constructs a `ws`-style class as new Impl(url, { headers })", async () => {
    const constructed: Array<{ url: string; init: unknown }> = [];
    class WsLike extends FakeSocket {
      constructor(url: string, init: { headers?: Record<string, string> }) {
        super(url, init);
        constructed.push({ url, init });
        queueMicrotask(() => this.open());
      }
    }
    const { mt } = testClient(() => json([]), { webSocket: WsLike });
    const events = await mt.events.connect();
    expect(constructed).toEqual([
      { url: "wss://api.test/notifications?scope=user", init: { headers: { Authorization: `ApiKey ${USER_ID} ${SECRET}` } } },
    ]);
    await events.close();
  });
});

describe("liveness", () => {
  it("sends ping every 15 seconds", async () => {
    vi.useFakeTimers();
    const { events, sockets } = await connected();
    expect(sockets[0]?.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    expect(sockets[0]?.sent).toEqual(["ping"]);
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    expect(sockets[0]?.sent).toEqual(["ping", "ping"]);
    await events.close();
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 3);
    expect(sockets[0]?.sent).toHaveLength(2);
  });
});

describe("filtering and delivery", () => {
  it("calls handlers by event name and entity id, with the payload converted", async () => {
    const { events, sockets } = await connected();
    const socket = sockets[0]!;
    const mine: string[] = [];
    const all: string[] = [];
    const updates: unknown[] = [];
    events.on("interaction-process-stream", (e) => mine.push(e.stream), { id: RUN_ID });
    events.on("interaction-process-stream", (e) => all.push(e.stream));
    const off = events.on("interaction-process-updated", (run) => updates.push(run), { id: RUN_ID });

    socket.receive(streamFrame(RUN_ID, "Hel"));
    socket.receive(streamFrame(OTHER_RUN, "other"));
    socket.receive(streamFrame(RUN_ID, "lo"));
    socket.receive({ name: "interaction-process-updated", id: 1, message: interactionRun({ status: "Running" }) });
    socket.receive({ name: "interaction-process-updated", id: 2, message: interactionRun({ id: OTHER_RUN }) });
    off();
    socket.receive({ name: "interaction-process-updated", id: 3, message: interactionRun({ status: "Finished" }) });

    expect(mine).toEqual(["Hel", "lo"]);
    expect(all).toEqual(["Hel", "other", "lo"]);
    expect(updates).toHaveLength(1);
    const run = updates[0] as { status: string; dateCreated: Date; executionTime: number };
    expect(run.status).toBe("Running");
    expect(run.dateCreated).toBeInstanceOf(Date);
    expect(run.executionTime).toBe(0);
    await events.close();
  });

  it("ignores noise: raw ping text, broken JSON, frames without a name; a throwing handler does not stop others", async () => {
    const { events, sockets } = await connected();
    const seen: string[] = [];
    events.on("setup", () => {
      throw new Error("handler bug");
    });
    events.on("setup", () => seen.push("setup"));
    sockets[0]!.receive("ping");
    sockets[0]!.receive("{not json");
    sockets[0]!.receive({ id: 1, message: {} });
    sockets[0]!.receive({ name: "setup", id: 1, message: {} });
    expect(seen).toEqual(["setup"]);
    await events.close();
  });

  it("is async-iterable (without the ping keep-alives) and iterate() narrows by name and id", async () => {
    const { events, sockets } = await connected();
    const socket = sockets[0]!;
    const everything = events[Symbol.asyncIterator]();
    const tokens = events.iterate("interaction-process-stream", { id: RUN_ID });
    socket.receive({ name: "setup", id: 1, message: {} });
    socket.receive({ name: "ping", id: 2, message: {} });
    socket.receive(streamFrame(OTHER_RUN, "x"));
    socket.receive(streamFrame(RUN_ID, "y"));

    expect((await everything.next()).value).toEqual({ name: "setup", message: {} });
    expect(((await everything.next()).value as { name: string }).name).toBe("interaction-process-stream");
    const first = await tokens.next();
    expect((first.value as { message: { stream: string } }).message.stream).toBe("y");

    const pending = tokens.next();
    await events.close();
    expect((await pending).done).toBe(true);
  });

  it("for await ends when the stream closes", async () => {
    const { events, sockets } = await connected();
    const names: string[] = [];
    const loop = (async () => {
      for await (const e of events) names.push(e.name);
    })();
    sockets[0]!.receive({ name: "setup", id: 1, message: {} });
    await Promise.resolve();
    await events.close();
    await loop;
    expect(names).toEqual(["setup"]);
  });
});

describe("reconnecting", () => {
  it("backs off from 1 s to 30 s with ±20% jitter", () => {
    expect(reconnectDelay(1, () => 0.5)).toBe(1000);
    expect(reconnectDelay(2, () => 0.5)).toBe(2000);
    expect(reconnectDelay(6, () => 0.5)).toBe(30_000);
    expect(reconnectDelay(20, () => 0.5)).toBe(30_000);
    expect(reconnectDelay(1, () => 0)).toBe(800);
    expect(reconnectDelay(1, () => 1)).toBe(1200);
    expect(reconnectDelay(10, () => 1)).toBe(36_000);
  });

  it("reconnects after a drop with a fresh credential, then emits reconnected", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { events, sockets } = await connected({ behaviour: (n) => (n === 1 ? "fail" : "open") });
    const log: string[] = [];
    events.on("disconnected", () => log.push("disconnected"));
    events.on("reconnected", () => log.push("reconnected"));

    sockets[0]!.drop();
    expect(log).toEqual(["disconnected"]);
    expect(events.isOpen).toBe(false);

    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    // Attempt 1 fails; attempt 2 comes 2 s later and opens.
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
    expect(log).toEqual(["disconnected", "reconnected"]);
    expect(events.isOpen).toBe(true);
    expect(sockets[2]?.init.headers).toEqual({ Authorization: `ApiKey ${USER_ID} ${SECRET}` });

    // Handlers registered before the drop keep working on the new socket.
    const streamed: string[] = [];
    events.on("interaction-process-stream", (e) => streamed.push(e.stream));
    sockets[2]!.receive(streamFrame(RUN_ID, "again"));
    expect(streamed).toEqual(["again"]);
    // And the new socket is pinged.
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    expect(sockets[2]?.sent).toEqual(["ping"]);
    random.mockRestore();
    await events.close();
  });

  it("close() stops reconnecting and closes the socket normally", async () => {
    vi.useFakeTimers();
    const { events, sockets } = await connected();
    sockets[0]!.drop();
    await events.close();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sockets).toHaveLength(1);

    const second = await connected();
    await second.events.close();
    expect(second.sockets[0]?.closedWith).toBe(1000);
  });

  it("the client forgets closed streams; mt.close() closes the open ones", async () => {
    const { mt, events } = await connected();
    expect(mt.events.active()).toBe(events);
    await mt.close();
    expect(events.isOpen).toBe(false);
    expect(mt.events.active()).toBeUndefined();
  });

  it("EventStream is exported for typing", () => {
    expect(typeof EventStream).toBe("function");
  });
});
