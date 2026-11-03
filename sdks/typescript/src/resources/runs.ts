import { seg } from "../core/http.js";
import { pages, type PagePromise } from "../core/paging.js";
import type { ProcessType } from "../generated/enums.js";
import type {
  ProcessDashboard,
  ProcessPage,
  ProcessRetentionStatus,
  ProcessSummary,
  RunLaneWait,
  WebUsageRecord,
} from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

/** Filters of `runs.list`. Every given filter must match. */
export interface RunListQuery {
  /** Up to 50 run ids. */
  ids?: string[];
  /** Process types: `Interaction`, `App`, `Capsule`, `CodePipeline`. */
  types?: ProcessType[];
  /** `Active`, `Waiting` or `Terminal`. */
  state?: "Active" | "Waiting" | "Terminal" | (string & {});
  /** Raw, type-specific statuses (`Running`, `Finished`, …). */
  statuses?: string[];
  definitionId?: string;
  namespaceId?: string;
  /** Namespace names. */
  namespace?: string | string[];
  rootProcessId?: string;
  parentProcessId?: string;
  resumeFromProcessId?: string;
  /** Only runs with (or without) a retention lease. */
  retained?: boolean;
  createdAfter?: Date | string;
  createdBefore?: Date | string;
  /** Page size, 1–200 (default 50). */
  limit?: number;
  /** Start from this cursor instead of the first page. */
  cursor?: string;
}

/** Runs of every kind: list and page through them, read one, kill, keep or release. */
export class Runs extends Resource {
  /**
   * Runs, newest first, as compact summaries. Await it for the first page, or iterate every run:
   * `for await (const run of mt.runs.list({ state: "Active" })) { … }`.
   */
  list(query?: RunListQuery, options?: RequestOptions): PagePromise<ProcessSummary> {
    const csv = (values: readonly string[] | undefined): string | undefined =>
      values && values.length ? values.join(",") : undefined;
    return pages<ProcessSummary>(async (cursor) =>
      this.request<ProcessPage>({
        method: "GET",
        path: "/processes",
        query: {
          ids: csv(query?.ids),
          types: csv(query?.types),
          state: query?.state,
          statuses: csv(query?.statuses),
          definitionId: query?.definitionId,
          namespaceId: query?.namespaceId,
          namespace: query?.namespace,
          rootProcessId: query?.rootProcessId,
          parentProcessId: query?.parentProcessId,
          resumeFromProcessId: query?.resumeFromProcessId,
          retained: query?.retained,
          createdAfter: query?.createdAfter,
          createdBefore: query?.createdBefore,
          limit: query?.limit,
          cursor: cursor ?? query?.cursor,
        },
        response: "ProcessPage",
        options,
      }),
    );
  }

  /** One run of any kind, as a summary. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<ProcessSummary> {
    return this.request({ method: "GET", path: `/processes/by-id/${seg(id)}`, response: "ProcessSummary", options });
  }

  /** One run of any kind, as a summary, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<ProcessSummary | null> {
    return this.request({
      method: "GET",
      path: `/processes/by-id/${seg(id)}`,
      response: "ProcessSummary",
      notFound: "null",
      options,
    });
  }

  /** The runs dashboard: counts, active runs, failures, throughput and tokens over the last `hours` (1–168). */
  async summary(
    query?: { hours?: number; namespaceId?: string; namespace?: string | string[] },
    options?: RequestOptions,
  ): Promise<ProcessDashboard> {
    return this.request({
      method: "GET",
      path: "/processes/summary",
      query: { hours: query?.hours, namespaceId: query?.namespaceId, namespace: query?.namespace },
      response: "ProcessDashboard",
      options,
    });
  }

  /** Kills a run of any kind. */
  async kill(id: string, request: { type: ProcessType }, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "POST",
      path: `/processes/${seg(request.type)}/${seg(id)}/kill`,
      response: "void",
      idempotent: true,
      options,
    });
  }

  /** Whether a run is waiting for a lane before it starts: since when, why, and how many of your runs are ahead of it. */
  async lane(id: string, request: { type: ProcessType }, options?: RequestOptions): Promise<RunLaneWait> {
    return this.request({
      method: "GET",
      path: `/processes/${seg(request.type)}/${seg(id)}/lane`,
      response: "RunLaneWait",
      options,
    });
  }

  /** How long a run will be kept, and its retention lease. */
  async retention(id: string, request: { type: ProcessType }, options?: RequestOptions): Promise<ProcessRetentionStatus> {
    return this.request({
      method: "GET",
      path: `/processes/${seg(request.type)}/${seg(id)}/retention-lease`,
      response: "ProcessRetentionStatus",
      options,
    });
  }

  /** Keeps a run (and the runs under it) until released. Idempotent. */
  async retain(id: string, request: { type: ProcessType; note?: string | null }, options?: RequestOptions): Promise<ProcessRetentionStatus> {
    return this.request({
      method: "PUT",
      path: `/processes/${seg(request.type)}/${seg(id)}/retention-lease`,
      body: { note: request.note ?? null },
      bodyType: "ProcessRetentionLeaseRequest",
      response: "ProcessRetentionStatus",
      idempotent: true,
      options,
    });
  }

  /** Releases a run's retention lease: it is then cleared up like any other. */
  async release(id: string, request: { type: ProcessType }, options?: RequestOptions): Promise<ProcessRetentionStatus> {
    return this.request({
      method: "DELETE",
      path: `/processes/${seg(request.type)}/${seg(id)}/retention-lease`,
      response: "ProcessRetentionStatus",
      options,
    });
  }

  /** The metered web searches and fetches a run made. */
  async webUsage(id: string, options?: RequestOptions): Promise<WebUsageRecord[]> {
    return this.request({
      method: "GET",
      path: `/web/usage/by-process/${seg(id)}`,
      response: "WebUsageRecord[]",
      options,
    });
  }
}
