import { seg } from "../core/http.js";
import { AbortError, MaitentoError } from "../core/errors.js";
import type { EventStream } from "../events.js";
import type {
  AddMessageResult,
  Interaction,
  InteractionProcess,
  InteractionProcessStartRequest,
  InteractionProcessToolResult,
  InteractionProcessWithDetails,
  ManagedInteraction,
  ManagedInteractionCreateRequest,
  ManagedInteractionUpdateRequest,
  OneShotInteraction,
  OneShotInteractionCreateRequest,
  OneShotInteractionUpdateRequest,
  RoundRobinInteraction,
  RoundRobinInteractionCreateRequest,
  RoundRobinInteractionUpdateRequest,
} from "../models.js";
import { follow, type ProcessKind, type RunOptions } from "../run.js";
import { transcript, type TranscriptEntry } from "../transcript.js";
import { Definitions } from "./definitions.js";
import {
  Resource,
  followDependencies,
  resolveTarget,
  splitNamespace,
  toNameValuePairs,
  type DefinitionTarget,
  type Inputs,
  type ListOptions,
  type NamespaceOptions,
  type RequestOptions,
} from "./shared.js";

/** Starting an interaction run: its inputs (a list of pairs or a plain object) and the run's settings. */
export interface InteractionStartRequest extends Omit<InteractionProcessStartRequest, "inputs"> {
  inputs?: Inputs;
}

const INTERACTION_RUN: Omit<ProcessKind<InteractionProcess>, "fetch"> = {
  type: "Interaction",
  updatedEvent: "interaction-process-updated",
  eventCarriesRun: true,
  waiting: new Set(["HumanInteractionRequired", "PendingApproval"]),
  failureDetails: (run) => run.failureDetails,
};

/** Interactions: runnable jobs that put agents to work on a task. Usually deployed from `interactions/<kind>/*.mtr`. */
export class Interactions extends Definitions<Interaction> {
  protected readonly segment = "interactions";
  protected readonly itemType = "Interaction";

  /** Creates a one-shot interaction (one agent, one answer). */
  async createOneShot(request: OneShotInteractionCreateRequest, options?: NamespaceOptions): Promise<OneShotInteraction> {
    return this.create("one-shot", request, "OneShotInteractionCreateRequest", "OneShotInteraction", options);
  }

  /** Creates a round-robin interaction (agents, and optionally a person, take turns). */
  async createRoundRobin(request: RoundRobinInteractionCreateRequest, options?: NamespaceOptions): Promise<RoundRobinInteraction> {
    return this.create("round-robin", request, "RoundRobinInteractionCreateRequest", "RoundRobinInteraction", options);
  }

  /** Creates a managed interaction (a manager agent hands work to a team). */
  async createManaged(request: ManagedInteractionCreateRequest, options?: NamespaceOptions): Promise<ManagedInteraction> {
    return this.create("managed", request, "ManagedInteractionCreateRequest", "ManagedInteraction", options);
  }

  /** Updates a one-shot interaction (a new version when anything changed). */
  async updateOneShot(id: string, request: OneShotInteractionUpdateRequest, options?: RequestOptions): Promise<OneShotInteraction> {
    return this.update("one-shot", id, request, "OneShotInteractionUpdateRequest", "OneShotInteraction", options);
  }

  /** Updates a round-robin interaction. */
  async updateRoundRobin(
    id: string,
    request: RoundRobinInteractionUpdateRequest,
    options?: RequestOptions,
  ): Promise<RoundRobinInteraction> {
    return this.update("round-robin", id, request, "RoundRobinInteractionUpdateRequest", "RoundRobinInteraction", options);
  }

  /** Updates a managed interaction. */
  async updateManaged(id: string, request: ManagedInteractionUpdateRequest, options?: RequestOptions): Promise<ManagedInteraction> {
    return this.update("managed", id, request, "ManagedInteractionUpdateRequest", "ManagedInteraction", options);
  }

  /**
   * Starts a run of the interaction's latest enabled version and returns it (status `New`). Starts work, so it is
   * never retried. To wait for the answer, use {@link run}.
   */
  async start(target: DefinitionTarget, request?: InteractionStartRequest, options?: RequestOptions): Promise<InteractionProcess> {
    const resolved = resolveTarget(target);
    const body = { ...request, inputs: toNameValuePairs(request?.inputs) };
    const path =
      resolved.kind === "name"
        ? `/namespaces/${seg(this.ns(resolved.namespace))}/interactions/by-name/${seg(resolved.name)}/start`
        : `/interactions/processes/by-id/${seg(resolved.id)}/start`;
    if (resolved.kind === "id" && resolved.version !== undefined) {
      return Promise.reject(new MaitentoError("An interaction always runs its latest enabled version; drop `version`."));
    }
    return this.request({
      method: "PUT",
      path,
      body,
      bodyType: "InteractionProcessStartRequest",
      response: "InteractionProcess",
      idempotent: false,
      options,
    });
  }

  /**
   * Starts a run and follows it to the end: over the open event stream or by polling. With `onToken`, the reply streams
   * in as it is written (an event stream is opened for the run when none is open). Resolves with the finished run; a
   * run that ends `Error` or `Killed` throws `ProcessFailedError`.
   *
   * ```ts
   * const run = await mt.interactions.run("hello", { inputs: { message: "Hi!" } });
   * console.log(run.output);
   * ```
   */
  async run(
    target: DefinitionTarget,
    request?: InteractionStartRequest,
    options?: RunOptions<InteractionProcess>,
  ): Promise<InteractionProcess> {
    // The tokens come over the event stream: open one for this run before it starts (so the first ones aren't missed)
    // when none is open, and close it again when the run ends.
    const owned = options?.onToken && !this.ctx.events.active() ? await this.openStreamForTokens(options.signal) : undefined;
    try {
      const started = await this.start(target, request, { signal: options?.signal });
      return await follow(
        followDependencies(this.ctx),
        { ...INTERACTION_RUN, fetch: (id, signal) => this.fetchRun(id, signal) },
        started,
        options,
      );
    } finally {
      await owned?.close();
    }
  }

  /** Opens an event stream for a run's `onToken`; without one the run is still followed (by polling), just tokenless. */
  private async openStreamForTokens(signal: AbortSignal | undefined): Promise<EventStream | undefined> {
    try {
      return await this.ctx.events.connect({ signal });
    } catch (error) {
      if (error instanceof AbortError) throw error;
      console.warn(
        `Maitento: could not open the event stream, so onToken will receive nothing; the run is followed by polling. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  private fetchRun(id: string, signal: AbortSignal): Promise<InteractionProcess> {
    return this.request({
      method: "GET",
      path: `/interactions/processes/by-id/${seg(id)}`,
      response: "InteractionProcess",
      options: { signal },
    });
  }

  private create<T>(
    kind: string,
    request: unknown,
    bodyType: string,
    response: string,
    options: NamespaceOptions | undefined,
  ): Promise<T> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "POST",
      path: `${this.namespacePath(namespace)}/${kind}`,
      body: request,
      bodyType,
      response,
      options: rest,
    });
  }

  private update<T>(
    kind: string,
    id: string,
    request: unknown,
    bodyType: string,
    response: string,
    options: RequestOptions | undefined,
  ): Promise<T> {
    return this.request({
      method: "PUT",
      path: `/interactions/${kind}/by-id/${seg(id)}`,
      body: request,
      bodyType,
      response,
      idempotent: true,
      options,
    });
  }
}

/** Who a message or vote is recorded as. With an API key the SDK may name the author; with a JWT it is the caller. */
export interface MessageAuthor {
  messageAuthorName?: string | null;
  messageAuthorId?: string;
}

/** Interaction runs: read one, talk to it, approve or reject its tool calls, vote. */
export class InteractionRuns extends Resource {
  /** The run with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<InteractionProcess> {
    return this.request({
      method: "GET",
      path: `/interactions/processes/by-id/${seg(id)}`,
      response: "InteractionProcess",
      options,
    });
  }

  /** The run with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<InteractionProcess | null> {
    return this.request({
      method: "GET",
      path: `/interactions/processes/by-id/${seg(id)}`,
      response: "InteractionProcess",
      notFound: "null",
      options,
    });
  }

  /**
   * EVERY interaction run of the tenant, each with its whole conversation: unbounded and potentially very large.
   * Prefer `runs.list({ types: ["Interaction"] })` (paged, summaries).
   */
  async list(options?: RequestOptions): Promise<InteractionProcess[]> {
    return this.request({ method: "GET", path: "/interactions/processes", response: "InteractionProcess[]", options });
  }

  /** The runs of the namespace that have not finished. */
  async listActive(options?: ListOptions): Promise<InteractionProcessWithDetails[]> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "GET",
      path: `/namespaces/${seg(this.ns(namespace))}/interactions/processes`,
      response: "InteractionProcessWithDetails[]",
      options: rest,
    });
  }

  /** The conversation in order (every context item, sorted by `sequence`, tagged with its `kind`). */
  transcript(run: Pick<InteractionProcess, "context">): TranscriptEntry[] {
    return transcript(run);
  }

  /**
   * Adds a person's message: answers a run waiting in `HumanInteractionRequired`, or is queued (`queued: true`) when
   * the run is mid-turn.
   */
  async addMessage(id: string, request: { message: string } & MessageAuthor, options?: RequestOptions): Promise<AddMessageResult> {
    return this.request({
      method: "POST",
      path: `/interactions/processes/by-id/${seg(id)}/add-message`,
      body: request,
      bodyType: "InteractionAddMessageRequest",
      response: "AddMessageResult",
      options,
    });
  }

  /** Injects a system message into the running conversation. */
  async addSystemMessage(id: string, request: { content: string }, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "POST",
      path: `/interactions/processes/by-id/${seg(id)}/system-message`,
      body: request,
      bodyType: "InteractionAddSystemMessageRequest",
      response: "void",
      options,
    });
  }

  /** Approves the tool call a run is waiting on (`run.pendingApproval.id`): the call is made. */
  async approve(id: string, request: { approvalId: string }, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "POST",
      path: `/interactions/processes/by-id/${seg(id)}/approve`,
      body: { toolCallApprovalId: request.approvalId },
      bodyType: "InteractionApproveToolCallRequest",
      response: "void",
      options,
    });
  }

  /** Rejects the tool call a run is waiting on; the model is told `reason`. */
  async reject(id: string, request: { approvalId: string; reason: string }, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "POST",
      path: `/interactions/processes/by-id/${seg(id)}/reject`,
      body: { toolCallApprovalId: request.approvalId, reason: request.reason },
      bodyType: "InteractionRejectToolCallRequest",
      response: "void",
      options,
    });
  }

  /** Votes yes on the solution proposal. */
  async voteYes(id: string, request?: MessageAuthor, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "POST",
      path: `/interactions/processes/by-id/${seg(id)}/vote/yes`,
      body: request ?? {},
      bodyType: "InteractionVoteYesRequest",
      response: "void",
      options,
    });
  }

  /** Votes no on the solution proposal, with the reason the agents see. */
  async voteNo(id: string, request: { reason: string } & MessageAuthor, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "POST",
      path: `/interactions/processes/by-id/${seg(id)}/vote/no`,
      body: request,
      bodyType: "InteractionVoteNoRequest",
      response: "void",
      options,
    });
  }

  /** The full result of one tool call (when the context item's `result` was moved off the run). */
  async toolResult(id: string, sequence: number, options?: RequestOptions): Promise<InteractionProcessToolResult> {
    return this.request({
      method: "GET",
      path: `/interactions/processes/by-id/${seg(id)}/tool-results/${seg(sequence)}`,
      response: "InteractionProcessToolResult",
      options,
    });
  }
}
