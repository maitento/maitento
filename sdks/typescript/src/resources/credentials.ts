import { seg } from "../core/http.js";
import type { CredentialEndpointKind, CredentialOAuthTool, ModelKeyProvider } from "../generated/enums.js";
import type {
  CredentialSignInFinishRequest,
  CredentialSignInResult,
  CredentialSignInStart,
  CredentialSignInStartRequest,
  CredentialSignInTokensRequest,
  CredentialStack,
  CredentialStackEntryInput,
  CredentialStackRequest,
  CredentialStackUsage,
  CredentialTestResult,
  DefaultCredentialStack,
  ModelCredential,
  ModelCredentialKeyRequest,
  ModelCredentialRequest,
} from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

/**
 * A Claude or Codex sign-in's tokens that you already hold. `idToken` is required for Codex. `name`, `description` and
 * `tag` name a new credential; replacing tokens keeps the credential's own. The tokens are write-only.
 */
export interface CredentialSignInTokens extends CredentialSignInTokensRequest {
  tool: CredentialOAuthTool;
  accessToken: string;
  refreshToken: string;
  expiresAtUtc: Date | string;
}

/** Narrowing `credentials.list` to one tag. */
export interface CredentialListQuery {
  /** Only the credentials with this tag. */
  tag?: string;
}

/**
 * A new API-key credential: a name, the provider, and at least one key. `models` (empty for any of the provider's
 * models), `endpoint` (none for the provider's public API), `description` and `tag` are optional.
 */
export interface CredentialCreateRequest extends ModelCredentialRequest {
  /** Unique within the tenant, 1–100 characters. */
  name: string;
  /** `Anthropic`, `OpenAi`, `DeepSeek`, `Gemini`, `Qwen`, `Glm` or `Kimi`. */
  provider: ModelKeyProvider;
  /**
   * One to ten keys, tried in this order. Each is `{ value }`: the provider API key. Write-only: it is never served
   * back, and only its `keyHint` (the last four characters) identifies it.
   */
  keys: ModelCredentialKeyRequest[];
}

/**
 * What a credential becomes: every field is replaced, so send the whole credential, not just what changed.
 *
 * `keys` is the full list, matched by id. Send an existing key as `{ id }` to keep it without sending its secret again,
 * `{ id, value }` to replace its secret (the value it already has keeps the key as it is), or `{ value }` to add a key.
 * A key you leave out is removed. A subscription
 * sign-in (`kind: "OAuth"`) takes no keys, endpoint or other provider: only its name, description, models and tag
 * change here.
 */
export interface CredentialUpdateRequest extends ModelCredentialRequest {
  name: string;
  provider: ModelKeyProvider;
}

/** Finishing a subscription sign-in that `credentials.startSignIn` started. */
export interface CredentialFinishSignInRequest extends CredentialSignInFinishRequest {
  /** The `signInId` that `startSignIn` returned. */
  signInId: string;
}

/**
 * One place in a credential stack: a credential of the tenant, and this stack's rules for it. The rules only narrow
 * what the credential allows, so the same credential can sit in several stacks with different rules.
 */
export interface CredentialStackEntryRequest extends CredentialStackEntryInput {
  /** A credential of the same tenant. */
  credentialId: string;
  /** Only these of the credential's models. Left out: all of them. */
  allowedModels?: string[] | null;
  /** Only when the credential's endpoint is one of these kinds (`Public`, `Foundry`, `AzureOpenAi`, `Custom`). Left out: any. */
  allowedEndpointKinds?: CredentialEndpointKind[] | null;
  /** A disabled entry keeps its place but is skipped. Default `true`. */
  enabled?: boolean;
}

/** A new credential stack: a name and its entries, in the order they're tried. */
export interface CredentialStackCreateRequest extends CredentialStackRequest {
  /** Unique within the tenant, 1–100 characters. A run can name the stack instead of giving its id. */
  name: string;
  /** One to twenty entries, in the order they're tried. */
  entries: CredentialStackEntryRequest[];
}

/** What a credential stack becomes: every field is replaced, entries included. */
export type CredentialStackUpdateRequest = CredentialStackCreateRequest;

/**
 * The tenant's own access to model providers. A credential holds a provider, one or more API keys (or, for
 * `kind: "OAuth"`, a coding agent's subscription sign-in), the models it may serve with any deployment names, an
 * optional endpoint and tag, and its health: a credential that keeps failing is switched off for a while (a circuit
 * breaker).
 *
 * Runs never name a credential: they use a credential stack of them (see `credentialStacks`). Keys are write-only:
 * they're accepted on create and update and never served, and `keyHint` (the last four characters) tells them apart.
 * Anyone in the tenant can read; creating, changing, testing, signing in and deleting need Tenant.Admin.
 */
export class Credentials extends Resource {
  /** Every credential of the tenant, by name; with `tag`, only those with that tag. */
  async list(query?: CredentialListQuery, options?: RequestOptions): Promise<ModelCredential[]> {
    return this.request({ method: "GET", path: "/credentials", query: { tag: query?.tag }, response: "ModelCredential[]", options });
  }

  /** The credential with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<ModelCredential> {
    return this.request({ method: "GET", path: `/credentials/by-id/${seg(id)}`, response: "ModelCredential", options });
  }

  /** The credential with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<ModelCredential | null> {
    return this.request({
      method: "GET",
      path: `/credentials/by-id/${seg(id)}`,
      response: "ModelCredential",
      notFound: "null",
      options,
    });
  }

  /**
   * Creates an API-key credential and returns it, with its id. Refused with `ValidationError` when the name is taken,
   * a key or the endpoint is invalid, or the plan's credential limit is reached.
   */
  async create(request: CredentialCreateRequest, options?: RequestOptions): Promise<ModelCredential> {
    return this.request({
      method: "POST",
      path: "/credentials",
      body: request,
      bodyType: "ModelCredentialRequest",
      response: "ModelCredential",
      options,
    });
  }

  /**
   * Replaces a credential's fields. Keys are matched by id: one sent as `{ id }` keeps its secret, and one left out is
   * removed. New keys or a new endpoint switch a credential its circuit breaker turned off back on.
   */
  async update(id: string, request: CredentialUpdateRequest, options?: RequestOptions): Promise<ModelCredential> {
    return this.request({
      method: "PUT",
      path: `/credentials/by-id/${seg(id)}`,
      body: request,
      bodyType: "ModelCredentialRequest",
      response: "ModelCredential",
      idempotent: true,
      options,
    });
  }

  /** Deletes a credential and takes it out of every stack that holds it. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/credentials/by-id/${seg(id)}`, response: "void", options });
  }

  /** Deletes every credential with this tag (and takes them out of their stacks), and returns how many it deleted. */
  async deleteByTag(tag: string, options?: RequestOptions): Promise<number> {
    return this.request({ method: "DELETE", path: "/credentials", query: { tag }, response: "integer", options });
  }

  /**
   * Tests a credential without running a model: each key lists the provider's models once at the credential's
   * endpoint. The test passes when every key does, and a passing test switches a credential its circuit breaker turned
   * off back on. Limited to a few a minute per tenant: beyond that it throws `RateLimitError`.
   */
  async test(id: string, options?: RequestOptions): Promise<CredentialTestResult> {
    return this.request({
      method: "POST",
      path: `/credentials/by-id/${seg(id)}/test`,
      response: "CredentialTestResult",
      options,
    });
  }

  /**
   * Tests a credential before saving it, so a failing one never has to exist: the same checks and calls as `test`, on
   * the keys in `request` (what `create` takes). Nothing is stored, and the result's `credentialId` is empty. Refused
   * with `create`'s codes, and shares `test`'s limit.
   */
  async testUnsaved(request: CredentialCreateRequest, options?: RequestOptions): Promise<CredentialTestResult> {
    return this.request({
      method: "POST",
      path: "/credentials/test",
      body: request,
      bodyType: "ModelCredentialRequest",
      response: "CredentialTestResult",
      options,
    });
  }

  /**
   * Starts signing a coding agent's subscription in as an OAuth credential: `"Claude"` (Claude Code, on a Claude Pro or
   * Max subscription) or `"Codex"` (on a ChatGPT subscription). Pass `{ credentialId }` to sign an existing one in again
   * (new tokens, same credential and stacks). Code pipelines run their agents on such a credential in place of an API
   * key.
   *
   * Signing in takes two steps. For Claude, the person opens `authorizeUrl`, signs in, and you pass the code Anthropic
   * shows to `finishSignIn`. For Codex, the person opens `verificationUrl` and enters `userCode`, and you call
   * `finishSignIn` every `pollIntervalSeconds` until it returns `Complete`. Either way, finish before `expiresAtUtc`.
   */
  async startSignIn(
    tool: CredentialOAuthTool,
    request?: CredentialSignInStartRequest,
    options?: RequestOptions,
  ): Promise<CredentialSignInStart> {
    return this.request({
      method: "POST",
      path: `/credentials/sign-in/${seg(tool.toLowerCase())}`,
      body: request ?? {},
      bodyType: "CredentialSignInStartRequest",
      response: "CredentialSignInStart",
      options,
    });
  }

  /**
   * Finishes a sign-in that `startSignIn` started. For Claude, pass the `code` Anthropic showed (as shown, `#` and all).
   * For Codex, pass no code and call again every `pollIntervalSeconds` while it returns `Pending`. Once it returns
   * `Complete`, `credential` is the saved credential; `name`, `description` and `tag` name a new one (a credential
   * signed in again keeps its own).
   */
  async finishSignIn(
    tool: CredentialOAuthTool,
    request: CredentialFinishSignInRequest,
    options?: RequestOptions,
  ): Promise<CredentialSignInResult> {
    return this.request({
      method: "POST",
      path: `/credentials/sign-in/${seg(tool.toLowerCase())}/finish`,
      body: request,
      bodyType: "CredentialSignInFinishRequest",
      response: "CredentialSignInResult",
      options,
    });
  }

  /**
   * Makes an OAuth credential from a sign-in whose tokens you already hold, such as one your own application signed in.
   * You keep them fresh: Maitento never refreshes them, so call `replaceSignInTokens` each time you refresh. Tenant
   * admins only. Never retried: a retry could make a second credential.
   */
  async importSignIn(tokens: CredentialSignInTokens, options?: RequestOptions): Promise<ModelCredential> {
    return this.request({
      method: "POST",
      path: "/credentials/sign-in-tokens",
      body: tokens,
      bodyType: "CredentialSignInTokensRequest",
      response: "ModelCredential",
      options,
    });
  }

  /**
   * Replaces the tokens of a credential made by `importSignIn`, after you refreshed them. A sign-in made through
   * `startSignIn` is refused with `api:credentials:sign-in-refreshed-here`: Maitento refreshes those itself.
   */
  async replaceSignInTokens(id: string, tokens: CredentialSignInTokens, options?: RequestOptions): Promise<ModelCredential> {
    return this.request({
      method: "PUT",
      path: `/credentials/by-id/${seg(id)}/sign-in-tokens`,
      body: tokens,
      bodyType: "CredentialSignInTokensRequest",
      response: "ModelCredential",
      idempotent: true,
      options,
    });
  }
}

/**
 * Credential stacks: ordered lists of the tenant's credentials, each entry with its own rules. For each model call a
 * run tries the entries in order, skipping any whose rules or models don't fit the model, and moving to the next when
 * one is rate-limited, failing or refused.
 *
 * A run uses the stack named when it was started, else its definition's, else its namespace's default, else the
 * tenant's default, and never Maitento's own keys. It keeps a snapshot of the stack, so editing a stack never changes a
 * run already going. Anyone in the tenant can read; changing needs Tenant.Admin.
 */
export class CredentialStacks extends Resource {
  /** Every credential stack of the tenant. */
  async list(options?: RequestOptions): Promise<CredentialStack[]> {
    return this.request({ method: "GET", path: "/credential-stacks", response: "CredentialStack[]", options });
  }

  /** The stack with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<CredentialStack> {
    return this.request({ method: "GET", path: `/credential-stacks/by-id/${seg(id)}`, response: "CredentialStack", options });
  }

  /**
   * Where the stack is used: whether it's the tenant's default, the namespaces whose default it is, and the knowledge
   * bases that embed with it. While any of these use it, it can't be deleted.
   */
  async usage(id: string, options?: RequestOptions): Promise<CredentialStackUsage> {
    return this.request({ method: "GET", path: `/credential-stacks/by-id/${seg(id)}/usage`, response: "CredentialStackUsage", options });
  }

  /** The stack with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<CredentialStack | null> {
    return this.request({
      method: "GET",
      path: `/credential-stacks/by-id/${seg(id)}`,
      response: "CredentialStack",
      notFound: "null",
      options,
    });
  }

  /** The stack with this name (unique in the tenant), or `null`. */
  async findByName(name: string, options?: RequestOptions): Promise<CredentialStack | null> {
    return this.request({
      method: "GET",
      path: `/credential-stacks/by-name/${seg(name)}`,
      response: "CredentialStack",
      notFound: "null",
      options,
    });
  }

  /**
   * Creates a stack and returns it, with its id. Refused with `ValidationError` when the name is taken, an entry names a
   * credential the tenant hasn't got, or the plan's stack limit is reached.
   */
  async create(request: CredentialStackCreateRequest, options?: RequestOptions): Promise<CredentialStack> {
    return this.request({
      method: "POST",
      path: "/credential-stacks",
      body: request,
      bodyType: "CredentialStackRequest",
      response: "CredentialStack",
      options,
    });
  }

  /** Replaces a stack's name, description and entries. Runs already going keep the version they started with. */
  async update(id: string, request: CredentialStackUpdateRequest, options?: RequestOptions): Promise<CredentialStack> {
    return this.request({
      method: "PUT",
      path: `/credential-stacks/by-id/${seg(id)}`,
      body: request,
      bodyType: "CredentialStackRequest",
      response: "CredentialStack",
      idempotent: true,
      options,
    });
  }

  /** Deletes a stack. Refused with `ValidationError` while it's the tenant's or a namespace's default. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/credential-stacks/by-id/${seg(id)}`, response: "void", options });
  }

  /** The tenant's default stack: the one runs use when neither their start, definition nor namespace names one. */
  async getTenantDefault(options?: RequestOptions): Promise<DefaultCredentialStack> {
    return this.request({
      method: "GET",
      path: "/tenants/self/default-credential-stack",
      response: "DefaultCredentialStack",
      options,
    });
  }

  /** Sets the tenant's default stack, by id; `null` clears it. */
  async setTenantDefault(credentialStackId: string | null, options?: RequestOptions): Promise<DefaultCredentialStack> {
    return this.request({
      method: "PUT",
      path: "/tenants/self/default-credential-stack",
      body: { credentialStackId },
      bodyType: "DefaultCredentialStackInput",
      response: "DefaultCredentialStack",
      idempotent: true,
      options,
    });
  }

  /** A namespace's default stack: the one runs of its definitions use when neither their start nor definition names one. */
  async getNamespaceDefault(namespaceId: string, options?: RequestOptions): Promise<DefaultCredentialStack> {
    return this.request({
      method: "GET",
      path: `/namespaces/by-id/${seg(namespaceId)}/default-credential-stack`,
      response: "DefaultCredentialStack",
      options,
    });
  }

  /** Sets a namespace's default stack, by id; `null` clears it, so the tenant's default applies. */
  async setNamespaceDefault(
    namespaceId: string,
    credentialStackId: string | null,
    options?: RequestOptions,
  ): Promise<DefaultCredentialStack> {
    return this.request({
      method: "PUT",
      path: `/namespaces/by-id/${seg(namespaceId)}/default-credential-stack`,
      body: { credentialStackId },
      bodyType: "DefaultCredentialStackInput",
      response: "DefaultCredentialStack",
      idempotent: true,
      options,
    });
  }
}
