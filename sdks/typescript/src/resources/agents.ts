import { seg } from "../core/http.js";
import type { Agent, AgentCreateRequest, AgentUpdateRequest } from "../models.js";
import { Definitions } from "./definitions.js";
import { splitNamespace, type NamespaceOptions, type RequestOptions } from "./shared.js";

/** Agents: a model, standing instructions and the tools it may call. Usually deployed from `agents/*.mtr`. */
export class Agents extends Definitions<Agent> {
  protected readonly segment = "agents";
  protected readonly itemType = "Agent";

  /** Creates an agent (version 1) in the namespace. */
  async create(request: AgentCreateRequest, options?: NamespaceOptions): Promise<Agent> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "POST",
      path: this.namespacePath(namespace),
      body: request,
      bodyType: "AgentCreateRequest",
      response: "Agent",
      options: rest,
    });
  }

  /** Updates an agent: a new version when anything changed. */
  async update(id: string, request: AgentUpdateRequest, options?: RequestOptions): Promise<Agent> {
    return this.request({
      method: "PUT",
      path: `/agents/by-id/${seg(id)}`,
      body: request,
      bodyType: "AgentUpdateRequest",
      response: "Agent",
      idempotent: true,
      options,
    });
  }
}
