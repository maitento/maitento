/** The SDK's version, sent in the `User-Agent` on server runtimes. Kept equal to package.json by a unit test. */
export const SDK_VERSION = "26.11.1";

interface ProcessLike {
  env?: Record<string, string | undefined>;
  versions?: Record<string, string | undefined>;
  getBuiltinModule?: (id: string) => unknown;
}

function processObject(): ProcessLike | undefined {
  const candidate = (globalThis as { process?: unknown }).process;
  return typeof candidate === "object" && candidate !== null ? (candidate as ProcessLike) : undefined;
}

/** Reads an environment variable where the runtime has them (Node, Bun, Deno with `process`); `undefined` elsewhere. */
export function readEnv(name: string): string | undefined {
  const value = processObject()?.env?.[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * True on a server runtime (Node, Bun, Deno), where a WebSocket may carry an `Authorization` header and Node
 * modules are available. False in a browser or a web worker.
 */
export function isServerRuntime(): boolean {
  const versions = processObject()?.versions;
  if (versions?.node || versions?.bun) {
    return true;
  }
  return typeof (globalThis as { Deno?: unknown }).Deno !== "undefined";
}

/** The runtime's description for the `User-Agent`, e.g. `node/22.12.0`. */
export function runtimeDescription(): string {
  const versions = processObject()?.versions;
  if (versions?.bun) return `bun/${versions.bun}`;
  if (versions?.node) return `node/${versions.node}`;
  if (typeof (globalThis as { Deno?: unknown }).Deno !== "undefined") return "deno";
  return "browser";
}

/**
 * Loads a Node built-in module (`fs/promises`, `path`) without a static import, so bundlers targeting the browser
 * never try to resolve it. Only called on server runtimes.
 */
export async function nodeModule<T>(id: string): Promise<T> {
  const builtin = processObject()?.getBuiltinModule;
  if (typeof builtin === "function") {
    const loaded = builtin(id);
    if (loaded) {
      return loaded as T;
    }
  }
  const specifier = "node:" + id;
  return (await import(/* webpackIgnore: true */ /* @vite-ignore */ specifier)) as T;
}
