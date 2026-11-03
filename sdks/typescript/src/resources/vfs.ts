import { seg, type HttpRequest } from "../core/http.js";
import type {
  BatchEditRequest,
  BatchEditResponse,
  BatchReadRequest,
  BatchReadResponse,
  EditRequest,
  EditResponse,
  FileSystemDirectory,
  FileSystemEntry,
  FileSystemFile,
  FindRequest,
  FindResponse,
  TreeRequest,
  TreeResponse,
  VirtualFileSystem,
} from "../models.js";
import { Resource, splitNamespace, type ClientContext, type ListOptions, type NamespaceOptions, type RequestOptions } from "./shared.js";

/** Bytes as base64, in any runtime. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function asBytes(content: Uint8Array | ArrayBuffer): Uint8Array {
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

/**
 * One virtual file system, addressed by name or by id. Every path is VFS-absolute and `/`-separated
 * (`/notes/today.md`).
 *
 * ```ts
 * const notes = mt.vfs.open("notes");
 * await notes.writeText("/today.md", "# Today\n");
 * console.log(await notes.readText("/today.md"));
 * ```
 */
export class VfsHandle {
  constructor(
    private readonly ctx: ClientContext,
    /** `/vfs/by-id/{id}` or `/namespaces/{ns}/vfs/by-name/{name}`. */
    readonly basePath: string,
  ) {}

  private call<T>(req: Omit<HttpRequest, "path"> & { suffix: string }): Promise<T> {
    const { suffix, ...rest } = req;
    return this.ctx.http.request<T>({ ...rest, path: this.basePath + suffix });
  }

  /** The file system itself. Throws `NotFoundError` when it does not exist. */
  async info(options?: RequestOptions): Promise<VirtualFileSystem> {
    return this.call({ method: "GET", suffix: "", response: "VirtualFileSystem", options });
  }

  /** Deletes the whole file system. */
  async destroy(options?: RequestOptions): Promise<void> {
    return this.call({ method: "DELETE", suffix: "", response: "void", options });
  }

  /** A file's text, exactly as stored. */
  async readText(path: string, options?: RequestOptions): Promise<string> {
    return this.call({ method: "GET", suffix: "/files/contents/text", query: { path }, response: "text", options });
  }

  /** A file's bytes. */
  async readBytes(path: string, options?: RequestOptions): Promise<Uint8Array> {
    return this.call({ method: "GET", suffix: "/files/contents/bytes", query: { path }, response: "bytes", options });
  }

  /** A file's lines. */
  async readLines(path: string, options?: RequestOptions): Promise<string[]> {
    return this.call({ method: "GET", suffix: "/files/contents/lines", query: { path }, response: "string[]", options });
  }

  /** Writes (creates or replaces) a text file. */
  async writeText(path: string, content: string, options?: RequestOptions): Promise<FileSystemFile> {
    return this.write("write", "text", path, { content }, "FileTextContentRequest", options, true);
  }

  /** Writes (creates or replaces) a binary file. */
  async writeBytes(path: string, content: Uint8Array | ArrayBuffer, options?: RequestOptions): Promise<FileSystemFile> {
    return this.write("write", "bytes", path, { content: toBase64(asBytes(content)) }, "FileByteContentRequest", options, true);
  }

  /** Writes (creates or replaces) a file from lines. */
  async writeLines(path: string, lines: string[], options?: RequestOptions): Promise<FileSystemFile> {
    return this.write("write", "lines", path, { content: lines }, "FileLinesContentRequest", options, true);
  }

  /** Appends text to a file (creating it). Never retried. */
  async append(path: string, content: string, options?: RequestOptions): Promise<FileSystemFile> {
    return this.write("append", "text", path, { content }, "FileTextContentRequest", options, false);
  }

  /** Appends bytes to a file. Never retried. */
  async appendBytes(path: string, content: Uint8Array | ArrayBuffer, options?: RequestOptions): Promise<FileSystemFile> {
    return this.write("append", "bytes", path, { content: toBase64(asBytes(content)) }, "FileByteContentRequest", options, false);
  }

  /** Appends lines to a file. Never retried. */
  async appendLines(path: string, lines: string[], options?: RequestOptions): Promise<FileSystemFile> {
    return this.write("append", "lines", path, { content: lines }, "FileLinesContentRequest", options, false);
  }

  /** The entries of a directory (files and directories, by `$type`). */
  async list(path = "/", options?: RequestOptions): Promise<FileSystemEntry[]> {
    return this.call({ method: "GET", suffix: "/directories/contents", query: { path }, response: "FileSystemEntry[]", options });
  }

  /** Whether a FILE exists at the path. */
  async exists(path: string, options?: RequestOptions): Promise<boolean> {
    return this.call({ method: "GET", suffix: "/files/exists", query: { path }, response: "boolean", options });
  }

  /** Whether a DIRECTORY exists at the path. */
  async dirExists(path: string, options?: RequestOptions): Promise<boolean> {
    return this.call({ method: "GET", suffix: "/directories/exists", query: { path }, response: "boolean", options });
  }

  /** Deletes a file. */
  async delete(path: string, options?: RequestOptions): Promise<void> {
    return this.call({ method: "DELETE", suffix: "/files", query: { path }, response: "void", options });
  }

  /** Deletes a directory (with `recursive: true`, and everything in it). */
  async deleteDir(path: string, request?: { recursive?: boolean }, options?: RequestOptions): Promise<void> {
    return this.call({
      method: "DELETE",
      suffix: "/directories",
      query: { path, recursive: request?.recursive ?? false },
      response: "void",
      options,
    });
  }

  /** Creates a directory. */
  async mkdir(path: string, options?: RequestOptions): Promise<FileSystemDirectory> {
    return this.call({
      method: "PUT",
      suffix: "/directories",
      query: { path },
      response: "FileSystemDirectory",
      idempotent: true,
      options,
    });
  }

  /** Copies a file or directory. */
  async copy(path: string, destination: string, options?: RequestOptions): Promise<FileSystemEntry> {
    return this.call({ method: "PUT", suffix: "/copy", query: { path, destination }, response: "FileSystemEntry", options });
  }

  /** Moves a file or directory. */
  async move(path: string, destination: string, options?: RequestOptions): Promise<FileSystemEntry> {
    return this.call({ method: "POST", suffix: "/move", query: { path, destination }, response: "FileSystemEntry", options });
  }

  /** Finds files by name pattern and/or content (grep). */
  async find(request: FindRequest, options?: RequestOptions): Promise<FindResponse> {
    return this.call({
      method: "POST",
      suffix: "/find",
      body: request,
      bodyType: "FindRequest",
      response: "FindResponse",
      idempotent: true,
      options,
    });
  }

  /** Applies edit operations to one file. */
  async edit(request: EditRequest, options?: RequestOptions): Promise<EditResponse> {
    return this.call({ method: "POST", suffix: "/files/edit", body: request, bodyType: "EditRequest", response: "EditResponse", options });
  }

  /** Applies edits to several files (optionally all-or-nothing). */
  async batchEdit(request: BatchEditRequest, options?: RequestOptions): Promise<BatchEditResponse> {
    return this.call({
      method: "POST",
      suffix: "/batch/edit",
      body: request,
      bodyType: "BatchEditRequest",
      response: "BatchEditResponse",
      options,
    });
  }

  /** Reads several files at once. */
  async batchRead(request: BatchReadRequest, options?: RequestOptions): Promise<BatchReadResponse> {
    return this.call({
      method: "POST",
      suffix: "/batch/read",
      body: request,
      bodyType: "BatchReadRequest",
      response: "BatchReadResponse",
      idempotent: true,
      options,
    });
  }

  /** The directory tree below a path. */
  async tree(request?: TreeRequest, options?: RequestOptions): Promise<TreeResponse> {
    return this.call({
      method: "POST",
      suffix: "/tree",
      body: request ?? {},
      bodyType: "TreeRequest",
      response: "TreeResponse",
      idempotent: true,
      options,
    });
  }

  private write(
    mode: "write" | "append",
    kind: "text" | "bytes" | "lines",
    path: string,
    body: unknown,
    bodyType: string,
    options: RequestOptions | undefined,
    idempotent: boolean,
  ): Promise<FileSystemFile> {
    return this.call({
      method: "PUT",
      suffix: `/files/${mode}/${kind}`,
      query: { path },
      body,
      bodyType,
      response: "FileSystemFile",
      idempotent,
      options,
    });
  }
}

/** Virtual file systems: durable file trees that agents, apps and capsules share. */
export class Vfs extends Resource {
  /** Every VFS of the tenant, or of one namespace with `{ namespace }`. */
  async list(options?: ListOptions): Promise<VirtualFileSystem[]> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "GET",
      path: namespace ? `/namespaces/${seg(namespace)}/vfs` : "/vfs",
      response: "VirtualFileSystem[]",
      options: rest,
    });
  }

  /** Creates a VFS in the namespace. */
  async create(request: { name: string }, options?: NamespaceOptions): Promise<VirtualFileSystem> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "POST",
      path: `/namespaces/${seg(this.ns(namespace))}/vfs`,
      body: { name: request.name },
      bodyType: "VirtualFileSystemCreateRequest",
      response: "VirtualFileSystem",
      options: rest,
    });
  }

  /** The VFS with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<VirtualFileSystem> {
    return this.openById(id).info(options);
  }

  /** The VFS with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<VirtualFileSystem | null> {
    return this.request({ method: "GET", path: `/vfs/by-id/${seg(id)}`, response: "VirtualFileSystem", notFound: "null", options });
  }

  /** The VFS with this name. Throws `NotFoundError` when there is none. */
  async getByName(name: string, options?: NamespaceOptions): Promise<VirtualFileSystem> {
    const { namespace, rest } = splitNamespace(options);
    return this.open(name, { namespace }).info(rest);
  }

  /** The VFS with this name, or `null`. */
  async findByName(name: string, options?: NamespaceOptions): Promise<VirtualFileSystem | null> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "GET",
      path: this.namePath(name, namespace),
      response: "VirtualFileSystem",
      notFound: "null",
      options: rest,
    });
  }

  /** Deletes the VFS with this id. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.openById(id).destroy(options);
  }

  /** Deletes the VFS with this name. */
  async deleteByName(name: string, options?: NamespaceOptions): Promise<void> {
    const { namespace, rest } = splitNamespace(options);
    return this.open(name, { namespace }).destroy(rest);
  }

  /** A handle on the VFS with this name (no request is made until you use it). */
  open(name: string, options?: { namespace?: string }): VfsHandle {
    return new VfsHandle(this.ctx, this.namePath(name, options?.namespace));
  }

  /** A handle on the VFS with this id. */
  openById(id: string): VfsHandle {
    return new VfsHandle(this.ctx, `/vfs/by-id/${seg(id)}`);
  }

  private namePath(name: string, namespace: string | undefined): string {
    return `/namespaces/${seg(this.ns(namespace))}/vfs/by-name/${seg(name)}`;
  }
}
