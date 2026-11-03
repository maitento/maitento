import type { WebSocketFactory, WebSocketLike } from "../src/index.js";

/** A scriptable WebSocket: the test opens, feeds, drops or fails it. */
export class FakeSocket implements WebSocketLike {
  readyState = 0;
  readonly sent: string[] = [];
  closedWith: number | undefined;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(
    readonly url: string,
    readonly init: { headers?: Record<string, string> },
  ) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  /** Delivers one frame (an object is sent as the server builds it: JSON text). */
  receive(frame: unknown): void {
    this.onmessage?.({ data: typeof frame === "string" ? frame : JSON.stringify(frame) });
  }

  /** The connection is lost (server restart, network). */
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  /** The connection attempt fails before opening. */
  fail(): void {
    this.readyState = 3;
    this.onerror?.({});
    this.onclose?.({ code: 1006 });
  }
}

/**
 * A factory that records each socket and, by default, opens it on the next microtask. `behaviour` decides per
 * attempt (0-based): "open" (default) or "fail".
 */
export function fakeSockets(behaviour: (attempt: number) => "open" | "fail" | "manual" = () => "open"): {
  factory: WebSocketFactory;
  sockets: FakeSocket[];
} {
  const sockets: FakeSocket[] = [];
  const factory: WebSocketFactory = (url, init) => {
    const socket = new FakeSocket(url, init);
    const attempt = sockets.length;
    sockets.push(socket);
    const mode = behaviour(attempt);
    queueMicrotask(() => {
      if (mode === "open") socket.open();
      else if (mode === "fail") socket.fail();
    });
    return socket;
  };
  return { factory, sockets };
}
