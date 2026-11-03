import { seg } from "../core/http.js";
import type {
  Secret,
  SecretCreateRequest,
  SecretUpdateRequest,
  WebHookDelivery,
  WebHookRegistration,
  WebHookRegistrationCreateRequest,
  WebHookRegistrationUpdateRequest,
} from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

/**
 * Secrets: named values (API keys, tokens) tools authenticate with. Tenant-wide, not per namespace. Values are
 * write-only: you can set or replace one, never read it back.
 */
export class Secrets extends Resource {
  /** Every secret (names only, never values). */
  async list(options?: RequestOptions): Promise<Secret[]> {
    return this.request({ method: "GET", path: "/secrets", response: "Secret[]", options });
  }

  /** The secret with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<Secret> {
    return this.request({ method: "GET", path: `/secrets/by-id/${seg(id)}`, response: "Secret", options });
  }

  /** The secret with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<Secret | null> {
    return this.request({ method: "GET", path: `/secrets/by-id/${seg(id)}`, response: "Secret", notFound: "null", options });
  }

  /** The secret with this name. Throws `NotFoundError` when there is none. */
  async getByName(name: string, options?: RequestOptions): Promise<Secret> {
    return this.request({ method: "GET", path: `/secrets/by-name/${seg(name)}`, response: "Secret", options });
  }

  /** The secret with this name, or `null`. */
  async findByName(name: string, options?: RequestOptions): Promise<Secret | null> {
    return this.request({
      method: "GET",
      path: `/secrets/by-name/${seg(name)}`,
      response: "Secret",
      notFound: "null",
      options,
    });
  }

  /** Creates a secret. */
  async create(request: SecretCreateRequest, options?: RequestOptions): Promise<Secret> {
    return this.request({
      method: "POST",
      path: "/secrets",
      body: request,
      bodyType: "SecretCreateRequest",
      response: "Secret",
      options,
    });
  }

  /** Renames a secret and, when `value` is given, replaces its value. */
  async update(id: string, request: SecretUpdateRequest, options?: RequestOptions): Promise<Secret> {
    return this.request({
      method: "PUT",
      path: `/secrets/by-id/${seg(id)}`,
      body: request,
      bodyType: "SecretUpdateRequest",
      response: "Secret",
      idempotent: true,
      options,
    });
  }

  /** Deletes a secret. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/secrets/by-id/${seg(id)}`, response: "void", options });
  }
}

/** Registering a web hook: `headers` (sent verbatim with every delivery) is optional. */
export interface WebhookCreateRequest extends Omit<WebHookRegistrationCreateRequest, "headers"> {
  headers?: Record<string, string>;
}

/**
 * Web hooks: Maitento `PUT`s an entity's latest state to your URL each time it changes, signed with the registration's
 * secret in `X-MT-WebHook-Signature` (check it with `verifyWebhook`, read the body with `parseWebhook`).
 */
export class Webhooks extends Resource {
  /** Every registration (header values masked as `"********"`). */
  async list(options?: RequestOptions): Promise<WebHookRegistration[]> {
    return this.request({ method: "GET", path: "/web-hooks", response: "WebHookRegistration[]", options });
  }

  /** The registration with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<WebHookRegistration> {
    return this.request({ method: "GET", path: `/web-hooks/by-id/${seg(id)}`, response: "WebHookRegistration", options });
  }

  /** The registration with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<WebHookRegistration | null> {
    return this.request({
      method: "GET",
      path: `/web-hooks/by-id/${seg(id)}`,
      response: "WebHookRegistration",
      notFound: "null",
      options,
    });
  }

  /** Registers a URL for one entity type (one registration per URL and type). */
  async create(request: WebhookCreateRequest, options?: RequestOptions): Promise<WebHookRegistration> {
    return this.request({
      method: "POST",
      path: "/web-hooks",
      body: { ...request, headers: request.headers ?? {} },
      bodyType: "WebHookRegistrationCreateRequest",
      response: "WebHookRegistration",
      options,
    });
  }

  /**
   * Changes the URL, secret or headers. `headers` is the full set: a missing name is removed, `null` or `"********"`
   * keeps a stored value. Moving the URL to another origin needs the secret again.
   *
   * `signedOnly: true` stops a web hook registered before deliveries were signed from sending its secret in
   * `X-MT-WebHook-Secret`: from then on its deliveries are only signed. It can't be undone, so set it once your
   * receiver checks `X-MT-WebHook-Signature`. `false` or leaving it out changes nothing.
   */
  async update(id: string, request: WebHookRegistrationUpdateRequest, options?: RequestOptions): Promise<WebHookRegistration> {
    return this.request({
      method: "PUT",
      path: `/web-hooks/by-id/${seg(id)}`,
      body: request,
      bodyType: "WebHookRegistrationUpdateRequest",
      response: "WebHookRegistration",
      idempotent: true,
      options,
    });
  }

  /** Deletes a registration. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/web-hooks/by-id/${seg(id)}`, response: "void", options });
  }

  /** The registration's delivery log (sent deliveries are kept a day, permanent failures a week). */
  async deliveries(id: string, query?: { limit?: number }, options?: RequestOptions): Promise<WebHookDelivery[]> {
    return this.request({
      method: "GET",
      path: `/web-hooks/by-id/${seg(id)}/deliveries`,
      query: { limit: query?.limit },
      response: "WebHookDelivery[]",
      options,
    });
  }
}
