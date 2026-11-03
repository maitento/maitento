import { seg, type FileContent } from "../core/http.js";
import { isServerRuntime, nodeModule } from "../core/env.js";
import { MaitentoError } from "../core/errors.js";
import { pages, type PagePromise } from "../core/paging.js";
import type {
  EmbeddingModelDefinition,
  EmbeddingsSearchResult,
  FileTextResponse,
  IngestedFile,
  IngestedFileListItem,
  IngestedFilePage,
  IngestedFileSummary,
  Partition,
  PartitionCreateRequest,
  PartitionEmbeddingCredentialsRequest,
  PartitionEmbeddingProbeRequest,
  PartitionEmbeddingProbeResult,
  PartitionEmbeddingProfileRequest,
  PartitionEmbeddingStatus,
} from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

export type { FileContent } from "../core/http.js";

/**
 * A file to upload: a `Blob`/`File`, bytes (`Uint8Array`, Node `Buffer`, `ArrayBuffer`), a stream (web
 * `ReadableStream` or Node `Readable`), or — on a server runtime — a path to read.
 */
export type FileInput =
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array | string>
  | string;

export interface UploadOptions extends RequestOptions {
  /** The file name the server classifies and stores the file under. Defaults to the path's or `File`'s name. */
  fileName?: string;
  /** The content type. Defaults to the `Blob`'s type, else a guess from the file name. */
  contentType?: string;
}

/** Text extraction runs inside the upload request and can take minutes. */
const UPLOAD_TIMEOUT_MS = 6 * 60 * 1000;

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
};

function guessContentType(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array | string> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

async function collect(stream: AsyncIterable<Uint8Array | string>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
  }
  return chunks;
}

/** Builds the multipart body: exactly one part named `file`, with its own file name and content type. */
export async function toUploadForm(file: FileInput, options: UploadOptions = {}): Promise<FormData> {
  let parts: Array<Blob | Uint8Array>;
  let name = options.fileName;
  let type = options.contentType;
  if (typeof file === "string") {
    if (!isServerRuntime()) {
      throw new MaitentoError("A file path can only be read on a server runtime; pass a Blob or bytes instead.");
    }
    const fs = await nodeModule<{ readFile(path: string): Promise<Uint8Array> }>("fs/promises");
    const path = await nodeModule<{ basename(path: string): string }>("path");
    parts = [await fs.readFile(file)];
    name ??= path.basename(file);
  } else if (typeof Blob !== "undefined" && file instanceof Blob) {
    parts = [file];
    name ??= (file as Blob & { name?: string }).name;
    type ??= file.type || undefined;
  } else if (file instanceof ArrayBuffer) {
    parts = [new Uint8Array(file)];
  } else if (ArrayBuffer.isView(file)) {
    parts = [new Uint8Array(file.buffer, file.byteOffset, file.byteLength)];
  } else if (typeof ReadableStream !== "undefined" && file instanceof ReadableStream) {
    // Read through a reader: not every browser makes a ReadableStream async-iterable.
    const reader = (file as ReadableStream<Uint8Array>).getReader();
    parts = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
  } else if (isAsyncIterable(file)) {
    parts = await collect(file);
  } else {
    throw new MaitentoError("Unsupported file input: pass a Blob, bytes, a stream or a path.");
  }
  name ??= "file";
  type ??= guessContentType(name);
  const form = new FormData();
  form.append("file", new Blob(parts as unknown as BlobPart[], { type }), name);
  return form;
}

/**
 * Knowledge files: upload a document into a partition (its text is extracted, chunked and embedded), read it, search
 * the partition. Needs a Tenant.Admin (or file-ingestion) credential.
 */
export class Files extends Resource {
  /**
   * Uploads a file into a partition. Text extraction runs inside the call (it can take minutes: the default
   * timeout is 6 minutes); chunking and embedding continue afterwards (`ingested-file-updated`, `isVectorGenerated`).
   * The same bytes in the same partition are de-duplicated. Never retried.
   */
  async upload(partitionId: string, file: FileInput, options?: UploadOptions): Promise<IngestedFile> {
    const { fileName, contentType, ...rest } = options ?? {};
    const form = await toUploadForm(file, { fileName, contentType });
    return this.request({
      method: "PUT",
      path: `/files/partitions/${seg(partitionId)}`,
      form,
      response: "IngestedFile",
      idempotent: false,
      options: { ...rest, timeout: rest.timeout ?? Math.max(this.ctx.http.timeout, UPLOAD_TIMEOUT_MS) },
    });
  }

  /** Replaces a file's content (the same content is a no-op). Never retried. */
  async replace(id: string, file: FileInput, options?: UploadOptions): Promise<IngestedFile> {
    const { fileName, contentType, ...rest } = options ?? {};
    const form = await toUploadForm(file, { fileName, contentType });
    return this.request({
      method: "PATCH",
      path: `/files/by-id/${seg(id)}`,
      form,
      response: "IngestedFile",
      idempotent: false,
      options: { ...rest, timeout: rest.timeout ?? Math.max(this.ctx.http.timeout, UPLOAD_TIMEOUT_MS) },
    });
  }

  /** The file record (with its extracted text). Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions & { partitionId?: string }): Promise<IngestedFile> {
    const { partitionId, ...rest } = options ?? {};
    return this.request({
      method: "GET",
      path: `/files/by-id/${seg(id)}/details`,
      query: { partitionId },
      response: "IngestedFile",
      options: rest,
    });
  }

  /** The file record, or `null`. */
  async find(id: string, options?: RequestOptions & { partitionId?: string }): Promise<IngestedFile | null> {
    const { partitionId, ...rest } = options ?? {};
    return this.request({
      method: "GET",
      path: `/files/by-id/${seg(id)}/details`,
      query: { partitionId },
      response: "IngestedFile",
      notFound: "null",
      options: rest,
    });
  }

  /** The file's extracted text. */
  async text(id: string, options?: RequestOptions & { partitionId?: string }): Promise<string> {
    const { partitionId, ...rest } = options ?? {};
    const response = await this.request<FileTextResponse>({
      method: "GET",
      path: `/files/by-id/${seg(id)}/text`,
      query: { partitionId },
      response: "FileTextResponse",
      options: rest,
    });
    return response.text;
  }

  /** The file's original bytes, content type and file name. */
  async download(id: string, options?: RequestOptions & { partitionId?: string }): Promise<FileContent> {
    const { partitionId, ...rest } = options ?? {};
    return this.request({
      method: "GET",
      path: `/files/by-id/${seg(id)}`,
      query: { partitionId },
      response: "file",
      options: rest,
    });
  }

  /** The file with this content checksum (a de-duplication check). Throws `NotFoundError` when there is none. */
  async getByChecksum(checksum: string, options?: RequestOptions): Promise<IngestedFileSummary> {
    return this.request({
      method: "GET",
      path: `/files/by-checksum/${seg(checksum)}`,
      response: "IngestedFileSummary",
      options,
    });
  }

  /** The file with this content checksum, or `null`. */
  async findByChecksum(checksum: string, options?: RequestOptions): Promise<IngestedFileSummary | null> {
    return this.request({
      method: "GET",
      path: `/files/by-checksum/${seg(checksum)}`,
      response: "IngestedFileSummary",
      notFound: "null",
      options,
    });
  }

  /** Semantic search over a partition's files. */
  async search(request: { partitionId: string; query: string }, options?: RequestOptions): Promise<EmbeddingsSearchResult[]> {
    return this.request({
      method: "PUT",
      path: "/files/embeddings/search",
      body: request,
      bodyType: "EmbeddedVectorSearchRequest",
      response: "EmbeddingsSearchResult[]",
      // A read with a body: safe to repeat.
      idempotent: true,
      options,
    });
  }

  /** Deletes a file (Tenant.Admin). */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/files/by-id/${seg(id)}`, response: "void", options });
  }
}

/** Partitions: the containers knowledge files live in, each with its embedding profile. */
export class Partitions extends Resource {
  /** Every partition. */
  async list(options?: RequestOptions): Promise<Partition[]> {
    return this.request({ method: "GET", path: "/partitions", response: "Partition[]", options });
  }

  /** Creates a partition (a temporary one deletes its files after `fileLifetimeHours`). */
  async create(request: PartitionCreateRequest, options?: RequestOptions): Promise<Partition> {
    return this.request({
      method: "PUT",
      path: "/partitions",
      body: request,
      bodyType: "PartitionCreateRequest",
      response: "Partition",
      idempotent: false,
      options,
    });
  }

  /** The partition with this id. Throws `NotFoundError` when there is none. */
  async get(id: string, options?: RequestOptions): Promise<Partition> {
    return this.request({ method: "GET", path: `/partitions/by-id/${seg(id)}`, response: "Partition", options });
  }

  /** The partition with this id, or `null`. */
  async find(id: string, options?: RequestOptions): Promise<Partition | null> {
    return this.request({
      method: "GET",
      path: `/partitions/by-id/${seg(id)}`,
      response: "Partition",
      notFound: "null",
      options,
    });
  }

  /** Deletes an empty partition (Tenant.Admin). */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/partitions/by-id/${seg(id)}`, response: "void", options });
  }

  /** The partition's files, newest first: await it for the first page, or iterate every file. */
  files(id: string, query?: { limit?: number; cursor?: string }, options?: RequestOptions): PagePromise<IngestedFileListItem> {
    return pages<IngestedFileListItem>((cursor) =>
      this.request<IngestedFilePage>({
        method: "GET",
        path: `/partitions/by-id/${seg(id)}/files`,
        query: { limit: query?.limit, cursor: cursor ?? query?.cursor },
        response: "IngestedFilePage",
        options,
      }),
    );
  }

  /** The embedding models a partition can use. */
  async embeddingModels(options?: RequestOptions): Promise<EmbeddingModelDefinition[]> {
    return this.request({
      method: "GET",
      path: "/partitions/embedding-models",
      response: "EmbeddingModelDefinition[]",
      options,
    });
  }

  /** Partitions whose embedding credentials failed (Tenant.Admin). */
  async listEmbeddingCredentialFailures(options?: RequestOptions): Promise<Partition[]> {
    return this.request({
      method: "GET",
      path: "/partitions/embedding-credential-failures",
      response: "Partition[]",
      options,
    });
  }

  /** Marks a partition's embedding-credential failures as seen. */
  async acknowledgeEmbeddingCredentialFailures(id: string, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "PUT",
      path: `/partitions/by-id/${seg(id)}/embedding-credential-failures/acknowledge`,
      response: "void",
      idempotent: true,
      options,
    });
  }

  /** Sets the keys a partition embeds with (Tenant.Admin). */
  async setEmbeddingCredentials(id: string, request: PartitionEmbeddingCredentialsRequest, options?: RequestOptions): Promise<Partition> {
    return this.request({
      method: "PUT",
      path: `/partitions/by-id/${seg(id)}/embedding-credentials`,
      body: request,
      bodyType: "PartitionEmbeddingCredentialsRequest",
      response: "Partition",
      idempotent: true,
      options,
    });
  }

  /**
   * Sets the credential stack a partition embeds with (Tenant.Admin), or clears it with `null`. Its own embedding keys
   * are tried first, then the stack's, in place of the tenant's model keys and default stack; Maitento's key is never
   * used.
   */
  async setEmbeddingCredentialStack(id: string, credentialStackId: string | null, options?: RequestOptions): Promise<Partition> {
    return this.request({
      method: "PUT",
      path: `/partitions/by-id/${seg(id)}/embedding-credential-stack`,
      body: { credentialStackId },
      bodyType: "PartitionEmbeddingCredentialStackRequest",
      response: "Partition",
      idempotent: true,
      options,
    });
  }

  /** Removes a partition's embedding keys. */
  async clearEmbeddingCredentials(id: string, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "DELETE",
      path: `/partitions/by-id/${seg(id)}/embedding-credentials`,
      response: "void",
      options,
    });
  }

  /** Changes a partition's embedding profile (may re-index every file: never retried). */
  async changeEmbeddingProfile(id: string, request: PartitionEmbeddingProfileRequest, options?: RequestOptions): Promise<Partition> {
    return this.request({
      method: "PUT",
      path: `/partitions/by-id/${seg(id)}/embedding-profile`,
      body: request,
      bodyType: "PartitionEmbeddingProfileRequest",
      response: "Partition",
      idempotent: false,
      options,
    });
  }

  /** Tries an embedding profile and keys without saving them (a failed probe is still a 200). */
  async probeEmbeddingProfile(request: PartitionEmbeddingProbeRequest, options?: RequestOptions): Promise<PartitionEmbeddingProbeResult> {
    return this.request({
      method: "POST",
      path: "/partitions/embedding-profile/probe",
      body: request,
      bodyType: "PartitionEmbeddingProbeRequest",
      response: "PartitionEmbeddingProbeResult",
      options,
    });
  }

  /** The embedding status of many partitions (sent in batches of 500 ids). */
  async embeddingStatus(request: { partitionIds: string[] }, options?: RequestOptions): Promise<PartitionEmbeddingStatus[]> {
    const results: PartitionEmbeddingStatus[] = [];
    for (let i = 0; i < request.partitionIds.length || i === 0; i += 500) {
      const batch = request.partitionIds.slice(i, i + 500);
      results.push(
        ...(await this.request<PartitionEmbeddingStatus[]>({
          method: "PUT",
          path: "/partitions/embedding-status",
          body: { partitionIds: batch },
          bodyType: "PartitionEmbeddingStatusRequest",
          response: "PartitionEmbeddingStatus[]",
          idempotent: true,
          options,
        })),
      );
      if (request.partitionIds.length === 0) break;
    }
    return results;
  }
}
