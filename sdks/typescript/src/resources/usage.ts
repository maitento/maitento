import type { QueryValue } from "../core/http.js";
import type { UsageBreakdown, UsageRunPage, UsageSeries, UsageSummary } from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

type Many = string | string[];

/** The filters every usage query takes. Each list filter matches any of its values. */
export interface UsageFilter {
  /** Start of the window (inclusive). */
  from?: Date | string;
  /** End of the window. */
  to?: Date | string;
  namespace?: Many;
  /** Process type: `Interaction`, `App`, `Capsule`, `CodePipeline`. */
  type?: Many;
  definitionId?: Many;
  /** `"<definitionId>:<version>"`. */
  version?: Many;
  agent?: Many;
  provider?: Many;
  model?: Many;
  engine?: Many;
  credentialKind?: Many;
  tier?: Many;
  outcome?: Many;
  startedBy?: Many;
  triggerId?: Many;
  rootDefinitionId?: Many;
}

export interface UsageSeriesQuery extends UsageFilter {
  metric?: string;
  bucket?: string;
  groupBy?: string;
  top?: number;
}

export interface UsageBreakdownQuery extends UsageFilter {
  groupBy?: string;
  sort?: string;
  limit?: number;
}

export interface UsageRunsQuery extends UsageFilter {
  sort?: string;
  limit?: number;
}

function toQuery(filter: object | undefined): Record<string, QueryValue> {
  const result: Record<string, QueryValue> = {};
  for (const [key, value] of Object.entries(filter ?? {})) {
    result[key] = value as QueryValue;
  }
  return result;
}

/** Usage and cost analytics, from the run ledger (it outlives the runs themselves). */
export class Usage extends Resource {
  /** Totals for the window. */
  async summary(filter?: UsageFilter, options?: RequestOptions): Promise<UsageSummary> {
    return this.request({ method: "GET", path: "/usage/summary", query: toQuery(filter), response: "UsageSummary", options });
  }

  /** A time series of one metric, bucketed and optionally grouped. */
  async series(filter?: UsageSeriesQuery, options?: RequestOptions): Promise<UsageSeries> {
    return this.request({ method: "GET", path: "/usage/series", query: toQuery(filter), response: "UsageSeries", options });
  }

  /** Totals grouped by one dimension. */
  async breakdown(filter?: UsageBreakdownQuery, options?: RequestOptions): Promise<UsageBreakdown> {
    return this.request({
      method: "GET",
      path: "/usage/breakdown",
      query: toQuery(filter),
      response: "UsageBreakdown",
      options,
    });
  }

  /** Individual runs with their usage (`truncated` says more matched than were returned). */
  async runs(filter?: UsageRunsQuery, options?: RequestOptions): Promise<UsageRunPage> {
    return this.request({ method: "GET", path: "/usage/runs", query: toQuery(filter), response: "UsageRunPage", options });
  }
}
