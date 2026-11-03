import { seg } from "../core/http.js";
import type { ThreadKind, ThreadKnotFilter, ThreadListOrder, ThreadStrand, ThreadVisibility } from "../generated/enums.js";
import type {
  Loom,
  LoomCreateRequest,
  LoomInspection,
  LoomPattern,
  LoomReflection,
  LoomSeedRequest,
  LoomSeeding,
  LoomSession,
  LoomTensionView,
  LoomThread,
  LoomUpdateRequest,
  NightWeaving,
  PatternChange,
  TapestryPanel,
  TapestryPreview,
  ThreadCutRequest,
  ThreadGiveRequest,
  ThreadRecallRequest,
  ThreadRecollection,
  ThreadReframeRequest,
  ThreadWeaveRequest,
  WeaveResult,
} from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

/** Filters of `looms.threads`. */
export interface ThreadListQuery {
  kind?: ThreadKind[];
  strand?: ThreadStrand;
  knots?: ThreadKnotFilter;
  pinned?: boolean;
  subject?: string;
  tag?: string;
  visibility?: ThreadVisibility;
  sort?: ThreadListOrder;
  skip?: number;
  limit?: number;
}

/**
 * Looms: an agent's long-term memory. Threads are woven in (remembered), recalled, reframed, cut and given to other
 * looms; a night weave consolidates them. Erasing (`delete…`) needs Tenant.Admin.
 */
export class Looms extends Resource {
  /**
   * The looms of a namespace. Give `namespaceId`, or a namespace NAME (`namespace`, else the client default), which
   * is looked up first.
   */
  async list(options?: RequestOptions & { namespaceId?: string; namespace?: string }): Promise<Loom[]> {
    const { namespaceId, namespace, ...rest } = options ?? {};
    let id = namespaceId;
    if (!id) {
      const found = await this.request<{ id: string }>({
        method: "GET",
        path: `/namespaces/by-name/${seg(this.ns(namespace))}`,
        response: "Namespace",
        options: rest,
      });
      id = found.id;
    }
    return this.request({ method: "GET", path: `/looms/by-namespace/${seg(id)}`, response: "Loom[]", options: rest });
  }

  /** The loom with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<Loom> {
    return this.request({ method: "GET", path: `/looms/by-id/${seg(id)}`, response: "Loom", options });
  }

  /** The loom with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<Loom | null> {
    return this.request({ method: "GET", path: `/looms/by-id/${seg(id)}`, response: "Loom", notFound: "null", options });
  }

  /** Creates a loom. */
  async create(request: LoomCreateRequest, options?: RequestOptions): Promise<Loom> {
    return this.request({
      method: "PUT",
      path: "/looms",
      body: request,
      bodyType: "LoomCreateRequest",
      response: "Loom",
      idempotent: false,
      options,
    });
  }

  /** Changes a loom's name, description or settings (absent fields are unchanged). */
  async update(id: string, request: LoomUpdateRequest, options?: RequestOptions): Promise<Loom> {
    return this.request({
      method: "PATCH",
      path: `/looms/by-id/${seg(id)}`,
      body: request,
      bodyType: "LoomUpdateRequest",
      response: "Loom",
      idempotent: true,
      options,
    });
  }

  /** Unravels (erases) a loom and everything in it (Tenant.Admin). */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/looms/by-id/${seg(id)}`, response: "void", options });
  }

  /** Counts and health of a loom. */
  async inspect(id: string, options?: RequestOptions): Promise<LoomInspection> {
    return this.request({ method: "GET", path: `/looms/by-id/${seg(id)}/inspect`, response: "LoomInspection", options });
  }

  /** Threads, filtered and sorted. */
  async threads(id: string, query?: ThreadListQuery, options?: RequestOptions): Promise<LoomThread[]> {
    return this.request({
      method: "GET",
      path: `/looms/by-id/${seg(id)}/threads`,
      query: { ...query },
      response: "LoomThread[]",
      options,
    });
  }

  /** One thread. Throws `NotFoundError` when there is none. */
  async thread(id: string, threadId: string, options?: RequestOptions): Promise<LoomThread> {
    return this.request({
      method: "GET",
      path: `/looms/by-id/${seg(id)}/threads/by-id/${seg(threadId)}`,
      response: "LoomThread",
      options,
    });
  }

  /** Weaves a thread in (or reinforces one it matches). */
  async weave(id: string, request: ThreadWeaveRequest, options?: RequestOptions): Promise<WeaveResult> {
    return this.request({
      method: "PUT",
      path: `/looms/by-id/${seg(id)}/threads`,
      body: request,
      bodyType: "ThreadWeaveRequest",
      response: "WeaveResult",
      idempotent: false,
      options,
    });
  }

  /** The threads most relevant to a query. */
  async recall(id: string, request: ThreadRecallRequest, options?: RequestOptions): Promise<ThreadRecollection[]> {
    return this.request({
      method: "PUT",
      path: `/looms/by-id/${seg(id)}/threads/recall`,
      body: request,
      bodyType: "ThreadRecallRequest",
      response: "ThreadRecollection[]",
      idempotent: true,
      options,
    });
  }

  /** Rewrites a thread, with the reason. */
  async reframe(id: string, threadId: string, request: ThreadReframeRequest, options?: RequestOptions): Promise<LoomThread> {
    return this.threadAction(id, threadId, "reframe", request, "ThreadReframeRequest", "LoomThread", options);
  }

  /** Cuts a thread (it is let go, leaving its essence). */
  async cut(id: string, threadId: string, request: ThreadCutRequest, options?: RequestOptions): Promise<LoomThread> {
    return this.threadAction(id, threadId, "cut", request, "ThreadCutRequest", "LoomThread", options);
  }

  /** Pins or unpins a thread. */
  async pin(id: string, threadId: string, request: { pinned: boolean }, options?: RequestOptions): Promise<LoomThread> {
    return this.threadAction(id, threadId, "pin", request, "ThreadPinRequest", "LoomThread", options, true);
  }

  /** Gives a thread to another loom (`toLoomId`, or `toLoom`: `"name"` or `"name@namespace"`). */
  async give(id: string, threadId: string, request: ThreadGiveRequest, options?: RequestOptions): Promise<WeaveResult> {
    return this.threadAction(id, threadId, "give", request, "ThreadGiveRequest", "WeaveResult", options);
  }

  /** Erases one thread (Tenant.Admin). */
  async deleteThread(id: string, threadId: string, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "DELETE",
      path: `/looms/by-id/${seg(id)}/threads/by-id/${seg(threadId)}`,
      response: "void",
      options,
    });
  }

  /** Seeds this loom from another (`fromLoomId`, or `fromLoom` by name). */
  async seed(id: string, request: LoomSeedRequest, options?: RequestOptions): Promise<LoomSeeding> {
    return this.request({
      method: "PUT",
      path: `/looms/by-id/${seg(id)}/seed`,
      body: request,
      bodyType: "LoomSeedRequest",
      response: "LoomSeeding",
      idempotent: false,
      options,
    });
  }

  /** Reflects on a topic across the loom's threads (runs a model). Never retried. */
  async reflect(id: string, request: { topic: string }, options?: RequestOptions): Promise<LoomReflection> {
    return this.request({
      method: "PUT",
      path: `/looms/by-id/${seg(id)}/reflect`,
      body: request,
      bodyType: "LoomReflectRequest",
      response: "LoomReflection",
      idempotent: false,
      options,
    });
  }

  /** Asks for a night weave now (it runs in the background). Never retried. */
  async nightWeave(id: string, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "PUT",
      path: `/looms/by-id/${seg(id)}/night-weave`,
      response: "void",
      idempotent: false,
      options,
    });
  }

  /** The loom's recent night weavings. */
  async nightWeavings(id: string, query?: { limit?: number }, options?: RequestOptions): Promise<NightWeaving[]> {
    return this.request({
      method: "GET",
      path: `/looms/by-id/${seg(id)}/night-weavings`,
      query: { limit: query?.limit },
      response: "NightWeaving[]",
      options,
    });
  }

  /** Night weavings of every loom since an instant. */
  async nightWeavingsSince(query: { since: Date | string; limit?: number }, options?: RequestOptions): Promise<NightWeaving[]> {
    return this.request({
      method: "GET",
      path: "/looms/night-weavings",
      query: { since: query.since, limit: query.limit },
      response: "NightWeaving[]",
      options,
    });
  }

  /** What an agent would be shown from the loom (a preview of its tapestry). */
  async tapestry(
    id: string,
    query?: { subjects?: string[]; agentName?: string; tokens?: number },
    options?: RequestOptions,
  ): Promise<TapestryPreview> {
    return this.request({
      method: "GET",
      path: `/looms/by-id/${seg(id)}/tapestry`,
      query: { subjects: query?.subjects, agentName: query?.agentName, tokens: query?.tokens },
      response: "TapestryPreview",
      options,
    });
  }

  /** The tapestry panels shown to agents. */
  async panels(id: string, query?: { limit?: number }, options?: RequestOptions): Promise<TapestryPanel[]> {
    return this.request({
      method: "GET",
      path: `/looms/by-id/${seg(id)}/panels`,
      query: { limit: query?.limit },
      response: "TapestryPanel[]",
      options,
    });
  }

  /** The sessions that wove into the loom. */
  async sessions(id: string, query?: { limit?: number }, options?: RequestOptions): Promise<LoomSession[]> {
    return this.request({
      method: "GET",
      path: `/looms/by-id/${seg(id)}/sessions`,
      query: { limit: query?.limit },
      response: "LoomSession[]",
      options,
    });
  }

  /** Contradictions between threads. */
  async tensions(id: string, query?: { open?: boolean; limit?: number }, options?: RequestOptions): Promise<LoomTensionView[]> {
    return this.request({
      method: "GET",
      path: `/looms/by-id/${seg(id)}/tensions`,
      query: { open: query?.open, limit: query?.limit },
      response: "LoomTensionView[]",
      options,
    });
  }

  /** Resolves a tension. */
  async resolveTension(id: string, tensionId: string, request: { resolution: string }, options?: RequestOptions): Promise<LoomTensionView> {
    return this.request({
      method: "PUT",
      path: `/looms/by-id/${seg(id)}/tensions/by-id/${seg(tensionId)}/resolve`,
      body: request,
      bodyType: "TensionResolveRequest",
      response: "LoomTensionView",
      options,
    });
  }

  /** The codebase patterns the loom has learnt. */
  async patterns(id: string, query?: { limit?: number }, options?: RequestOptions): Promise<LoomPattern[]> {
    return this.request({
      method: "GET",
      path: `/looms/by-id/${seg(id)}/patterns`,
      query: { limit: query?.limit },
      response: "LoomPattern[]",
      options,
    });
  }

  /** One codebase's pattern. Throws `NotFoundError` when there is none. */
  async pattern(id: string, codebase: string, options?: RequestOptions): Promise<LoomPattern> {
    return this.request({
      method: "GET",
      path: `/looms/by-id/${seg(id)}/patterns/by-name/${seg(codebase)}`,
      response: "LoomPattern",
      options,
    });
  }

  /** Changes a codebase's pattern (adds or removes heuristics, key files, conventions). */
  async shapePattern(id: string, codebase: string, change: PatternChange, options?: RequestOptions): Promise<LoomPattern> {
    return this.request({
      method: "PUT",
      path: `/looms/by-id/${seg(id)}/patterns/by-name/${seg(codebase)}`,
      body: change,
      bodyType: "PatternChange",
      response: "LoomPattern",
      options,
    });
  }

  /** Erases a codebase's pattern (Tenant.Admin). */
  async deletePattern(id: string, codebase: string, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "DELETE",
      path: `/looms/by-id/${seg(id)}/patterns/by-name/${seg(codebase)}`,
      response: "void",
      options,
    });
  }

  private threadAction<T>(
    id: string,
    threadId: string,
    action: string,
    body: unknown,
    bodyType: string,
    response: string,
    options: RequestOptions | undefined,
    idempotent = false,
  ): Promise<T> {
    return this.request({
      method: "PUT",
      path: `/looms/by-id/${seg(id)}/threads/by-id/${seg(threadId)}/${action}`,
      body,
      bodyType,
      response,
      idempotent,
      options,
    });
  }
}
