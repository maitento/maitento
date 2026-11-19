import { ApiKeyAuth, JwtAuth, parseApiKey, type ApiKeyCredential, type AuthProvider, type AuthTransport } from "./core/auth.js";
import { readEnv } from "./core/env.js";
import { MaitentoError } from "./core/errors.js";
import { DEFAULT_MAX_RATE_LIMIT_RETRIES, HttpClient } from "./core/http.js";
import { Events, type WebSocketImplementation } from "./events.js";
import type { AuthenticateResponse, BuildResponse } from "./models.js";
import { Agents } from "./resources/agents.js";
import { AppRuns, Apps, CapsuleRuns, Capsules } from "./resources/apps.js";
import { Automations } from "./resources/automations.js";
import { Builds, type BuildOptions, type DeployOptions, type ProjectSource } from "./resources/builds.js";
import { Connectors, Tools } from "./resources/connectors.js";
import { CredentialStacks, Credentials } from "./resources/credentials.js";
import { Files, Partitions } from "./resources/files.js";
import { InteractionRuns, Interactions } from "./resources/interactions.js";
import { Looms } from "./resources/looms.js";
import { ModelKeys, Models, Tenant } from "./resources/models.js";
import { Namespaces } from "./resources/namespaces.js";
import { PipelineRuns, Pipelines } from "./resources/pipelines.js";
import { Runs } from "./resources/runs.js";
import { Secrets, Webhooks } from "./resources/secrets.js";
import type { ClientContext } from "./resources/shared.js";
import { Billing } from "./resources/billing.js";
import { Usage } from "./resources/usage.js";
import { ApiKeys, Invitations, Users } from "./resources/users.js";
import { Vfs } from "./resources/vfs.js";

export const DEFAULT_BASE_URL = "https://api.maitento.com";
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_RETRIES = 2;
export { DEFAULT_MAX_RATE_LIMIT_RETRIES };

/** How to build a {@link Maitento} client. Every option is optional when the environment variables are set. */
export interface MaitentoOptions {
  /**
   * An API key: `"<userId>:<secret>"` (as the portal shows it) or `{ userId, secret }`. The id is the USER's id,
   * not the key's. Defaults to `MAITENTO_API_KEY`.
   */
  apiKey?: string | ApiKeyCredential;
  /** A JWT. The SDK renews it before it expires (`GET /auth/renew`). */
  token?: string;
  /** A callback that returns a JWT; asked again before the current one expires. */
  tokenProvider?: () => string | Promise<string>;
  /** E-mail address for a password login (with `password`); the JWT it yields is renewed proactively. */
  email?: string;
  password?: string;
  /** The API. Defaults to `MAITENTO_BASE_URL`, else `https://api.maitento.com`. */
  baseUrl?: string;
  /** The namespace by-name calls use when they are not given one. Defaults to `MAITENTO_NAMESPACE`. */
  namespace?: string;
  /** Per-call timeout in milliseconds (each call can override it). Default 120 000. */
  timeout?: number;
  /** Retries of an idempotent call on a network error, 502, 503 or 504. Default 2. Starts are never retried. */
  maxRetries?: number;
  /**
   * Times an idempotent call waits out a 429 and is sent again: `Retry-After` when the answer gives one, else 1, 2, 4,
   * 8, 16 and 32 seconds, over a minute in all. Default 6; 0 surfaces the first 429. Starts are never retried.
   */
  maxRateLimitRetries?: number;
  /** A `fetch` to use instead of the global one. */
  fetch?: typeof fetch;
  /** Appended to the `User-Agent` (server runtimes). */
  userAgent?: string;
  /**
   * The WebSocket for `events`. Node 22+, Bun, Deno and browsers have one built in; on Node 20 install `ws` and pass
   * its `WebSocket` class.
   */
  webSocket?: WebSocketImplementation;
  /** Headers sent with every call. */
  defaultHeaders?: Record<string, string>;
}

function resolveAuth(options: MaitentoOptions, bare: HttpClient): AuthProvider {
  const given = [
    options.apiKey !== undefined,
    options.token !== undefined,
    options.tokenProvider !== undefined,
    options.email !== undefined || options.password !== undefined,
  ].filter(Boolean).length;
  if (given > 1) {
    throw new MaitentoError("Pass one credential: apiKey, token, tokenProvider, or email and password.");
  }
  if (options.email !== undefined || options.password !== undefined) {
    if (!options.email || !options.password) {
      throw new MaitentoError("A password login needs both email and password.");
    }
  }

  const transport: AuthTransport = {
    login: async (emailAddress, password, signal) => {
      const response = await bare.request<AuthenticateResponse>({
        method: "PUT",
        path: "/auth",
        body: { emailAddress, password },
        bodyType: "AuthenticateRequest",
        response: "AuthenticateResponse",
        authenticate: false,
        // A login changes nothing on the server: safe to retry on a network error.
        idempotent: true,
        options: { signal },
      });
      return response.authenticationToken;
    },
    renew: async (token, signal) => {
      const response = await bare.request<AuthenticateResponse>({
        method: "GET",
        path: "/auth/renew",
        response: "AuthenticateResponse",
        authorization: `Bearer ${token}`,
        options: { signal },
      });
      return response.authenticationToken;
    },
  };

  if (options.token !== undefined) {
    if (!options.token) throw new MaitentoError("The token is empty.");
    return new JwtAuth({ type: "static", token: options.token }, transport);
  }
  if (options.tokenProvider) {
    return new JwtAuth({ type: "provider", provider: options.tokenProvider }, transport);
  }
  if (options.email && options.password) {
    return new JwtAuth({ type: "password", emailAddress: options.email, password: options.password }, transport);
  }
  const apiKey = options.apiKey ?? readEnv("MAITENTO_API_KEY");
  if (apiKey === undefined) {
    throw new MaitentoError(
      "No credential: pass apiKey (or token, or email and password), or set MAITENTO_API_KEY to \"<userId>:<secret>\".",
    );
  }
  return new ApiKeyAuth(parseApiKey(apiKey));
}

/**
 * The Maitento client.
 *
 * ```ts
 * const mt = new Maitento();                       // reads MAITENTO_API_KEY, MAITENTO_BASE_URL, MAITENTO_NAMESPACE
 * await mt.deploy("./maitento");                   // the resource project folder
 * const run = await mt.interactions.run("hello");  // start, wait, return the finished run
 * console.log(run.output);
 * ```
 */
export class Maitento {
  /** The API the client talks to. */
  readonly baseUrl: string;
  /** The default namespace of by-name calls, if any. */
  readonly namespace: string | undefined;

  /** Namespaces. */
  readonly namespaces: Namespaces;
  /** The AI model catalogue. */
  readonly models: Models;
  /** The tenant's own provider keys. */
  readonly modelKeys: ModelKeys;
  /** The tenant's credentials: provider keys and subscription sign-ins, with their models, endpoint and health. */
  readonly credentials: Credentials;
  /** Credential stacks (the ordered credentials a run may use), and the tenant's and each namespace's default. */
  readonly credentialStacks: CredentialStacks;
  /** Agents. */
  readonly agents: Agents;
  /** Interactions, and `run()` to start one and wait for it. */
  readonly interactions: Interactions;
  /** Interaction runs: messages, approvals, votes, transcripts. */
  readonly interactionRuns: InteractionRuns;
  /** Apps (Cogniscript programs). */
  readonly apps: Apps;
  /** App runs. */
  readonly appRuns: AppRuns;
  /** Capsules (sandboxed containers). */
  readonly capsules: Capsules;
  /** Capsule runs: commands, mounts, packages, users. */
  readonly capsuleRuns: CapsuleRuns;
  /** Code pipelines. */
  readonly pipelines: Pipelines;
  /** Code-pipeline runs. */
  readonly pipelineRuns: PipelineRuns;
  /** Runs of every kind: paged listing, kill, retention. */
  readonly runs: Runs;
  /** Connectors (the endpoints tools call). */
  readonly connectors: Connectors;
  /** Tools ("external operations"). */
  readonly tools: Tools;
  /** Secrets. */
  readonly secrets: Secrets;
  /** Web-hook registrations. */
  readonly webhooks: Webhooks;
  /** Knowledge partitions. */
  readonly partitions: Partitions;
  /** Knowledge files. */
  readonly files: Files;
  /** Virtual file systems. */
  readonly vfs: Vfs;
  /** Looms (agent memory). */
  readonly looms: Looms;
  /** Automations (schedules and triggers). */
  readonly automations: Automations;
  /** Validate, deploy and the build history. */
  readonly builds: Builds;
  /** Usage and cost analytics. */
  readonly usage: Usage;
  /** The tenant's plan, balance, billing notices and balance settings. */
  readonly billing: Billing;
  /** Users of the tenant, and `self()`. */
  readonly users: Users;
  /** The caller's API keys (JWT only). */
  readonly apiKeys: ApiKeys;
  /** Invitations. */
  readonly invitations: Invitations;
  /** The caller's tenant: retention, web access, model access. */
  readonly tenant: Tenant;
  /** Live events over the `/notifications` WebSocket. */
  readonly events: Events;

  private readonly auth: AuthProvider;

  constructor(options: MaitentoOptions = {}) {
    this.baseUrl = (options.baseUrl ?? readEnv("MAITENTO_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.namespace = options.namespace ?? readEnv("MAITENTO_NAMESPACE");
    const fetchImpl = options.fetch ?? (typeof fetch === "function" ? fetch.bind(globalThis) : undefined);
    if (!fetchImpl) {
      throw new MaitentoError("No fetch is available: pass one as the `fetch` option.");
    }
    const config = {
      baseUrl: this.baseUrl,
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      maxRateLimitRetries: options.maxRateLimitRetries ?? DEFAULT_MAX_RATE_LIMIT_RETRIES,
      fetch: fetchImpl,
      userAgent: options.userAgent,
      defaultHeaders: options.defaultHeaders,
    };
    this.auth = resolveAuth(options, new HttpClient(config));
    const http = new HttpClient({ ...config, auth: this.auth });
    this.events = new Events({ baseUrl: this.baseUrl, auth: this.auth, webSocket: options.webSocket });

    const ctx: ClientContext = {
      http,
      events: this.events,
      namespace: (explicit?: string) => {
        const namespace = explicit ?? this.namespace;
        if (!namespace) {
          throw new MaitentoError(
            "No namespace: pass { namespace }, or set the client's `namespace` option or MAITENTO_NAMESPACE.",
          );
        }
        return namespace;
      },
    };

    this.namespaces = new Namespaces(ctx);
    this.models = new Models(ctx);
    this.modelKeys = new ModelKeys(ctx);
    this.credentials = new Credentials(ctx);
    this.credentialStacks = new CredentialStacks(ctx);
    this.agents = new Agents(ctx);
    this.interactions = new Interactions(ctx);
    this.interactionRuns = new InteractionRuns(ctx);
    this.apps = new Apps(ctx);
    this.appRuns = new AppRuns(ctx);
    this.capsules = new Capsules(ctx);
    this.capsuleRuns = new CapsuleRuns(ctx);
    this.pipelines = new Pipelines(ctx);
    this.pipelineRuns = new PipelineRuns(ctx);
    this.runs = new Runs(ctx);
    this.connectors = new Connectors(ctx);
    this.tools = new Tools(ctx);
    this.secrets = new Secrets(ctx);
    this.webhooks = new Webhooks(ctx);
    this.partitions = new Partitions(ctx);
    this.files = new Files(ctx);
    this.vfs = new Vfs(ctx);
    this.looms = new Looms(ctx);
    this.automations = new Automations(ctx);
    this.builds = new Builds(ctx);
    this.usage = new Usage(ctx);
    this.billing = new Billing(ctx);
    this.users = new Users(ctx);
    this.apiKeys = new ApiKeys(ctx);
    this.invitations = new Invitations(ctx);
    this.tenant = new Tenant(ctx);
  }

  /**
   * Deploys a resource project — a folder (server runtimes) or `{ "agents/x.mtr": "…" }` — into the namespace.
   * Throws `BuildFailedError` when it does not compile. Deploying needs a tenant admin: anyone else is refused with a 403, code `api:builds:deploy-requires-admin`. Same as `builds.deploy`.
   */
  deploy(project: ProjectSource, options?: DeployOptions): Promise<BuildResponse> {
    return this.builds.deploy(project, options);
  }

  /** Validates a resource project without deploying it. Same as `builds.validate`. */
  validate(project: ProjectSource, options?: BuildOptions): Promise<BuildResponse> {
    return this.builds.validate(project, options);
  }

  /** Closes the client's event streams and stops background token renewal. */
  async close(): Promise<void> {
    this.auth.close();
    await this.events.closeAll();
  }
}
