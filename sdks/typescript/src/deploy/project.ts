import { MaitentoError } from "../core/errors.js";
import type { BuildRequest, BuildRequestApp, BuildRequestItem, CompilationInputFile } from "../models.js";

/**
 * A resource project held in memory: relative POSIX path (`agents/greeter.mtr`) to file text. What `deploy()` and
 * `validate()` take in a browser; on a server they can also read a folder.
 */
export type ProjectFiles = Readonly<Record<string, string>>;

/** The extensions a resource project is made of. Everything else in the folder is ignored. */
export const PROJECT_EXTENSIONS = [".mtr", ".mtc", ".md", ".json"] as const;

/** Thrown when a project folder cannot be turned into a build (bad layout, a broken include). */
export class ProjectError extends MaitentoError {}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function baseName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

/** `Path.GetFileNameWithoutExtension`: the file name up to its LAST dot. */
function nameOf(path: string): string {
  const file = baseName(path);
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function hasExtension(path: string, extension: string): boolean {
  return path.toLowerCase().endsWith(extension);
}

/** The direct child folder names under `prefix` (`apps/` → `["hello", …]`). */
function childFolders(paths: readonly string[], prefix: string): string[] {
  const folders = new Set<string>();
  for (const path of paths) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash > 0) folders.add(rest.slice(0, slash));
  }
  return [...folders].sort();
}

/** The project's `.mtr` items below a type folder: name = file name, filename relative to the folder. */
function items(files: ProjectFiles, paths: readonly string[], folder: string): BuildRequestItem[] {
  const prefix = folder + "/";
  return paths
    .filter((p) => p.startsWith(prefix) && hasExtension(p, ".mtr"))
    .map((p) => ({ name: nameOf(p), filename: p.slice(prefix.length), lines: lines(files[p] ?? "") }));
}

const PROMPT_INCLUDE = /"@prompt\(([^)]+)\)"/g;
const SCHEMA_INCLUDE = /"@schema\(([^)]+)\)"/g;
const HOOK_PROMPT_INCLUDE = /@promptJson\(([^)]+)\)/g;
const HOOK_SCHEMA_INCLUDE = /@schemaJson\(([^)]+)\)/g;

function replaceAll(source: string, pattern: RegExp, resolve: (token: string) => string): string {
  return source.replace(pattern, (_match, token: string) => resolve(token));
}

/**
 * Resolves a pipeline definition's folder-local includes, as `mt deploy` does: `"@prompt(x)"` becomes
 * `prompts/x.md` as a JSON string, `"@schema(x)"` becomes `x.schema.json`'s text as a JSON string. `@externalOp(…)`
 * is left for the server.
 */
function resolvePipelineIncludes(files: ProjectFiles, folder: string, source: string): string {
  const read = (path: string, what: string): string => {
    const text = files[path];
    if (text === undefined) throw new ProjectError(`${what} reference not found: ${path}`);
    return text;
  };
  let result = replaceAll(source, PROMPT_INCLUDE, (name) =>
    JSON.stringify(read(`${folder}/prompts/${name}.md`, "@prompt")),
  );
  result = replaceAll(result, SCHEMA_INCLUDE, (name) =>
    JSON.stringify(read(`${folder}/${name}.schema.json`, "@schema")),
  );
  return result;
}

/**
 * Resolves `@promptJson(pipeline/asset)` / `@schemaJson(pipeline/asset)` in a pipeline hook's Cogniscript: the
 * asset's text, JSON-escaped (without quotes) and with every backslash doubled, because the Cogniscript assembler
 * unescapes string literals once more.
 */
function resolveHookIncludes(files: ProjectFiles, hook: string, source: string): string {
  const resolve = (token: string, isSchema: boolean): string => {
    const directive = isSchema ? "@schemaJson" : "@promptJson";
    const slash = token.indexOf("/");
    if (slash <= 0 || slash === token.length - 1) {
      throw new ProjectError(
        `hook '${hook}': ${directive}('${token}') must be '<pipeline>/<asset>', e.g. 'code-generator/verdict-output'`,
      );
    }
    const pipeline = token.slice(0, slash);
    const asset = token.slice(slash + 1);
    for (const part of [pipeline, asset]) {
      if (part.includes("..") || part.includes("/") || part.includes("\\") || /^[A-Za-z]:/.test(part)) {
        throw new ProjectError(
          `hook '${hook}': ${directive}('${token}') must name a single pipeline and asset, with no path separators, '..' or rooted paths`,
        );
      }
    }
    const path = isSchema
      ? `code-pipelines/${pipeline}/${asset}.schema.json`
      : `code-pipelines/${pipeline}/prompts/${asset}.md`;
    const text = files[path];
    if (text === undefined) throw new ProjectError(`hook '${hook}': ${directive} reference not found: ${path}`);
    // A quote is written ", as the C# SDK's JSON writer does: \" would become \\" below, which ends the literal.
    return JSON.stringify(text).slice(1, -1).replace(/\\"/g, "\\u0022").replace(/\\/g, "\\\\");
  };
  let result = replaceAll(source, HOOK_PROMPT_INCLUDE, (t) => resolve(t, false));
  result = replaceAll(result, HOOK_SCHEMA_INCLUDE, (t) => resolve(t, true));
  return result;
}

/**
 * Turns a resource project into the Build API request, with exactly the layout `mt build` / `mt deploy` read:
 *
 * ```
 * agents/ capsules/ looms/ interactions/{one-shot,round-robin,managed}/
 * connectors/open-api/ external-operations/open-api/          *.mtr (recursive; name = file name)
 * apps/<app>/                       *.mtc (at least one) + at most one <app>.mtr
 * code-pipelines/<name>/            pipeline-definition.json (+ prompts/*.md, *.schema.json includes)
 * code-pipeline-hooks/<name>/       *.mtc
 * prompts/                          *.md   (@prompt("name"))
 * json/                             *.json (@json("name"))
 * ```
 *
 * It mirrors `mt` (maitento/app/ShellCorePlugin/Build/BuildBaseCommand.cs) exactly, skips included: where `mt`
 * prints a warning and leaves something out (an app folder with no `.mtc`, an app with two `.mtr` files, a pipeline
 * folder with no definition, a hook with no code or a broken include), the same thing is left out and the warning
 * goes to `onWarning`. A pipeline definition whose `@prompt` / `@schema` include is missing fails the whole build
 * (a {@link ProjectError}), as it does in `mt`.
 */
export function buildRequestFromProject(
  project: ProjectFiles,
  isDeploy: boolean,
  onWarning: (message: string) => void = () => {},
): BuildRequest {
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries(project)) {
    files[normalizePath(path)] = text;
  }
  const paths = Object.keys(files).sort();

  const resourceFiles = {
    prompts: paths
      .filter((p) => p.startsWith("prompts/") && hasExtension(p, ".md"))
      .map((p) => ({ name: nameOf(p), content: files[p] ?? "" })),
    json: paths
      .filter((p) => p.startsWith("json/") && hasExtension(p, ".json"))
      .map((p) => ({ name: nameOf(p), content: files[p] ?? "" })),
  };

  const apps: BuildRequestApp[] = [];
  for (const app of childFolders(paths, "apps/")) {
    const prefix = `apps/${app}/`;
    const inApp = paths.filter((p) => p.startsWith(prefix));
    const code = inApp.filter((p) => hasExtension(p, ".mtc"));
    const metadata = inApp.filter((p) => hasExtension(p, ".mtr"));
    if (code.length === 0) {
      onWarning(`App '${app}' skipped as no code files`);
      continue;
    }
    if (metadata.length > 1) {
      onWarning(`App '${app}' has more than one resource defined`);
      continue;
    }
    const metadataFile: CompilationInputFile | null = metadata[0]
      ? { filename: `${app}.mtr`, lines: lines(files[metadata[0]] ?? "") }
      : null;
    apps.push({
      name: app,
      metadata: metadataFile,
      code: code.map((p) => ({ filename: p.slice(prefix.length), lines: lines(files[p] ?? "") })),
    });
  }

  const codePipelines = childFolders(paths, "code-pipelines/").flatMap((name) => {
    const folder = `code-pipelines/${name}`;
    const definition = files[`${folder}/pipeline-definition.json`];
    if (definition === undefined) {
      onWarning(`CodePipeline folder '${name}' skipped: no pipeline-definition.json`);
      return [];
    }
    return [
      {
        name,
        filename: `${folder}/pipeline-definition.json`,
        json: resolvePipelineIncludes(files, folder, definition),
      },
    ];
  });

  let codePipelineHooks: Record<string, BuildRequestApp> | null = null;
  for (const hook of childFolders(paths, "code-pipeline-hooks/")) {
    const prefix = `code-pipeline-hooks/${hook}/`;
    const code = paths.filter((p) => p.startsWith(prefix) && hasExtension(p, ".mtc"));
    if (code.length === 0) {
      onWarning(`CodePipeline hook '${hook}' skipped as no code files`);
      continue;
    }
    let resolved: CompilationInputFile[];
    try {
      resolved = code.map((p) => ({
        filename: p.slice(prefix.length),
        lines: lines(resolveHookIncludes(files, hook, files[p] ?? "")),
      }));
    } catch (error) {
      // `mt` reports the hook and builds without it.
      onWarning(`CodePipeline hook '${hook}' include resolution failed: ${(error as Error).message}`);
      continue;
    }
    codePipelineHooks ??= {};
    codePipelineHooks[hook] = { name: hook, metadata: null, code: resolved };
  }

  const request: BuildRequest = {
    isDeploy,
    agents: items(files, paths, "agents"),
    capsules: items(files, paths, "capsules"),
    connectors: { openApi: items(files, paths, "connectors/open-api"), modelContextProtocol: [] },
    externalOperations: { openApi: items(files, paths, "external-operations/open-api"), modelContextProtocol: [] },
    interactions: {
      oneShot: items(files, paths, "interactions/one-shot"),
      roundRobin: items(files, paths, "interactions/round-robin"),
      managed: items(files, paths, "interactions/managed"),
    },
    apps,
    codePipelines,
    codePipelineHooks,
    looms: items(files, paths, "looms"),
    resourceFiles,
  };

  const count =
    request.agents.length +
    request.capsules.length +
    request.connectors.openApi.length +
    request.externalOperations.openApi.length +
    request.interactions.oneShot.length +
    request.interactions.roundRobin.length +
    request.interactions.managed.length +
    request.apps.length +
    request.codePipelines.length +
    Object.keys(codePipelineHooks ?? {}).length +
    (request.looms?.length ?? 0);
  if (count === 0) {
    throw new ProjectError(
      "Nothing to build: no resources found (expected agents/, interactions/one-shot/, apps/<name>/ and so on).",
    );
  }
  return request;
}
