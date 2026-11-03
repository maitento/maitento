import { seg } from "../core/http.js";
import { MaitentoError } from "../core/errors.js";
import type {
  App,
  AppProcess,
  AppProcessWithDetails,
  AppStartRequest,
  Capsule,
  CapsuleProcess,
  CapsuleProcessAddUserRequest,
  CapsuleProcessCommand,
  CapsuleProcessInstallPackageRequest,
  CapsuleProcessMountSecretRequest,
  CapsuleProcessMountVfsRequest,
  CapsuleProcessRunCommandRequest,
  CapsuleProcessStartRequest,
  CapsuleProcessWithDetails,
} from "../models.js";
import { waitForCommand, type CommandWaitOptions } from "../command.js";
import { follow, type ProcessKind, type RunOptions } from "../run.js";
import { Definitions } from "./definitions.js";
import {
  Resource,
  followDependencies,
  resolveTarget,
  splitNamespace,
  toNameValuePairs,
  type Inputs,
  type ListOptions,
  type NamespaceOptions,
  type RequestOptions,
  type RunTarget,
} from "./shared.js";

/** Starting an app run: its inputs (a list of pairs or a plain object) and the run's settings. */
export interface AppStart extends Omit<AppStartRequest, "inputs"> {
  inputs?: Inputs;
}

/** The highest enabled version of a definition. */
function latestEnabled(versions: ReadonlyArray<{ version: number; isDisabled: boolean }>, what: string): number {
  let best: number | undefined;
  for (const v of versions) {
    if (!v.isDisabled && (best === undefined || v.version > best)) best = v.version;
  }
  if (best === undefined) {
    throw new MaitentoError(`${what} has no enabled version to start.`);
  }
  return best;
}

const APP_RUN: Omit<ProcessKind<AppProcess>, "fetch"> = {
  type: "App",
  updatedEvent: "app-process-updated",
  eventCarriesRun: true,
  waiting: new Set(["HumanInteractionRequired"]),
  failureDetails: (run) => run.failureDetails,
};

const CAPSULE_RUN: Omit<ProcessKind<CapsuleProcess>, "fetch"> = {
  type: "Capsule",
  updatedEvent: "capsule-process-updated",
  eventCarriesRun: true,
  waiting: new Set<string>(),
  failureDetails: (run) => run.failureDetails,
};

/** Apps: Cogniscript programs (deployed from `apps/<name>/`) that orchestrate interactions, pipelines and capsules. */
export class Apps extends Definitions<App> {
  protected readonly segment = "apps";
  protected readonly itemType = "App";

  /** Creates an empty app (its versions come from deploys). */
  async create(request: { name: string }, options?: NamespaceOptions): Promise<App> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "POST",
      path: this.namespacePath(namespace),
      body: { name: request.name },
      bodyType: "AppCreateRequest",
      response: "App",
      options: rest,
    });
  }

  /**
   * Starts a run (status `New`): by name, the latest version; by `{ id, version }`, that version; by `{ id }`, the
   * latest enabled version. Never retried.
   */
  async start(target: RunTarget, request?: AppStart, options?: RequestOptions): Promise<AppProcess> {
    const resolved = resolveTarget(target);
    const body = { ...request, inputs: toNameValuePairs(request?.inputs) };
    let path: string;
    if (resolved.kind === "name") {
      path = `/namespaces/${seg(this.ns(resolved.namespace))}/apps/by-name/${seg(resolved.name)}/versions/latest/start`;
    } else {
      const version = resolved.version ?? latestEnabled((await this.get(resolved.id, options)).versions, "The app");
      path = `/apps/by-id/${seg(resolved.id)}/versions/${seg(version)}/start`;
    }
    return this.request({
      method: "PUT",
      path,
      body,
      bodyType: "AppStartRequest",
      response: "AppProcess",
      idempotent: false,
      options,
    });
  }

  /** Starts a run and follows it to the end (see `interactions.run`). */
  async run(target: RunTarget, request?: AppStart, options?: RunOptions<AppProcess>): Promise<AppProcess> {
    const started = await this.start(target, request, { signal: options?.signal });
    return follow(
      followDependencies(this.ctx),
      {
        ...APP_RUN,
        fetch: (id, signal) =>
          this.request({ method: "GET", path: `/apps/processes/by-id/${seg(id)}`, response: "AppProcess", options: { signal } }),
      },
      started,
      options,
    );
  }
}

/** App runs. */
export class AppRuns extends Resource {
  /** The run with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<AppProcess> {
    return this.request({ method: "GET", path: `/apps/processes/by-id/${seg(id)}`, response: "AppProcess", options });
  }

  /** The run with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<AppProcess | null> {
    return this.request({
      method: "GET",
      path: `/apps/processes/by-id/${seg(id)}`,
      response: "AppProcess",
      notFound: "null",
      options,
    });
  }

  /** The app runs of the namespace that have not finished. */
  async listActive(options?: ListOptions): Promise<AppProcessWithDetails[]> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "GET",
      path: `/namespaces/${seg(this.ns(namespace))}/apps/processes`,
      response: "AppProcessWithDetails[]",
      options: rest,
    });
  }

  /** Changes the values of a running app's EXISTING inputs (it sees the change); 400 for an unknown input. */
  async updateInputs(id: string, request: { inputs: Inputs }, options?: RequestOptions): Promise<AppProcess> {
    return this.request({
      method: "PUT",
      path: `/apps/processes/by-id/${seg(id)}/inputs`,
      body: { inputs: toNameValuePairs(request.inputs) },
      bodyType: "AppStartRequest",
      response: "AppProcess",
      idempotent: true,
      options,
    });
  }
}

/** Capsules: sandboxed Linux containers (deployed from `capsules/*.mtr`). */
export class Capsules extends Definitions<Capsule> {
  protected readonly segment = "capsules";
  protected readonly itemType = "Capsule";

  /** Starts a capsule (status `New`); by name the latest version, by `{ id, version? }` as for apps. Never retried. */
  async start(target: RunTarget, request?: CapsuleProcessStartRequest, options?: RequestOptions): Promise<CapsuleProcess> {
    const resolved = resolveTarget(target);
    let path: string;
    if (resolved.kind === "name") {
      path = `/namespaces/${seg(this.ns(resolved.namespace))}/capsules/by-name/${seg(resolved.name)}/versions/latest/start`;
    } else {
      const version = resolved.version ?? latestEnabled((await this.get(resolved.id, options)).versions, "The capsule");
      path = `/capsules/by-id/${seg(resolved.id)}/versions/${seg(version)}/start`;
    }
    return this.request({
      method: "PUT",
      path,
      body: request ?? {},
      bodyType: "CapsuleProcessStartRequest",
      response: "CapsuleProcess",
      idempotent: false,
      options,
    });
  }

  /** Starts a capsule and follows it until it ends (see `interactions.run`). */
  async run(target: RunTarget, request?: CapsuleProcessStartRequest, options?: RunOptions<CapsuleProcess>): Promise<CapsuleProcess> {
    const started = await this.start(target, request, { signal: options?.signal });
    return follow(
      followDependencies(this.ctx),
      {
        ...CAPSULE_RUN,
        fetch: (id, signal) =>
          this.request({ method: "GET", path: `/capsule-processes/by-id/${seg(id)}`, response: "CapsuleProcess", options: { signal } }),
      },
      started,
      options,
    );
  }
}

/** Capsule runs: run commands in them, mount things, install packages, terminate. Commands are queued. */
export class CapsuleRuns extends Resource {
  /** Every capsule run of the tenant (unbounded; prefer `runs.list({ types: ["Capsule"] })`). */
  async list(options?: RequestOptions): Promise<CapsuleProcess[]> {
    return this.request({ method: "GET", path: "/capsule-processes", response: "CapsuleProcess[]", options });
  }

  /** The run with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<CapsuleProcess> {
    return this.request({ method: "GET", path: `/capsule-processes/by-id/${seg(id)}`, response: "CapsuleProcess", options });
  }

  /** The run with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<CapsuleProcess | null> {
    return this.request({
      method: "GET",
      path: `/capsule-processes/by-id/${seg(id)}`,
      response: "CapsuleProcess",
      notFound: "null",
      options,
    });
  }

  /** The capsule runs of the namespace that have not finished. */
  async listActive(options?: ListOptions): Promise<CapsuleProcessWithDetails[]> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "GET",
      path: `/namespaces/${seg(this.ns(namespace))}/capsules/processes`,
      response: "CapsuleProcessWithDetails[]",
      options: rest,
    });
  }

  /**
   * Queues a command and returns it `Pending`; it runs once the capsule is ready, after the commands queued before it.
   * `command` is shell text, run by the user's login shell from `/`. Each of `arguments` reaches the program as one
   * word, exactly as given (spaces, quotes and `$` included): to pipe or redirect, run `sh` with
   * `["-c", "<line>"]`, or put the whole line in `command`. To get the result, use `execAndWait` (or `getCommand`).
   */
  async exec(id: string, request: CapsuleProcessRunCommandRequest, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.command(id, "POST", "commands", request, "CapsuleProcessRunCommandRequest", options);
  }

  /**
   * Queues a command and waits for it to end: over the open event stream when there is one, by polling the command
   * otherwise (0.25 s, growing to 2 s). Resolves with the command, `Finished` or `Error`, with its `exitCode`,
   * `outputStandard` and `outputError`: a non-zero exit code is a result, not an error. Rejects with
   * `CapsuleCommandAbortedError` when the capsule ends before the command finishes, and with `TimeoutError` /
   * `AbortError` when `timeout` passes or `signal` aborts first (the command keeps running). `command` is shell text;
   * each of `arguments` reaches the program as one word, exactly as given. The queueing call is never retried.
   */
  async execAndWait(
    id: string,
    request: CapsuleProcessRunCommandRequest,
    options?: CommandWaitOptions,
  ): Promise<CapsuleProcessCommand> {
    const queued = await this.exec(id, request, { signal: options?.signal });
    return waitForCommand(
      {
        events: this.ctx.events,
        fetch: (signal) => this.getCommand(id, queued.id, { signal }),
      },
      id,
      queued,
      options,
    );
  }

  /**
   * One command (or operation) of a capsule run, with its status and output. One still queued or running when the run
   * ended reads as `AbortedOnTermination`. Throws `NotFoundError` when there is none.
   */
  async getCommand(id: string, commandId: string, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.request({
      method: "GET",
      path: `/capsule-processes/by-id/${seg(id)}/commands/${seg(commandId)}`,
      response: "CapsuleProcessCommand",
      options,
    });
  }

  /** Terminates the capsule. */
  async terminate(id: string, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.command(id, "POST", "terminate", undefined, undefined, options, true);
  }

  /** Mounts a secret as a file. */
  async mountSecret(id: string, request: CapsuleProcessMountSecretRequest, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.command(id, "POST", "mounts/secrets", request, "CapsuleProcessMountSecretRequest", options);
  }

  /** Unmounts a secret. */
  async unmountSecret(id: string, mountName: string, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.command(id, "DELETE", `mounts/secrets/${seg(mountName)}`, undefined, undefined, options);
  }

  /** Mounts a virtual file system. */
  async mountVfs(id: string, request: CapsuleProcessMountVfsRequest, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.command(id, "POST", "mounts/vfs", request, "CapsuleProcessMountVfsRequest", options);
  }

  /** Unmounts a virtual file system. */
  async unmountVfs(id: string, mountName: string, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.command(id, "DELETE", `mounts/vfs/${seg(mountName)}`, undefined, undefined, options);
  }

  /** Installs a package. */
  async installPackage(
    id: string,
    request: CapsuleProcessInstallPackageRequest,
    options?: RequestOptions,
  ): Promise<CapsuleProcessCommand> {
    return this.command(id, "POST", "packages", request, "CapsuleProcessInstallPackageRequest", options);
  }

  /** Removes a package. */
  async removePackage(id: string, packageName: string, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.command(id, "DELETE", `packages/${seg(packageName)}`, undefined, undefined, options);
  }

  /** Adds a user. */
  async addUser(id: string, request: CapsuleProcessAddUserRequest, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.command(id, "POST", "users", request, "CapsuleProcessAddUserRequest", options);
  }

  /** Removes a user. */
  async removeUser(id: string, username: string, options?: RequestOptions): Promise<CapsuleProcessCommand> {
    return this.command(id, "DELETE", `users/${seg(username)}`, undefined, undefined, options);
  }

  private command(
    id: string,
    method: "POST" | "DELETE",
    suffix: string,
    body: unknown,
    bodyType: string | undefined,
    options: RequestOptions | undefined,
    idempotent = false,
  ): Promise<CapsuleProcessCommand> {
    return this.request({
      method,
      path: `/capsule-processes/by-id/${seg(id)}/${suffix}`,
      body,
      bodyType,
      response: "CapsuleProcessCommand",
      // A queued command is work: a DELETE here queues one too, so none of these is retried.
      idempotent,
      options,
    });
  }
}
