import { seg } from "../core/http.js";
import { BuildFailedError } from "../core/errors.js";
import { pages, type PagePromise } from "../core/paging.js";
import { readProjectFolder } from "../deploy/node.js";
import { buildRequestFromProject, type ProjectFiles } from "../deploy/project.js";
import type { BuildOutcome } from "../generated/enums.js";
import type { BuildRecord, BuildRecordPage, BuildRecordSummary, BuildRequest, BuildResponse } from "../models.js";
import { Resource, splitNamespace, type NamespaceOptions, type RequestOptions } from "./shared.js";

/** A resource project: a folder path (server runtimes), or the files themselves (`{ "agents/x.mtr": "…" }`). */
export type ProjectSource = string | ProjectFiles;

export interface BuildOptions extends NamespaceOptions {
  /**
   * Hears what `mt` would print and skip: an app folder with no `.mtc`, a pipeline folder with no definition, a hook
   * whose include does not resolve. Those parts are left out of the build, exactly as `mt deploy` leaves them out.
   */
  onWarning?: (message: string) => void;
}

export interface DeployOptions extends BuildOptions {
  /** `false` resolves with a failed build's response instead of throwing `BuildFailedError`. */
  throwOnFailure?: boolean;
}

/** Filters of `builds.list`. */
export interface BuildListQuery {
  /** One namespace (`GET /namespaces/{namespace}/builds`). */
  namespace?: string;
  /** Several namespaces (`GET /builds?namespace=…`). */
  namespaces?: string[];
  outcome?: BuildOutcome;
  /** Only deploys (true) or only validations (false). */
  isDeploy?: boolean;
  /** Page size, 1–200 (default 50). */
  limit?: number;
  cursor?: string;
}

/** Builds: validate or deploy a resource project, and the build history. */
export class Builds extends Resource {
  /**
   * Compiles the project and checks every reference, then rolls everything back. Compile errors are in the
   * response (`isSuccess: false`, `log`), never thrown.
   */
  async validate(project: ProjectSource, options?: BuildOptions): Promise<BuildResponse> {
    const { onWarning, ...rest } = options ?? {};
    return this.submit(buildRequestFromProject(await load(project), false, onWarning), rest);
  }

  /**
   * Compiles and deploys the project into the namespace (creating the namespace if needed): each changed
   * definition gets a new version. Throws `BuildFailedError` when the sources do not compile (nothing is deployed).
   * Deploying needs a tenant admin: anyone else is refused with a 403, code `api:builds:deploy-requires-admin`. `validate` works for every member. Never retried.
   */
  async deploy(project: ProjectSource, options?: DeployOptions): Promise<BuildResponse> {
    const { throwOnFailure, onWarning, ...rest } = options ?? {};
    const response = await this.submit(buildRequestFromProject(await load(project), true, onWarning), rest);
    if (!response.isSuccess && throwOnFailure !== false) {
      const errors = response.log
        .filter((entry) => entry.logLevel === "Error")
        .map((entry) => ({ text: entry.text, filename: entry.filename, lineNumber: entry.lineNumber }));
      throw new BuildFailedError(response, errors);
    }
    return response;
  }

  /** Sends a build request you assembled yourself (`isDeploy` decides validate or deploy). Never retried. */
  async submit(request: BuildRequest, options?: NamespaceOptions): Promise<BuildResponse> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "PUT",
      path: `/namespaces/${seg(this.ns(namespace))}/build`,
      body: request,
      bodyType: "BuildRequest",
      response: "BuildResponse",
      idempotent: false,
      options: rest,
    });
  }

  /** The build history, newest first: await it for the first page, or iterate every build. */
  list(query?: BuildListQuery, options?: RequestOptions): PagePromise<BuildRecordSummary> {
    return pages<BuildRecordSummary>(async (cursor) =>
      this.request<BuildRecordPage>({
        method: "GET",
        path: query?.namespace ? `/namespaces/${seg(query.namespace)}/builds` : "/builds",
        query: {
          namespace: query?.namespace ? undefined : query?.namespaces,
          outcome: query?.outcome,
          isDeploy: query?.isDeploy,
          limit: query?.limit,
          cursor: cursor ?? query?.cursor,
        },
        response: "BuildRecordPage",
        options,
      }),
    );
  }

  /** One build: manifest, sources, log, what it deployed. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<BuildRecord> {
    return this.request({ method: "GET", path: `/builds/by-id/${seg(id)}`, response: "BuildRecord", options });
  }

  /** One build, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<BuildRecord | null> {
    return this.request({
      method: "GET",
      path: `/builds/by-id/${seg(id)}`,
      response: "BuildRecord",
      notFound: "null",
      options,
    });
  }

  /** Deletes a build record (Tenant.Admin). */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/builds/by-id/${seg(id)}`, response: "void", options });
  }
}

async function load(project: ProjectSource): Promise<ProjectFiles> {
  return typeof project === "string" ? readProjectFolder(project) : project;
}
