import * as path from "path";
import { analyze, Analysis } from "../src/mtr/analyzer";
import { FileSystem, placeFile, ProjectIndex } from "../src/mtr/project";
import { loadSchema, MtrSchema } from "../src/mtr/schema";

/** The schema the extension bundles (copied by `npm run build` from `sdks/mtr-schema.json`). */
export const schema: MtrSchema = loadSchema(path.resolve(__dirname, "..", "..", "schema", "mtr-schema.json"));

/** The repository's `maitento/public` folder, seen from `out/test`. */
export const publicRoot = path.resolve(__dirname, "..", "..", "..", "..");

export const ROOT = path.resolve("/project");

/** A project held in memory: relative path → text. */
export function memoryFs(files: Record<string, string>, root = ROOT): FileSystem {
  const all = new Map(Object.entries(files).map(([p, text]) => [path.resolve(root, p), text]));
  const dirs = new Set<string>();
  for (const file of all.keys()) {
    for (let d = path.dirname(file); ; d = path.dirname(d)) {
      dirs.add(d);
      if (path.dirname(d) === d) break;
    }
  }
  return {
    isDirectory: (p) => dirs.has(path.resolve(p)),
    list: (dir) => {
      const full = path.resolve(dir);
      const names = new Set<string>();
      for (const p of [...all.keys(), ...dirs]) if (path.dirname(p) === full && p !== full) names.add(path.basename(p));
      return [...names];
    },
    read: (file) => all.get(path.resolve(file)),
  };
}

/**
 * Analyses `files[target]` as part of a project made of `files` (the target's own text included), the way the
 * editor does.
 */
export function check(files: Record<string, string>, target: string): Analysis {
  const fs = memoryFs(files);
  const project = new ProjectIndex(ROOT, schema, fs);
  const placement = placeFile(schema, target);
  return analyze(files[target]!, { schema, placement, project, file: path.resolve(ROOT, target) });
}

/** The messages of the issues (optionally of one code), for assertions. */
export function messages(analysis: Analysis, code?: string): string[] {
  return analysis.issues.filter((i) => !code || i.code === code).map((i) => `${i.code}: ${i.message}`);
}

/** The text of a snippet with every tab stop replaced by its default (or first choice). */
export function expandSnippet(body: string): string {
  return body
    .replace(/\$\{\d+\|([^,|]*)[^}]*\|\}/g, "$1")
    .replace(/\$\{\d+:([^}]*)\}/g, "$1")
    .replace(/\$\{\d+\}/g, "x")
    .replace(/\$\d+/g, "");
}

export const AGENT = 'model = @ref("deepseek.deepseek-v4-flash")\nprompt = "p"\nsummary = "s"\n';
