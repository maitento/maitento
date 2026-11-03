import { seg } from "../core/http.js";
import type {
  CodePipeline,
  CodePipelineCreateRequest,
  CodePipelineProcess,
  CodePipelineProcessCredentialsInput,
  CodePipelineProcessDiff,
  CodePipelineProcessDiffRaw,
  CodePipelineProcessPayloadsByIdsRequest,
  CodePipelineProcessPayloadsResponse,
  CodePipelineProcessRepoInput,
  CodePipelineProcessResumeWithPromptRequest,
  CodePipelineProcessStartRequestInput,
  CodePipelineUpdateRequest,
} from "../models.js";
import { follow, type ProcessKind, type RunOptions } from "../run.js";
import { Definitions } from "./definitions.js";
import {
  Resource,
  followDependencies,
  resolveTarget,
  splitNamespace,
  toNameValuePairs,
  type DefinitionTarget,
  type Inputs,
  type NamespaceOptions,
  type RequestOptions,
} from "./shared.js";

/** Starting a code-pipeline run: inputs (a list of pairs or a plain object), repos, credentials and limits. */
export interface PipelineStart extends Omit<CodePipelineProcessStartRequestInput, "inputs"> {
  inputs?: Inputs;
}

const PIPELINE_RUN: Omit<ProcessKind<CodePipelineProcess>, "fetch"> = {
  type: "CodePipeline",
  updatedEvent: "code-pipeline-process-updated",
  // The event carries a bounded summary; the run is re-read on each one.
  eventCarriesRun: false,
  waiting: new Set(["HumanInteractionRequired"]),
  failureDetails: (run) => (run.failureDetails?.trim() ? run.failureDetails : (run.failureReason ?? null)),
};

/** Code pipelines: multi-phase coding-agent workflows over git repos (deployed from `code-pipelines/<name>/`). */
export class Pipelines extends Definitions<CodePipeline> {
  protected readonly segment = "code-pipelines";
  protected readonly itemType = "CodePipeline";

  /** Creates a pipeline in the namespace. */
  async create(request: CodePipelineCreateRequest, options?: NamespaceOptions): Promise<CodePipeline> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "POST",
      path: this.namespacePath(namespace),
      body: request,
      bodyType: "CodePipelineCreateRequest",
      response: "CodePipeline",
      options: rest,
    });
  }

  /** Updates a pipeline (always a new version). */
  async update(id: string, request: CodePipelineUpdateRequest, options?: RequestOptions): Promise<CodePipeline> {
    return this.request({
      method: "PUT",
      path: `/code-pipelines/by-id/${seg(id)}`,
      body: request,
      bodyType: "CodePipelineUpdateRequest",
      response: "CodePipeline",
      options,
    });
  }

  /**
   * Starts a run of the pipeline's latest enabled version. Never retried; `launchIntentId` makes a deliberate
   * re-send safe (the server answers with the run that id already started).
   */
  async start(target: DefinitionTarget, request: PipelineStart, options?: RequestOptions): Promise<CodePipelineProcess> {
    const resolved = resolveTarget(target);
    const path =
      resolved.kind === "name"
        ? `/namespaces/${seg(this.ns(resolved.namespace))}/code-pipelines/by-name/${seg(resolved.name)}/start`
        : `/code-pipelines/processes/by-id/${seg(resolved.id)}/start`;
    return this.request({
      method: "PUT",
      path,
      body: { ...request, inputs: toNameValuePairs(request.inputs) },
      bodyType: "CodePipelineProcessStartRequestInput",
      response: "CodePipelineProcess",
      idempotent: false,
      options,
    });
  }

  /** Starts a run and follows it to the end (see `interactions.run`). */
  async run(
    target: DefinitionTarget,
    request: PipelineStart,
    options?: RunOptions<CodePipelineProcess>,
  ): Promise<CodePipelineProcess> {
    const started = await this.start(target, request, { signal: options?.signal });
    return follow(
      followDependencies(this.ctx),
      {
        ...PIPELINE_RUN,
        fetch: (id, signal) =>
          this.request({
            method: "GET",
            path: `/code-pipelines/processes/by-id/${seg(id)}`,
            response: "CodePipelineProcess",
            options: { signal },
          }),
      },
      started,
      options,
    );
  }
}

/** Code-pipeline runs: answer their questions, read their diff, kill, resume, restart. */
export class PipelineRuns extends Resource {
  /** Every pipeline run of the tenant (unbounded; prefer `runs.list({ types: ["CodePipeline"] })`). */
  async list(options?: RequestOptions): Promise<CodePipelineProcess[]> {
    return this.request({ method: "GET", path: "/code-pipelines/processes", response: "CodePipelineProcess[]", options });
  }

  /** Every pipeline run that has not finished. */
  async listActive(options?: RequestOptions): Promise<CodePipelineProcess[]> {
    return this.request({
      method: "GET",
      path: "/code-pipelines/processes/alive",
      response: "CodePipelineProcess[]",
      options,
    });
  }

  /** The run with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<CodePipelineProcess> {
    return this.request({
      method: "GET",
      path: `/code-pipelines/processes/by-id/${seg(id)}`,
      response: "CodePipelineProcess",
      options,
    });
  }

  /** The run with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<CodePipelineProcess | null> {
    return this.request({
      method: "GET",
      path: `/code-pipelines/processes/by-id/${seg(id)}`,
      response: "CodePipelineProcess",
      notFound: "null",
      options,
    });
  }

  /** Answers the question a run is waiting on. */
  async answer(id: string, request: { requestId: string; answer: string }, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "POST",
      path: `/code-pipelines/processes/by-id/${seg(id)}/answer`,
      body: request,
      bodyType: "CodePipelineProcessAnswerRequest",
      response: "void",
      options,
    });
  }

  /** The run's diff so far, or `null` when there is none yet. */
  async diff(id: string, options?: RequestOptions): Promise<CodePipelineProcessDiff | null> {
    return this.request({
      method: "GET",
      path: `/code-pipelines/processes/by-id/${seg(id)}/diff`,
      response: "CodePipelineProcessDiff",
      notFound: "null",
      options,
    });
  }

  /** The run's raw unified diff, or `null` when there is none yet. */
  async rawDiff(id: string, options?: RequestOptions): Promise<CodePipelineProcessDiffRaw | null> {
    return this.request({
      method: "GET",
      path: `/code-pipelines/processes/by-id/${seg(id)}/diff/raw`,
      response: "CodePipelineProcessDiffRaw",
      notFound: "null",
      options,
    });
  }

  /** Kills the run. */
  async kill(id: string, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "PUT",
      path: `/code-pipelines/processes/by-id/${seg(id)}/kill`,
      response: "void",
      idempotent: true,
      options,
    });
  }

  /** Resumes a stopped run where it left off. */
  async resume(id: string, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "PUT",
      path: `/code-pipelines/processes/by-id/${seg(id)}/resume`,
      response: "void",
      idempotent: false,
      options,
    });
  }

  /** Resumes a run with a continuation prompt. Returns the run as it was before the update: re-read it. */
  async resumeWithPrompt(
    id: string,
    request: CodePipelineProcessResumeWithPromptRequest,
    options?: RequestOptions,
  ): Promise<CodePipelineProcess> {
    return this.request({
      method: "PUT",
      path: `/code-pipelines/processes/by-id/${seg(id)}/resume-with-prompt`,
      body: request,
      bodyType: "CodePipelineProcessResumeWithPromptRequest",
      response: "CodePipelineProcess",
      idempotent: false,
      options,
    });
  }

  /** Starts a NEW run from this one's context. Never retried. */
  async restart(id: string, options?: RequestOptions): Promise<CodePipelineProcess> {
    return this.request({
      method: "PUT",
      path: `/code-pipelines/processes/by-id/${seg(id)}/restart`,
      response: "CodePipelineProcess",
      idempotent: false,
      options,
    });
  }

  /** Replaces the run's engine credentials (each `type` discriminator is sent first). */
  async updateCredentials(id: string, credentials: CodePipelineProcessCredentialsInput[], options?: RequestOptions): Promise<void> {
    return this.request({
      method: "PUT",
      path: `/code-pipelines/processes/by-id/${seg(id)}/credentials`,
      body: credentials,
      bodyType: "CodePipelineProcessCredentialsInput[]",
      response: "void",
      idempotent: true,
      options,
    });
  }

  /** Replaces the run's repos (each `type` discriminator is sent first). */
  async updateRepos(id: string, repos: CodePipelineProcessRepoInput[], options?: RequestOptions): Promise<void> {
    return this.request({
      method: "PUT",
      path: `/code-pipelines/processes/by-id/${seg(id)}/repos`,
      body: repos,
      bodyType: "CodePipelineProcessRepoInput[]",
      response: "void",
      idempotent: true,
      options,
    });
  }

  /** Full tool-use and context-entry payloads by id (an unknown run answers empty lists). */
  async payloads(
    id: string,
    request: CodePipelineProcessPayloadsByIdsRequest,
    options?: RequestOptions,
  ): Promise<CodePipelineProcessPayloadsResponse> {
    return this.request({
      method: "POST",
      path: `/code-pipelines/processes/by-id/${seg(id)}/payloads/by-ids`,
      body: request,
      bodyType: "CodePipelineProcessPayloadsByIdsRequest",
      response: "CodePipelineProcessPayloadsResponse",
      // A read with a body: safe to repeat.
      idempotent: true,
      options,
    });
  }

  /** The payloads of one step execution. */
  async stepPayloads(id: string, stepExecutionId: string, options?: RequestOptions): Promise<CodePipelineProcessPayloadsResponse> {
    return this.request({
      method: "GET",
      path: `/code-pipelines/processes/by-id/${seg(id)}/payloads/steps/${seg(stepExecutionId)}`,
      response: "CodePipelineProcessPayloadsResponse",
      options,
    });
  }
}
