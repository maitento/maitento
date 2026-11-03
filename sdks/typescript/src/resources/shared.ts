import { MaitentoError } from "../core/errors.js";
import { seg, type HttpClient, type HttpRequest, type RequestOptions } from "../core/http.js";
import type { Events } from "../events.js";
import type { NameValuePair } from "../models.js";
import type { FollowDependencies } from "../run.js";

export type { RequestOptions } from "../core/http.js";

/** Per-call options for a call that addresses something by name inside a namespace. */
export interface NamespaceOptions extends RequestOptions {
  /** The namespace. Defaults to the client's `namespace` (or `MAITENTO_NAMESPACE`). */
  namespace?: string;
}

/** Per-call options for a list that can be narrowed to one namespace. */
export interface ListOptions extends RequestOptions {
  /** List only this namespace. Omitted: the whole tenant (the client's default namespace does NOT apply). */
  namespace?: string;
}

/**
 * What a start or `run()` call acts on:
 * - `"hello"`: the definition named `hello` in the default namespace;
 * - `{ name: "hello", namespace: "demo" }`: by name in another namespace;
 * - `{ id }` (and, for apps and capsules, an optional `version`): a definition by id. Without a version the latest
 *   enabled version runs.
 */
export type RunTarget = string | { name: string; namespace?: string } | { id: string; version?: number };

/** A definition to start by name or by id (interactions and pipelines always run their latest enabled version). */
export type DefinitionTarget = string | { name: string; namespace?: string } | { id: string };

/** Splits a target into a by-name or a by-id address. */
export function resolveTarget(
  target: RunTarget,
): { kind: "name"; name: string; namespace: string | undefined } | { kind: "id"; id: string; version: number | undefined } {
  if (typeof target === "string") {
    return { kind: "name", name: target, namespace: undefined };
  }
  if ("id" in target && target.id) {
    return { kind: "id", id: target.id, version: "version" in target ? target.version : undefined };
  }
  if ("name" in target && target.name) {
    return { kind: "name", name: target.name, namespace: target.namespace };
  }
  throw new MaitentoError("Say what to start: a name, { name, namespace } or { id }.");
}

/**
 * Start inputs, either as the wire's list of `{ name, value }` pairs or as a plain object
 * (`{ topic: "tides", days: 3 }`); values are sent as strings.
 */
export type Inputs = NameValuePair[] | Record<string, string | number | boolean | null | undefined>;

/** Turns {@link Inputs} into the wire's `NameValuePair[]` (a `null` or `undefined` value is left out). */
export function toNameValuePairs(inputs: Inputs | undefined): NameValuePair[] {
  if (!inputs) return [];
  if (Array.isArray(inputs)) return inputs;
  const pairs: NameValuePair[] = [];
  for (const [name, value] of Object.entries(inputs)) {
    if (value !== undefined && value !== null) pairs.push({ name, value: String(value) });
  }
  return pairs;
}

/** What a resource group needs from the client. */
export interface ClientContext {
  readonly http: HttpClient;
  /** The namespace for a by-name call: the explicit one, else the client default, else an error. */
  namespace(explicit?: string): string;
  /**
   * The client's event streams, which the `run()` helpers follow when one is open (and open for themselves when given
   * an `onToken`).
   */
  readonly events: Pick<Events, "active" | "connect">;
}

/** The dependencies of `follow()` for this client: its event streams, and kill by process type. */
export function followDependencies(ctx: ClientContext): FollowDependencies {
  return {
    events: ctx.events,
    kill: (type, id) =>
      ctx.http.request<void>({
        method: "POST",
        path: `/processes/${seg(type)}/${seg(id)}/kill`,
        response: "void",
        idempotent: true,
      }),
  };
}

/** Splits `{ namespace, ...requestOptions }`. */
export function splitNamespace<T extends { namespace?: string | undefined }>(
  options: T | undefined,
): { namespace: string | undefined; rest: Omit<T, "namespace"> | undefined } {
  if (!options) return { namespace: undefined, rest: undefined };
  const { namespace, ...rest } = options;
  return { namespace, rest };
}

export abstract class Resource {
  constructor(protected readonly ctx: ClientContext) {}

  protected request<T>(req: HttpRequest): Promise<T> {
    return this.ctx.http.request<T>(req);
  }

  protected ns(explicit?: string): string {
    return this.ctx.namespace(explicit);
  }
}

export function requireValue<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null || (typeof value === "string" && value === "")) {
    throw new MaitentoError(`${what} is required.`);
  }
  return value;
}
