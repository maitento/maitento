import { afterEach, describe, expect, it, vi } from "vitest";
import { AbortError, CapsuleCommandAbortedError, NotFoundError, TimeoutError } from "../src/index.js";
import { fakeSockets } from "./fake-socket.js";
import { json, testClient, type Recorded } from "./helpers.js";

afterEach(() => {
  vi.useRealTimers();
});

const RUN_ID = "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f";
const COMMAND_ID = "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70";
const COMMANDS = `/capsule-processes/by-id/${RUN_ID}/commands`;
const ONE_COMMAND = `${COMMANDS}/${COMMAND_ID}`;

function command(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: COMMAND_ID,
    operationType: "Command",
    command: "python3",
    arguments: ["--version"],
    runAsUser: null,
    maximumDuration: null,
    status: "Pending",
    outputStandard: null,
    outputError: null,
    exitCode: null,
    failureDetails: null,
    isAsync: false,
    dateQueued: "2026-10-27T10:00:00Z",
    dateStarted: null,
    dateEnded: null,
    ...overrides,
  };
}

function capsuleRun(status: string, commandState: Record<string, unknown>): Record<string, unknown> {
  return {
    id: RUN_ID,
    status,
    dateCreated: "2026-10-27T10:00:00Z",
    dateUpdated: "2026-10-27T10:00:05Z",
    failureDetails: null,
    commands: [command(commandState)],
  };
}

/** A server that queues the command, then answers each read of it with the next state in `states`. */
function scripted(states: Array<Record<string, unknown>>): (req: Recorded) => Response {
  let reads = 0;
  return (req) => {
    if (req.method === "POST" && req.path === COMMANDS) return json(command());
    if (req.method === "GET" && req.path === ONE_COMMAND) {
      const state = states[Math.min(reads, states.length - 1)] ?? {};
      reads++;
      return json(command(state));
    }
    return json({ message: "no route" }, 404);
  };
}

describe("capsuleRuns.execAndWait: polling (no event stream)", () => {
  it("queues once, polls the one command from 0.25 s, and resolves with its exit code and output", async () => {
    vi.useFakeTimers();
    const { mt, calls } = testClient(
      scripted([
        { status: "Pending" },
        { status: "Running" },
        { status: "Finished", exitCode: 0, outputStandard: "Python 3.11.2\n", dateEnded: "2026-10-27T10:00:02Z" },
      ]),
    );
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "python3", arguments: ["--version"] });
    await vi.advanceTimersByTimeAsync(250);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`POST ${COMMANDS}`, `GET ${ONE_COMMAND}`]);
    expect(calls[0]?.body).toEqual({ command: "python3", arguments: ["--version"] });
    await vi.advanceTimersByTimeAsync(375);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(563);
    const result = await promise;
    expect(result.status).toBe("Finished");
    expect(result.exitCode).toBe(0);
    expect(result.outputStandard).toBe("Python 3.11.2\n");
    expect(result.dateEnded).toBeInstanceOf(Date);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(calls.some((c) => c.path === `/capsule-processes/by-id/${RUN_ID}`)).toBe(false);
  });

  it("stops growing the interval at 2 s", async () => {
    vi.useFakeTimers();
    const { mt, calls } = testClient(scripted([{ status: "Running" }]));
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "sleep", arguments: ["60"] }).catch((e: unknown) => e);
    // 250 + 375 + 563 + 845 + 1268 + 1902 = 5203 ms for six reads; every read after that is 2 s apart.
    await vi.advanceTimersByTimeAsync(5203);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(7);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(8);
    void promise;
  });

  it("returns a command that exited non-zero: an exit code is a result, not an error", async () => {
    vi.useFakeTimers();
    const { mt } = testClient(
      scripted([{ status: "Error", exitCode: 127, outputError: "-bash: line 1: sqlite3: command not found\n" }]),
    );
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "sqlite3", arguments: [":memory:"] });
    await vi.advanceTimersByTimeAsync(250);
    const result = await promise;
    expect(result.status).toBe("Error");
    expect(result.exitCode).toBe(127);
    expect(result.outputError).toContain("command not found");
  });

  it("rejects with CapsuleCommandAbortedError when the capsule ended first, as every SDK words it", async () => {
    vi.useFakeTimers();
    const { mt } = testClient(
      scripted([
        { status: "AbortedOnTermination", failureDetails: "The capsule run ended (Killed) before the command finished" },
      ]),
    );
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "python3" }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(250);
    const error = (await promise) as CapsuleCommandAbortedError<{ id: string; status: string }>;
    expect(error).toBeInstanceOf(CapsuleCommandAbortedError);
    expect(error.message).toBe(
      `Capsule command ${COMMAND_ID} ended AbortedOnTermination: The capsule run ended (Killed) before the command finished`,
    );
    expect(error.runId).toBe(RUN_ID);
    expect(error.command.status).toBe("AbortedOnTermination");
  });

  it("a timeout rejects with TimeoutError and leaves the command alone", async () => {
    vi.useFakeTimers();
    const { mt, calls } = testClient(scripted([{ status: "Running" }]));
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "sleep" }, { timeout: 3000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(3000);
    const error = await promise;
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as Error).message).toBe(`Capsule command ${COMMAND_ID} did not finish within 3s.`);
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(1);
  });

  it("an abort rejects with AbortError", async () => {
    vi.useFakeTimers();
    const { mt } = testClient(scripted([{ status: "Running" }]));
    const controller = new AbortController();
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "sleep" }, { signal: controller.signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(700);
    controller.abort();
    expect(await promise).toBeInstanceOf(AbortError);
  });

  it("a command that disappears is a NotFoundError", async () => {
    vi.useFakeTimers();
    const { mt } = testClient((req) => (req.method === "POST" ? json(command()) : json({ message: "gone" }, 404)));
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "ls" }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(250);
    expect(await promise).toBeInstanceOf(NotFoundError);
  });
});

describe("capsuleRuns.execAndWait: over an open event stream", () => {
  it("resolves from the capsule-process-updated event, after one read in case it had already ended", async () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeSockets();
    const { mt, calls } = testClient(scripted([{ status: "Running" }]), { webSocket: factory });
    const events = await mt.events.connect();
    const socket = sockets[0]!;
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "python3", arguments: ["--version"] });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET"]);

    // An event for an unfinished command, and one for another run, change nothing.
    socket.receive({ name: "capsule-process-updated", id: 1, message: capsuleRun("Running", { status: "Running" }) });
    socket.receive({
      name: "capsule-process-updated",
      id: 2,
      message: { ...capsuleRun("Running", { status: "Finished" }), id: "ffffffff-0000-4000-8000-000000000000" },
    });
    await vi.advanceTimersByTimeAsync(5000);
    socket.receive({
      name: "capsule-process-updated",
      id: 3,
      message: capsuleRun("Running", { status: "Finished", exitCode: 0, outputStandard: "Python 3.11.2\n" }),
    });
    const result = await promise;
    expect(result.outputStandard).toBe("Python 3.11.2\n");
    expect(calls).toHaveLength(2);
    await events.close();
  });

  it("rejects when an event shows the capsule ended with the command unfinished", async () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeSockets();
    const { mt } = testClient(scripted([{ status: "Running" }]), { webSocket: factory });
    const events = await mt.events.connect();
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "sleep" }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.receive({ name: "capsule-process-updated", id: 1, message: capsuleRun("Error", { status: "Running" }) });
    const error = (await promise) as CapsuleCommandAbortedError;
    expect(error).toBeInstanceOf(CapsuleCommandAbortedError);
    expect(error.message).toContain("ended (Error) before the command finished");
    await events.close();
  });

  it("re-reads the command every 15 s in case an event was lost", async () => {
    vi.useFakeTimers();
    const { factory } = fakeSockets();
    const { mt, calls } = testClient(scripted([{ status: "Running" }, { status: "Finished", exitCode: 0 }]), {
      webSocket: factory,
    });
    const events = await mt.events.connect();
    const promise = mt.capsuleRuns.execAndWait(RUN_ID, { command: "ls" });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toMatchObject({ status: "Finished" });
    await events.close();
  });
});
