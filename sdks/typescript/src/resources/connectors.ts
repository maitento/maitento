import { seg } from "../core/http.js";
import type {
  Connector,
  ExternalOperation,
  McpConnector,
  McpConnectorCreateRequest,
  McpExternalOperation,
  McpExternalOperationCreateRequest,
  OpenApiConnector,
  OpenApiConnectorCreateRequest,
  OpenApiExternalOperation,
  OpenApiExternalOperationCreateRequest,
} from "../models.js";
import { Definitions } from "./definitions.js";
import { splitNamespace, type NamespaceOptions, type RequestOptions } from "./shared.js";

/** An OpenAPI connector, where `httpMethod` may also be given as a plain string (`"POST"`). */
export interface OpenApiConnectorCreate extends Omit<OpenApiConnectorCreateRequest, "httpMethod"> {
  /** The HTTP method Maitento calls your endpoint with: `"POST"` (or the wire's `{ method: "POST" }`). */
  httpMethod: string | { method?: string };
}

abstract class VersionedDefinitions<T> extends Definitions<T> {
  /** Disables one version: everything pinned to it fails closed. */
  async disableVersion(id: string, version: number, options?: RequestOptions): Promise<T> {
    return this.request({
      method: "POST",
      path: `/${this.segment}/by-id/${seg(id)}/versions/${seg(version)}/disable`,
      response: this.itemType,
      idempotent: true,
      options,
    });
  }

  /** Enables a disabled version again. */
  async enableVersion(id: string, version: number, options?: RequestOptions): Promise<T> {
    return this.request({
      method: "POST",
      path: `/${this.segment}/by-id/${seg(id)}/versions/${seg(version)}/enable`,
      response: this.itemType,
      idempotent: true,
      options,
    });
  }
}

/**
 * Connectors: the HTTP endpoint (or MCP tool) a tool calls. Usually deployed from `connectors/open-api/*.mtr`.
 */
export class Connectors extends VersionedDefinitions<Connector> {
  protected readonly segment = "connectors";
  protected readonly itemType = "Connector";

  /** Creates an OpenAPI connector: one HTTP endpoint Maitento may call. */
  async createOpenApi(request: OpenApiConnectorCreate, options?: NamespaceOptions): Promise<OpenApiConnector> {
    const { namespace, rest } = splitNamespace(options);
    const httpMethod = typeof request.httpMethod === "string" ? { method: request.httpMethod } : request.httpMethod;
    return this.request({
      method: "POST",
      path: `${this.namespacePath(namespace)}/open-api`,
      body: { ...request, httpMethod },
      bodyType: "OpenApiConnectorCreateRequest",
      response: "OpenApiConnector",
      options: rest,
    });
  }

  /** Creates an MCP connector (it can be described and bound, but interactions cannot execute it today). */
  async createMcp(request: McpConnectorCreateRequest, options?: NamespaceOptions): Promise<McpConnector> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "POST",
      path: `${this.namespacePath(namespace)}/mcp`,
      body: request,
      bodyType: "McpConnectorCreateRequest",
      response: "McpConnector",
      options: rest,
    });
  }
}

/**
 * Tools ("external operations"): a connector plus fixed bindings and the guidance the model sees. Usually deployed
 * from `external-operations/open-api/*.mtr`.
 */
export class Tools extends VersionedDefinitions<ExternalOperation> {
  protected readonly segment = "external-operations";
  protected readonly itemType = "ExternalOperation";

  /** Creates a tool over an OpenAPI connector. */
  async createOpenApi(
    request: OpenApiExternalOperationCreateRequest,
    options?: NamespaceOptions,
  ): Promise<OpenApiExternalOperation> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "POST",
      path: `${this.namespacePath(namespace)}/open-api`,
      body: request,
      bodyType: "OpenApiExternalOperationCreateRequest",
      response: "OpenApiExternalOperation",
      options: rest,
    });
  }

  /** Creates a tool over an MCP connector. */
  async createMcp(request: McpExternalOperationCreateRequest, options?: NamespaceOptions): Promise<McpExternalOperation> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "POST",
      path: `${this.namespacePath(namespace)}/mcp`,
      body: request,
      bodyType: "McpExternalOperationCreateRequest",
      response: "McpExternalOperation",
      options: rest,
    });
  }
}
