import { AbortError, MaitentoError, ProcessFailedError, TimeoutError, describeRun, describeSeconds } from "./core/errors.js";
import type { Events, EventStream } from "./events.js";
import type { NotificationEventName } from "./models.js";

/** What every followed run has. */
export interface FollowableRun {
  id: string;
  status: string;
  dateUpdated: Date | string;
}

/** Options of the `run()` helpers (`interactions.run`, `apps.run`, `capsules.run`, `pipelines.run`). */
export interface RunOptions<TRun> {
  /**
   * Each streamed chat delta of an interaction run, in order. The deltas come over the event stream: when none is open,
   * `run()` opens one before it starts the run and closes it when the run ends. One you opened yourself
   * (`mt.events.connect()`) is used as it is and stays open. A tenant-scope stream carries no deltas.
   */
  onToken?: (text: string, agentName: string) => void;
  /** Each new state of the run, starting with the one the start call returned. */
  onUpdate?: (run: TRun) => unknown;
  /**
   * The run needs a person (`HumanInteractionRequired`, `PendingApproval`): answer it, and the run goes on. Called once
   * each time the run starts waiting, and again for each new pending approval (a rejected tool call that the agent
   * redrafts asks again). It may be async; if it throws or rejects, `run()` rejects with that error.
   */
  onWaiting?: (run: TRun) => unknown;
  /** Stops following (an `AbortError`). The run keeps going unless `killOnAbort`. */
  signal?: AbortSignal;
  /** Milliseconds to follow before a `TimeoutError`. The run keeps going unless `killOnAbort`. No limit by default. */
  timeout?: number;
  /** `false` resolves with a run that ended `Error` or `Killed` instead of throwing `ProcessFailedError`. */
  throwOnFailure?: boolean;
  /** Kill the run when the signal aborts or the timeout passes. */
  killOnAbort?: boolean;
}

/** How to follow one kind of run. */
export interface ProcessKind<TRun extends FollowableRun> {
  /** The process type of `/processes/{type}/{id}/kill`. */
  readonly type: "Interaction" | "App" | "Capsule" | "CodePipeline";
  /** The user-scope event that announces a change. */
  readonly updatedEvent: NotificationEventName;
  /** Whether that event carries the whole run (otherwise a summary: the run is re-read). */
  readonly eventCarriesRun: boolean;
  /** Statuses in which the run waits for a person. */
  readonly waiting: ReadonlySet<string>;
  fetch(id: string, signal: AbortSignal): Promise<TRun>;
  failureDetails(run: TRun): string | null;
}

export interface FollowDependencies {
  events: Pick<Events, "active">;
  kill(type: ProcessKind<FollowableRun>["type"], id: string): Promise<void>;
  /** For tests. */
  now?: () => number;
}

const TERMINAL = new Set(["Finished", "Error", "Killed"]);
const FAILED = new Set(["Error", "Killed"]);
const FIRST_POLL_MS = 1000;
const MAX_POLL_MS = 5000;
/** With an open event stream, the run is still re-read this often in case an event was lost. */
const SAFETY_POLL_MS = 15_000;

/** Whether a status is terminal (`Finished`, `Error`, `Killed`). */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL.has(status);
}

function time(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/**
 * Follows a started run to a terminal state: over the open event stream when there is one (re-reading the run after
 * a reconnect, and every 15 s in case an event was lost), by polling `GET` otherwise (1 s, growing to 5 s).
 */
export async function follow<TRun extends FollowableRun>(
  deps: FollowDependencies,
  kind: ProcessKind<TRun>,
  started: TRun,
  options: RunOptions<TRun> = {},
): Promise<TRun> {
  const id = started.id;
  let current = started;
  let waitingNotified: string | undefined;

  // A callback that throws (or an async one that rejects) stops following: run() rejects with that same error rather
  // than leaving an unhandled rejection behind. The run itself is left alone.
  let callbackFailure: { error: unknown } | undefined;
  const failFromCallback = (error: unknown): void => {
    callbackFailure ??= { error };
    controller.abort(error);
  };
  const callback = (fn: ((run: TRun) => unknown) | undefined, run: TRun): void => {
    try {
      const result = fn?.(run);
      if (result && typeof (result as PromiseLike<unknown>).then === "function")
        Promise.resolve(result).catch(failFromCallback);
    } catch (error) {
      failFromCallback(error);
    }
  };
  const notify = (run: TRun): void => {
    callback(options.onUpdate, run);
    if (kind.waiting.has(run.status)) {
      // One wait is one status and one pending approval: a rejected call that the agent redrafts is a new approval, and
      // the update in between can be missed, so the status alone would not call onWaiting for it.
      const approval = (run as { pendingApproval?: { id?: string } | null }).pendingApproval;
      const waitingKey = `${run.status}:${approval?.id ?? ""}`;
      if (waitingNotified !== waitingKey) {
        waitingNotified = waitingKey;
        callback(options.onWaiting, run);
      }
    } else {
      waitingNotified = undefined;
    }
  };
  const consider = (run: TRun): void => {
    if (isTerminalStatus(current.status)) return;
    const newer = time(run.dateUpdated) >= time(current.dateUpdated) || isTerminalStatus(run.status);
    if (!newer) return;
    const changed = run.status !== current.status || time(run.dateUpdated) !== time(current.dateUpdated);
    current = run;
    if (changed) notify(run);
  };

  // Abort and timeout share one signal, so a fetch in flight is cancelled too.
  const controller = new AbortController();
  const onAbort = (): void => controller.abort(new AbortError("Stopped following the run.", { cause: options.signal?.reason }));
  if (options.signal?.aborted) onAbort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const deadline =
    options.timeout !== undefined
      ? setTimeout(
          () =>
            controller.abort(
              new TimeoutError(`${describeRun(kind.type, id)} did not finish within ${describeSeconds(options.timeout ?? 0)}.`),
            ),
          options.timeout,
        )
      : undefined;

  let pendingRun: TRun | undefined;
  let needFetch = false;
  let wake: (() => void) | undefined;
  const signalWake = (): void => {
    const resolve = wake;
    wake = undefined;
    resolve?.();
  };

  const unsubscribe: Array<() => void> = [];
  const stream: EventStream | undefined = deps.events.active();
  if (stream) {
    if (stream.scope === "user") {
      unsubscribe.push(
        stream.on(
          kind.updatedEvent,
          (message: unknown) => {
            if (kind.eventCarriesRun) {
              const run = message as TRun;
              if (!pendingRun || time(run.dateUpdated) >= time(pendingRun.dateUpdated)) pendingRun = run;
            } else {
              needFetch = true;
            }
            signalWake();
          },
          { id },
        ),
      );
    } else {
      unsubscribe.push(
        stream.on(
          "process-updated",
          () => {
            needFetch = true;
            signalWake();
          },
          { id },
        ),
      );
    }
    const onToken = options.onToken;
    if (kind.type === "Interaction" && onToken) {
      unsubscribe.push(
        stream.on(
          "interaction-process-stream",
          (message) => {
            if (message.type === "Chat") onToken(message.stream, message.agentName);
          },
          { id },
        ),
      );
    }
    unsubscribe.push(
      stream.on("reconnected", () => {
        // Delivery is at-most-once: whatever happened while the socket was down is re-read.
        needFetch = true;
        signalWake();
      }),
    );
    // The run may have moved between the start call and the subscription.
    needFetch = true;
  }

  const pause = (ms: number): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (controller.signal.aborted) {
        reject(controller.signal.reason as Error);
        return;
      }
      const timer = setTimeout(() => {
        wake = undefined;
        controller.signal.removeEventListener("abort", stop);
        needFetch = true;
        resolve();
      }, ms);
      const stop = (): void => {
        clearTimeout(timer);
        wake = undefined;
        reject(controller.signal.reason as Error);
      };
      controller.signal.addEventListener("abort", stop, { once: true });
      wake = () => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", stop);
        resolve();
      };
    });

  notify(started);
  let pollDelay = FIRST_POLL_MS;
  try {
    while (!isTerminalStatus(current.status)) {
      if (!pendingRun && !needFetch) {
        await pause(stream?.isOpen ? SAFETY_POLL_MS : pollDelay);
      }
      if (pendingRun) {
        const run = pendingRun;
        pendingRun = undefined;
        consider(run);
        continue;
      }
      if (needFetch) {
        needFetch = false;
        consider(await kind.fetch(id, controller.signal));
        if (!stream?.isOpen) pollDelay = Math.min(MAX_POLL_MS, Math.round(pollDelay * 1.5));
      }
    }
  } catch (error) {
    if (callbackFailure) throw callbackFailure.error;
    const stoppedByUs = controller.signal.aborted && (error === controller.signal.reason || error instanceof AbortError || error instanceof TimeoutError);
    if (stoppedByUs) {
      const reason = controller.signal.reason as Error;
      if (options.killOnAbort) {
        try {
          await deps.kill(kind.type, id);
        } catch {
          // Best effort: the caller asked to stop; the abort is what they hear about.
        }
      }
      throw reason instanceof MaitentoError ? reason : new AbortError("Stopped following the run.", { cause: reason });
    }
    throw error;
  } finally {
    for (const off of unsubscribe) off();
    if (deadline !== undefined) clearTimeout(deadline);
    options.signal?.removeEventListener("abort", onAbort);
  }

  if (FAILED.has(current.status) && options.throwOnFailure !== false) {
    throw new ProcessFailedError(current, current.status, kind.failureDetails(current), kind.type);
  }
  return current;
}
