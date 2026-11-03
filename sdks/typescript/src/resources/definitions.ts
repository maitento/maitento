import { seg } from "../core/http.js";
import { Resource, splitNamespace, type ListOptions, type NamespaceOptions, type RequestOptions } from "./shared.js";

/**
 * The calls every versioned definition shares (agents, interactions, apps, capsules, pipelines, connectors, tools,
 * automations): list, get / find by id, get / find by name, delete.
 */
export abstract class Definitions<T> extends Resource {
  /** The route segment: `agents`, `code-pipelines`, … */
  protected abstract readonly segment: string;
  /** The wire type of one item: `Agent`, `Interaction`, … */
  protected abstract readonly itemType: string;

  /** Every definition of the tenant, or of one namespace with `{ namespace }`. */
  async list(options?: ListOptions): Promise<T[]> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "GET",
      path: namespace ? `/namespaces/${seg(namespace)}/${this.segment}` : `/${this.segment}`,
      response: `${this.itemType}[]`,
      options: rest,
    });
  }

  /** The definition with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<T> {
    return this.request({ method: "GET", path: `/${this.segment}/by-id/${seg(id)}`, response: this.itemType, options });
  }

  /** The definition with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<T | null> {
    return this.request({
      method: "GET",
      path: `/${this.segment}/by-id/${seg(id)}`,
      response: this.itemType,
      notFound: "null",
      options,
    });
  }

  /** The definition with this name in the namespace. Throws `NotFoundError` when there is none. */
  async getByName(name: string, options?: NamespaceOptions): Promise<T> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({ method: "GET", path: this.byNamePath(name, namespace), response: this.itemType, options: rest });
  }

  /** The definition with this name in the namespace, or `null`. */
  async findByName(name: string, options?: NamespaceOptions): Promise<T | null> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "GET",
      path: this.byNamePath(name, namespace),
      response: this.itemType,
      notFound: "null",
      options: rest,
    });
  }

  /** Deletes the definition (refused with a 400 while something still uses it or a run of it is going). */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/${this.segment}/by-id/${seg(id)}`, response: "void", options });
  }

  protected byNamePath(name: string, namespace: string | undefined): string {
    return `${this.namespacePath(namespace)}/by-name/${seg(name)}`;
  }

  /** `/namespaces/{ns}/{segment}` for the explicit or default namespace. */
  protected namespacePath(namespace: string | undefined): string {
    return `/namespaces/${seg(this.ns(namespace))}/${this.segment}`;
  }
}
