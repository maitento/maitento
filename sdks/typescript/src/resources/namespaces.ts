import { seg } from "../core/http.js";
import type { Namespace, WebAccessSettings } from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

/** Namespaces: every definition lives in one. A deploy creates its namespace when it is missing. */
export class Namespaces extends Resource {
  /** Every namespace of the tenant. */
  async list(options?: RequestOptions): Promise<Namespace[]> {
    return this.request({ method: "GET", path: "/namespaces", response: "Namespace[]", options });
  }

  /** The namespace with this NAME. Throws `NotFoundError` when there is none. */
  async get(name: string, options?: RequestOptions): Promise<Namespace> {
    return this.request({ method: "GET", path: `/namespaces/by-name/${seg(name)}`, response: "Namespace", options });
  }

  /** The namespace with this NAME, or `null`. */
  async find(name: string, options?: RequestOptions): Promise<Namespace | null> {
    return this.request({
      method: "GET",
      path: `/namespaces/by-name/${seg(name)}`,
      response: "Namespace",
      notFound: "null",
      options,
    });
  }

  /** The namespace with this id. Throws `NotFoundError` when there is none. */
  async getById(id: string, options?: RequestOptions): Promise<Namespace> {
    return this.request({ method: "GET", path: `/namespaces/by-id/${seg(id)}`, response: "Namespace", options });
  }

  /** The namespace with this id, or `null`. */
  async findById(id: string, options?: RequestOptions): Promise<Namespace | null> {
    return this.request({
      method: "GET",
      path: `/namespaces/by-id/${seg(id)}`,
      response: "Namespace",
      notFound: "null",
      options,
    });
  }

  /** Creates a namespace. */
  async create(request: { name: string }, options?: RequestOptions): Promise<Namespace> {
    return this.request({
      method: "POST",
      path: "/namespaces",
      body: { name: request.name },
      bodyType: "NamespaceCreateOrUpdateRequest",
      response: "Namespace",
      options,
    });
  }

  /** Renames a namespace. */
  async rename(id: string, request: { name: string }, options?: RequestOptions): Promise<Namespace> {
    return this.request({
      method: "PUT",
      path: `/namespaces/by-id/${seg(id)}`,
      body: { name: request.name },
      bodyType: "NamespaceCreateOrUpdateRequest",
      response: "Namespace",
      idempotent: true,
      options,
    });
  }

  /** Deletes an empty namespace (a 400 `api:namespace:delete:not-empty` lists what remains). */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/namespaces/by-id/${seg(id)}`, response: "void", options });
  }

  /** The namespace's web-access settings (its default web-download partition). */
  async webAccess(id: string, options?: RequestOptions): Promise<WebAccessSettings> {
    return this.request({
      method: "GET",
      path: `/namespaces/by-id/${seg(id)}/web-access`,
      response: "WebAccessSettings",
      options,
    });
  }

  /** Replaces the namespace's web-access settings (Tenant.Admin). */
  async setWebAccess(id: string, settings: WebAccessSettings, options?: RequestOptions): Promise<WebAccessSettings> {
    return this.request({
      method: "PUT",
      path: `/namespaces/by-id/${seg(id)}/web-access`,
      body: settings,
      bodyType: "WebAccessSettings",
      response: "WebAccessSettings",
      idempotent: true,
      options,
    });
  }
}
