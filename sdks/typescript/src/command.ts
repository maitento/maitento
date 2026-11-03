import { AbortError, CapsuleCommandAbortedError, MaitentoError, TimeoutError, describeSeconds } from "./core/errors.js";
import type { Events, EventStream } from "./events.js";
import type { CapsuleProcess, CapsuleProcessCommand } from "./models.js";

/** Options of `capsuleRuns.execAndWait`. */
export interface CommandWaitOptions {
  /**
   * Milliseconds to wait before a `TimeoutError`. The command keeps running in the capsule (until its own
   * `maximumDuration` or the capsule's end). No limit by default: the command's own time limit always ends it.
   */
  timeout?: number;
  /** Stops waiting (an `AbortError`). The command keeps running. */
  signal?: AbortSignal;
}

/** What waiting for a command needs: the client's event streams, and a read of the one command. */
export interface CommandWaitDependencies {
  events: Pick<Events, "active">;
  fetch(signal: AbortSignal): Promise<CapsuleProcessCommand>;
}

const FINAL = new Set(["Finished", "Error", "AbortedOnTermination"]);
const RUN_ENDED = new Set(["Finished", "Error", "Killed"]);
/** Most commands finish in a second or two, and one command is a small read: poll from 0.25 s, growing to 2 s. */
const FIRST_POLL_MS = 250;
const MAX_POLL_MS = 2000;
/** With an open event stream, the command is still re-read this often in case an event was lost. */
const SAFETY_POLL_MS = 15_000;

/** Whether a command's status is final (`Finished`, `Error`, `AbortedOnTermination`). */
export function isFinalCommandStatus(status: string): boolean {
  return FINAL.has(status);
}

/**
 * `command` as it reads in `run`: a command still `Pending` or `Running` in a run that has ended can never finish, so
 * it reads as `AbortedOnTermination`, as the server's read of one command does.
 */
function asSeenIn(command: CapsuleProcessCommand, run: CapsuleProcess): CapsuleProcessCommand {
  if (isFinalCommandStatus(command.status) || !RUN_ENDED.has(run.status)) return command;
  return {
    ...command,
    status: "AbortedOnTermination",
    failureDetails:
      command.status === "Pending"
        ? `The capsule run ended (${run.status}) before this command could run`
        : `The capsule run ended (${run.status}) before the command finished`,
  };
}

/**
 * Waits for `queued`, a command of the capsule run `runId`, to reach its final status: over the open event stream when
 * there is one (each `capsule-process-updated` event carries the run with its commands; the command is re-read after a
 * reconnect, and every 15 s in case an event was lost), by polling the one command otherwise (0.25 s, growing to 2 s).
 * Resolves with a `Finished` or `Error` command (a non-zero exit code is a result); a command the capsule ended first
 * rejects with `CapsuleCommandAbortedError`.
 */
export async function waitForCommand(
  deps: CommandWaitDependencies,
  runId: string,
  queued: CapsuleProcessCommand,
  options: CommandWaitOptions = {},
): Promise<CapsuleProcessCommand> {
  const commandId = queued.id;
  let current = queued;

  // Abort and timeout share one signal, so a read in flight is cancelled too.
  const controller = new AbortController();
  const onAbort = (): void =>
    controller.abort(new AbortError("Stopped waiting for the command.", { cause: options.signal?.reason }));
  if (options.signal?.aborted) onAbort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const deadline =
    options.timeout !== undefined
      ? setTimeout(
          () =>
            controller.abort(
              new TimeoutError(`Capsule command ${commandId} did not finish within ${describeSeconds(options.timeout ?? 0)}.`),
            ),
          options.timeout,
        )
      : undefined;

  let pending: CapsuleProcessCommand | undefined;
  let needFetch = false;
  let wake: (() => void) | undefined;
  const signalWake = (): void => {
    const resolve = wake;
    wake = undefined;
    resolve?.();
  };
  const nudge = (): void => {
    needFetch = true;
    signalWake();
  };

  const unsubscribe: Array<() => void> = [];
  const stream: EventStream | undefined = deps.events.active();
  if (stream) {
    if (stream.scope === "user") {
      unsubscribe.push(
        stream.on(
          "capsule-process-updated",
          (run) => {
            // A command only ever moves on, so a final state is final however late the event.
            const command = run.commands?.find((c) => c.id === commandId);
            if (!command) {
              nudge();
              return;
            }
            const seen = asSeenIn(command, run);
            if (!isFinalCommandStatus(seen.status)) return;
            pending = seen;
            signalWake();
          },
          { id: runId },
        ),
      );
    } else {
      // A tenant stream carries every run as a `process-updated` nudge, without its commands.
      unsubscribe.push(stream.on("process-updated", nudge, { id: runId }));
    }
    // Delivery is at-most-once: whatever happened while the socket was down is re-read.
    unsubscribe.push(stream.on("reconnected", nudge));
    // The command may have ended between the call that queued it and the subscription.
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

  let pollDelay = FIRST_POLL_MS;
  try {
    while (!isFinalCommandStatus(current.status)) {
      if (!pending && !needFetch) {
        await pause(stream?.isOpen ? SAFETY_POLL_MS : pollDelay);
      }
      if (pending) {
        current = pending;
        pending = undefined;
        continue;
      }
      if (needFetch) {
        needFetch = false;
        current = await deps.fetch(controller.signal);
        if (!stream?.isOpen) pollDelay = Math.min(MAX_POLL_MS, Math.round(pollDelay * 1.5));
      }
    }
  } catch (error) {
    const stoppedByUs =
      controller.signal.aborted &&
      (error === controller.signal.reason || error instanceof AbortError || error instanceof TimeoutError);
    if (stoppedByUs) {
      const reason = controller.signal.reason as Error;
      throw reason instanceof MaitentoError ? reason : new AbortError("Stopped waiting for the command.", { cause: reason });
    }
    throw error;
  } finally {
    for (const off of unsubscribe) off();
    if (deadline !== undefined) clearTimeout(deadline);
    options.signal?.removeEventListener("abort", onAbort);
  }

  if (current.status === "AbortedOnTermination") throw new CapsuleCommandAbortedError(current, runId);
  return current;
}
