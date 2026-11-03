import { seg } from "../core/http.js";
import type { ModelKeyProvider } from "../generated/enums.js";
import type {
  AiModel,
  TenantModelAccess,
  TenantModelKey,
  TenantModelKeyCreateRequest,
  TenantModelKeyUpdateRequest,
  TenantRetention,
  WebAccessSettings,
} from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

/** The AI model catalogue: the names an agent's `model = @ref("…")` can point at. */
export class Models extends Resource {
  /** Every model in the catalogue. */
  async list(options?: RequestOptions): Promise<AiModel[]> {
    return this.request({ method: "GET", path: "/ai-models", response: "AiModel[]", options });
  }
}

/** Adding a tenant model key: the provider's public name, a label and the provider API key. */
export interface ModelKeyCreateRequest extends TenantModelKeyCreateRequest {
  /** `Anthropic`, `OpenAi`, `DeepSeek`, `Gemini`, `Qwen`, `Glm` or `Kimi`. */
  provider: ModelKeyProvider;
  /** A name for the key, 1–100 characters. */
  label: string;
  /** The provider API key. Write-only: it is never served back. */
  apiKey: string;
}

/** Replacing a tenant model key's settings. The stored key is kept unless `apiKey` is given. */
export interface ModelKeyUpdateRequest extends TenantModelKeyUpdateRequest {
  label: string;
  priority: number;
  isDisabled: boolean;
}

/**
 * The tenant's own provider keys ("bring your own key"). A run that brings no key of its own uses the tenant's
 * enabled keys for the provider, lowest `priority` first. Creating, changing and deleting need Tenant.Admin.
 */
export class ModelKeys extends Resource {
  /** Every model key of the tenant (the secrets are never served; `keyHint` shows the last four characters). */
  async list(options?: RequestOptions): Promise<TenantModelKey[]> {
    return this.request({ method: "GET", path: "/tenants/self/model-keys", response: "TenantModelKey[]", options });
  }

  /** Stores a provider key. */
  async create(request: ModelKeyCreateRequest, options?: RequestOptions): Promise<TenantModelKey> {
    return this.request({
      method: "POST",
      path: "/tenants/self/model-keys",
      body: request,
      bodyType: "TenantModelKeyCreateRequest",
      response: "TenantModelKey",
      options,
    });
  }

  /** Replaces a key's settings (label, endpoint, overrides, priority, enabled); `apiKey` replaces the key itself. */
  async update(id: string, request: ModelKeyUpdateRequest, options?: RequestOptions): Promise<TenantModelKey> {
    return this.request({
      method: "PUT",
      path: `/tenants/self/model-keys/by-id/${seg(id)}`,
      body: request,
      bodyType: "TenantModelKeyUpdateRequest",
      response: "TenantModelKey",
      idempotent: true,
      options,
    });
  }

  /** Deletes a key. Runs already going stop using it at their next model call. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "DELETE",
      path: `/tenants/self/model-keys/by-id/${seg(id)}`,
      response: "void",
      options,
    });
  }
}

/** Settings of the caller's own tenant. */
export class Tenant extends Resource {
  /** How long finished runs are kept, and the lease limits. */
  async retention(options?: RequestOptions): Promise<TenantRetention> {
    return this.request({ method: "GET", path: "/tenants/self/retention", response: "TenantRetention", options });
  }

  /**
   * Sets how long finished runs are kept, in hours, up to the plan's `planMaxHours` (`Tenant.Admin`); `hours: null`
   * goes back to the platform default.
   */
  async setRetention(settings: { hours: number | null }, options?: RequestOptions): Promise<TenantRetention> {
    return this.request({
      method: "PUT",
      path: "/tenants/self/retention",
      body: { hours: settings.hours },
      bodyType: "TenantRetentionRequest",
      response: "TenantRetention",
      idempotent: true,
      options,
    });
  }

  /** The tenant's web-access settings (its default web-download partition). */
  async webAccess(options?: RequestOptions): Promise<WebAccessSettings> {
    return this.request({ method: "GET", path: "/tenants/self/web-access", response: "WebAccessSettings", options });
  }

  /** Replaces the tenant's web-access settings (Tenant.Admin). */
  async setWebAccess(settings: WebAccessSettings, options?: RequestOptions): Promise<WebAccessSettings> {
    return this.request({
      method: "PUT",
      path: "/tenants/self/web-access",
      body: settings,
      bodyType: "WebAccessSettings",
      response: "WebAccessSettings",
      idempotent: true,
      options,
    });
  }

  /**
   * Whether the tenant's runs may fall back to the platform's own provider keys, and whether it has keys of its own.
   * When `forbidMaitentoCredentials` is true, every model call needs a key the run supplies or a tenant model key.
   */
  async modelAccess(options?: RequestOptions): Promise<TenantModelAccess> {
    return this.request({ method: "GET", path: "/tenants/self/model-access", response: "TenantModelAccess", options });
  }
}
