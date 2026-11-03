import type { AuthProvider } from "./core/auth.js";
import { decode } from "./core/codec.js";
import { isServerRuntime } from "./core/env.js";
import { AbortError, ConnectionError, MaitentoError } from "./core/errors.js";
import { EVENT_PAYLOAD_TYPES } from "./codec-table.js";
import type { NotificationEventName, NotificationEventPayloads } from "./models.js";

/** The parts of a WebSocket the SDK uses: the browser / undici / `ws` objects all fit. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** Opens a WebSocket to `url`, sending `init.headers` with the upgrade request where the implementation can. */
export type WebSocketFactory = (url: string, init: { headers?: Record<string, string> }) => WebSocketLike;

/**
 * A WebSocket implementation for the `webSocket` client option: a factory, or a class constructed as
 * `new Impl(url, { headers })` — which is how the `ws` package's `WebSocket` takes headers.
 */
export type WebSocketImplementation =
  | WebSocketFactory
  | (new (url: string, init: { headers: Record<string, string> }) => unknown);

/** `user`: your own runs, in full. `tenant`: every run of the tenant, as `process-updated` summaries. */
export type EventScope = "user" | "tenant";

/** One event as it arrives: its name and its (converted) payload. */
export type EventFrame<K extends NotificationEventName = NotificationEventName> = K extends NotificationEventName
  ? { name: K; message: NotificationEventPayloads[K] }
  : never;

/** Narrows `on()` to one entity: a run id, or a file id for `ingested-file-updated`. */
export interface EventFilter {
  id?: string;
}

/** Events the stream raises about itself. */
export type ConnectionEventName = "reconnected" | "disconnected";

type FrameHandler = (message: unknown, frame: EventFrame) => void;

interface Listener {
  handler: FrameHandler | (() => void);
  id: string | undefined;
}

/** The server drops a client it has not heard from in 30 s, so the SDK speaks every 15 s. */
export const PING_INTERVAL_MS = 15_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const CLOSE_NORMAL = 1000;

/** The delay before reconnect attempt `attempt` (1-based): 1 s doubling to 30 s, ±20% jitter. */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

/** The entity an event is about: the run (or file) id; for a stream delta, the run it belongs to. */
export function entityIdOf(name: string, message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const record = message as Record<string, unknown>;
  const id = name === "interaction-process-stream" ? record.associatedId : record.id;
  return typeof id === "string" ? id : undefined;
}

export interface EventStreamConfig {
  baseUrl: string;
  scope: EventScope;
  auth: AuthProvider | undefined;
  webSocket: WebSocketImplementation | undefined;
  /** For tests. */
  random?: () => number;
  pingIntervalMs?: number;
  onClose?: (stream: EventStream) => void;
}

class FrameQueue implements AsyncIterableIterator<EventFrame> {
  private readonly buffer: EventFrame[] = [];
  private waiting: ((result: IteratorResult<EventFrame>) => void) | undefined;
  private ended = false;

  constructor(
    readonly name: string | undefined,
    readonly id: string | undefined,
    private readonly detach: (queue: FrameQueue) => void,
  ) {}

  push(frame: EventFrame): void {
    if (this.ended) return;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve({ value: frame, done: false });
    } else {
      this.buffer.push(frame);
    }
  }

  end(): void {
    this.ended = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve({ value: undefined, done: true });
    }
  }

  next(): Promise<IteratorResult<EventFrame>> {
    const frame = this.buffer.shift();
    if (frame) return Promise.resolve({ value: frame, done: false });
    if (this.ended) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  return(): Promise<IteratorResult<EventFrame>> {
    this.end();
    this.detach(this);
    return Promise.resolve({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<EventFrame> {
    return this;
  }
}

/**
 * A live connection to `/notifications`. There is no subscribe protocol: the server pushes every event routed to
 * this connection and the stream filters by event name and entity id. Delivery is at-most-once, so after a
 * reconnect (`reconnected`) re-read whatever you show.
 *
 * ```ts
 * const events = await mt.events.connect();
 * events.on("interaction-process-stream", (e) => process.stdout.write(e.stream), { id: runId });
 * events.on("reconnected", () => resync());
 * for await (const e of events) { … }
 * await events.close();
 * ```
 */
export class EventStream implements AsyncIterable<EventFrame> {
  readonly scope: EventScope;
  private readonly config: EventStreamConfig;
  private socket: WebSocketLike | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly queues = new Set<FrameQueue>();
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private closed = false;

  constructor(config: EventStreamConfig) {
    this.config = config;
    this.scope = config.scope;
  }

  /** Whether the socket is open right now (false while reconnecting and after `close()`). */
  get isOpen(): boolean {
    return !this.closed && this.socket !== undefined && this.socket.readyState === 1;
  }

  /** Opens the socket; resolves once it is open. Called by `mt.events.connect()`. */
  async open(signal?: AbortSignal): Promise<this> {
    const socket = await this.connectOnce(signal);
    this.attach(socket);
    return this;
  }

  /**
   * Calls `handler` for each event of this name (for `{ id }`, only those about that run or file). Returns a
   * function that removes the handler.
   */
  on<K extends NotificationEventName>(
    name: K,
    handler: (message: NotificationEventPayloads[K], frame: EventFrame<K>) => void,
    filter?: EventFilter,
  ): () => void;
  on(name: ConnectionEventName, handler: () => void): () => void;
  on(name: string, handler: FrameHandler | (() => void), filter?: EventFilter): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    const listener: Listener = { handler, id: filter?.id };
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /** Iterates the events of one name (and entity), until the stream closes or the loop exits. */
  iterate<K extends NotificationEventName>(name?: K, filter?: EventFilter): AsyncIterableIterator<EventFrame<K>> {
    const queue = new FrameQueue(name, filter?.id, (q) => this.queues.delete(q));
    if (this.closed) {
      queue.end();
    } else {
      this.queues.add(queue);
    }
    return queue as unknown as AsyncIterableIterator<EventFrame<K>>;
  }

  /** Iterates every event except the `ping` keep-alives. */
  [Symbol.asyncIterator](): AsyncIterator<EventFrame> {
    return this.iterate();
  }

  /** Closes the socket for good: no reconnect follows, and every iterator ends. */
  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    this.stopPing();
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;
      try {
        socket.close(CLOSE_NORMAL);
      } catch {
        // Already gone.
      }
    }
    for (const queue of this.queues) queue.end();
    this.queues.clear();
    this.config.onClose?.(this);
    return Promise.resolve();
  }

  private async connectOnce(signal?: AbortSignal): Promise<WebSocketLike> {
    const { url, headers } = await this.target();
    if (signal?.aborted) throw new AbortError("The connection was aborted.");
    const factory = resolveFactory(this.config.webSocket);
    return new Promise<WebSocketLike>((resolve, reject) => {
      let settled = false;
      let socket: WebSocketLike;
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        try {
          socket.close();
        } catch {
          // Never opened.
        }
        reject(error);
      };
      const onAbort = (): void => fail(new AbortError("The connection was aborted."));
      try {
        socket = factory(url, headers ? { headers } : {});
      } catch (cause) {
        // Never rethrow the original: its message can contain the URL, and the URL can carry a token.
        reject(new ConnectionError("Could not open the event socket.", { cause: sanitize(cause) }));
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.onopen = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        resolve(socket);
      };
      socket.onclose = (event) =>
        fail(
          new ConnectionError(
            `The event socket closed before it opened (code ${event?.code ?? "unknown"}). ` +
              "Check the credential and that the API is reachable.",
          ),
        );
      socket.onerror = () => fail(new ConnectionError("The event socket could not connect."));
    });
  }

  /** The URL (and headers) for a fresh connection, with a fresh credential every time. */
  private target(): Promise<{ url: string; headers: Record<string, string> | undefined }> {
    return socketTarget(this.config, this.scope, isServerRuntime() || this.config.webSocket !== undefined);
  }

  private attach(socket: WebSocketLike): void {
    this.socket = socket;
    socket.onmessage = (event) => this.receive(event.data);
    socket.onerror = () => {
      // The close that follows does the work.
    };
    socket.onclose = () => this.lost(socket);
    this.startPing();
  }

  private lost(socket: WebSocketLike): void {
    if (this.socket !== socket || this.closed) return;
    this.socket = undefined;
    this.stopPing();
    this.emitConnection("disconnected");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.attempts++;
    const delay = reconnectDelay(this.attempts, this.config.random);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.closed) return;
      this.connectOnce().then(
        (socket) => {
          if (this.closed) {
            try {
              socket.close(CLOSE_NORMAL);
            } catch {
              // ignore
            }
            return;
          }
          this.attempts = 0;
          this.attach(socket);
          this.emitConnection("reconnected");
        },
        () => this.scheduleReconnect(),
      );
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      try {
        if (this.socket?.readyState === 1) this.socket.send("ping");
      } catch {
        // The close handler deals with a dead socket.
      }
    }, this.config.pingIntervalMs ?? PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== undefined) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  private receive(data: unknown): void {
    const text = toText(data);
    if (text === undefined || text === "ping" || text === "pong") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null) return;
    const { name, message } = parsed as { name?: unknown; message?: unknown };
    if (typeof name !== "string") return;
    const payloadType = EVENT_PAYLOAD_TYPES[name];
    const payload = payloadType ? decode(payloadType, message) : (message ?? {});
    const frame = { name, message: payload } as EventFrame;
    const id = entityIdOf(name, payload);

    const listeners = this.listeners.get(name);
    if (listeners) {
      for (const listener of [...listeners]) {
        if (listener.id !== undefined && listener.id !== id) continue;
        try {
          (listener.handler as FrameHandler)(payload, frame);
        } catch {
          // A failing handler must not break the stream or the other handlers.
        }
      }
    }
    if (name === "ping") return;
    for (const queue of this.queues) {
      if (queue.name !== undefined && queue.name !== name) continue;
      if (queue.id !== undefined && queue.id !== id) continue;
      queue.push(frame);
    }
  }

  private emitConnection(name: ConnectionEventName): void {
    const listeners = this.listeners.get(name);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      try {
        (listener.handler as () => void)();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * The `/notifications` URL and headers. With headers (server runtimes, or an injected WebSocket) the credential goes
 * in `Authorization`; a browser WebSocket cannot carry headers, so a JWT rides in `?authorization=` (an API key
 * cannot: the server accepts only a JWT there). Never log the returned URL.
 */
export async function socketTarget(
  config: Pick<EventStreamConfig, "baseUrl" | "auth">,
  scope: EventScope,
  useHeaders: boolean,
): Promise<{ url: string; headers: Record<string, string> | undefined }> {
  const base = config.baseUrl.replace(/\/+$/, "").replace(/^http/i, "ws");
  const url = `${base}/notifications?scope=${scope}`;
  const auth = config.auth;
  if (!auth) {
    throw new MaitentoError("The event socket needs a credential.");
  }
  if (useHeaders) {
    return { url, headers: { Authorization: await auth.authorization() } };
  }
  const jwt = await auth.jwt();
  return { url: `${url}&authorization=${encodeURIComponent(jwt)}`, headers: undefined };
}

function toText(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  if (Array.isArray(data) && data.every((d) => ArrayBuffer.isView(d))) {
    return data.map((d: ArrayBufferView) => new TextDecoder().decode(d)).join("");
  }
  return undefined;
}

function sanitize(cause: unknown): unknown {
  return cause instanceof Error ? new Error(cause.name) : undefined;
}

function resolveFactory(implementation: WebSocketImplementation | undefined): WebSocketFactory {
  if (implementation) {
    const candidate = implementation as { prototype?: { send?: unknown } };
    if (typeof candidate.prototype?.send === "function") {
      const Ctor = implementation as new (url: string, init: { headers?: Record<string, string> }) => WebSocketLike;
      return (url, init) => new Ctor(url, init);
    }
    return implementation as WebSocketFactory;
  }
  const Global = (globalThis as { WebSocket?: unknown }).WebSocket as
    | (new (url: string, init?: unknown) => WebSocketLike)
    | undefined;
  if (!Global) {
    throw new MaitentoError(
      "No WebSocket implementation is available (Node 20 has none built in). Install the `ws` package and pass it: " +
        'new Maitento({ webSocket: WebSocket }) with `import WebSocket from "ws"`.',
    );
  }
  // Node 22+ (undici), Bun and Deno take `{ headers }` as the second argument; a browser gets no headers.
  return (url, init) => (init.headers ? new Global(url, { headers: init.headers }) : new Global(url));
}

/** Opens event streams for a client and remembers the open ones, which the `run()` helpers follow. */
export class Events {
  private readonly streams = new Set<EventStream>();

  constructor(
    private readonly config: Omit<EventStreamConfig, "scope" | "onClose">,
  ) {}

  /**
   * Opens `/notifications`. On a server runtime the credential goes in the `Authorization` header; in a browser the
   * client must hold a JWT (`token`, or `email`/`password`), which is sent as `?authorization=`.
   */
  async connect(options?: { scope?: EventScope; signal?: AbortSignal }): Promise<EventStream> {
    const stream = new EventStream({
      ...this.config,
      scope: options?.scope ?? "user",
      onClose: (s) => this.streams.delete(s),
    });
    await stream.open(options?.signal);
    this.streams.add(stream);
    return stream;
  }

  /** The most recently opened stream that is open right now (user scope preferred), if any. */
  active(): EventStream | undefined {
    let fallback: EventStream | undefined;
    for (const stream of [...this.streams].reverse()) {
      if (!stream.isOpen) continue;
      if (stream.scope === "user") return stream;
      fallback ??= stream;
    }
    return fallback;
  }

  /** Closes every stream this client opened. */
  async closeAll(): Promise<void> {
    await Promise.all([...this.streams].map((s) => s.close()));
  }
}
