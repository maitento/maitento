import * as path from "path";
import { Kind, MtrSchema, SupportingFile } from "./schema";

/**
 * Where files sit in a Maitento project, as the project readers (`mt`, the SDKs, the portal) see it: which kind of
 * `.mtr` a file is, which folder is the project's root, and the names of everything declared in it.
 */
export interface FileSystem {
  isDirectory(p: string): boolean;
  /** The names of a directory's entries; empty when it does not exist. */
  list(dir: string): string[];
  read(file: string): string | undefined;
}

export interface Placement {
  kind: Kind;
  /** The resource's name: the file name without `.mtr`, or (apps) the folder's name. */
  name: string;
}

const segments = (p: string): string[] => p.split(/[\\/]+/).filter((s) => s.length > 0);

/** The file name without its last extension, as Maitento names a resource (`x.schema.json` → `x.schema`). */
export function stem(file: string): string {
  const base = path.basename(file);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? base : base.slice(0, dot);
}

/** The kind a `.mtr` file is, from its path relative to the project root (`interactions/one-shot/hello.mtr`). */
export function placeFile(schema: MtrSchema, relative: string): Placement | undefined {
  const parts = segments(relative);
  if (!parts.length || !parts[parts.length - 1]!.toLowerCase().endsWith(".mtr")) return undefined;
  const matches = schema.kinds
    .map((kind) => ({ kind, folder: segments(kind.folder) }))
    .filter(({ folder }) => folder.every((s, i) => parts[i] === s))
    // A kind's file is below its folder; an app's is below a sub-folder of `apps/`.
    .filter(({ kind, folder }) => parts.length >= folder.length + (kind.perSubfolder ? 2 : 1))
    .sort((a, b) => b.folder.length - a.folder.length);
  const match = matches[0];
  if (!match) return undefined;
  return {
    kind: match.kind,
    name: match.kind.perSubfolder ? parts[match.folder.length]! : stem(parts[parts.length - 1]!),
  };
}

/** The top-level folder names a project may have: the first segment of every kind's and supporting file's folder. */
export function topLevelFolders(schema: MtrSchema): Set<string> {
  return new Set([...schema.kinds.map((k) => k.folder), ...schema.files.map((f) => f.folder)].map((f) => segments(f)[0]!));
}

/**
 * The project root a `.mtr` file belongs to: of the folders above it from which the file sits in a kind's folder, the
 * one with the most of a project's top-level folders in it, and of those the nearest.
 */
export function findProjectRoot(schema: MtrSchema, file: string, fs: FileSystem): string | undefined {
  const known = topLevelFolders(schema);
  let best: { dir: string; score: number; depth: number } | undefined;
  let dir = path.dirname(file);
  for (let depth = 0; ; depth++) {
    const relative = path.relative(dir, file);
    if (placeFile(schema, relative)) {
      const score = fs.list(dir).filter((name) => known.has(name) && fs.isDirectory(path.join(dir, name))).length;
      if (!best || score > best.score || (score === best.score && depth < best.depth)) best = { dir, score, depth };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return best?.dir;
}

export interface AppFolder {
  mtr: string[];
  mtc: string[];
}

/** Everything a project declares, by name. Paths are absolute. */
export class ProjectIndex {
  /** kind id → lower-cased name → files. */
  private readonly resources = new Map<string, Map<string, string[]>>();
  readonly prompts = new Map<string, string[]>();
  readonly json = new Map<string, string[]>();
  readonly apps = new Map<string, AppFolder>();

  constructor(
    readonly root: string,
    private readonly schema: MtrSchema,
    private readonly fs: FileSystem,
  ) {
    for (const kind of schema.kinds) {
      const names = new Map<string, string[]>();
      this.resources.set(kind.id, names);
      const folder = path.join(root, ...segments(kind.folder));
      if (kind.perSubfolder) {
        for (const sub of fs.list(folder).filter((n) => fs.isDirectory(path.join(folder, n)))) {
          const files = this.walk(path.join(folder, sub));
          const app: AppFolder = {
            mtr: files.filter((f) => f.toLowerCase().endsWith(".mtr")),
            mtc: files.filter((f) => f.toLowerCase().endsWith(".mtc")),
          };
          this.apps.set(sub, app);
          if (app.mtr.length) add(names, sub.toLowerCase(), ...app.mtr);
        }
      } else {
        for (const file of this.walk(folder).filter((f) => f.toLowerCase().endsWith(".mtr"))) add(names, stem(file).toLowerCase(), file);
      }
    }
    for (const supporting of schema.files.filter((f) => !f.perSubfolder && f.extension)) {
      const target = supporting.id === "prompt" ? this.prompts : supporting.id === "json" ? this.json : undefined;
      if (!target) continue;
      const ext = supporting.extension!.toLowerCase();
      for (const file of this.walk(path.join(root, ...segments(supporting.folder))).filter((f) => f.toLowerCase().endsWith(ext))) {
        add(target, stem(file), file);
      }
    }
  }

  /** The files declaring a resource of one of these kinds with this name (ignoring case, as the build does). */
  find(kindIds: string[], name: string): string[] {
    return kindIds.flatMap((id) => this.resources.get(id)?.get(name.toLowerCase()) ?? []);
  }

  names(kindIds: string[]): string[] {
    const all = new Set<string>();
    for (const id of kindIds) {
      for (const files of this.resources.get(id)?.values() ?? []) {
        for (const file of files) {
          const kind = this.schema.kinds.find((k) => k.id === id)!;
          all.add(kind.perSubfolder ? path.basename(path.dirname(file)) : stem(file));
        }
      }
    }
    return [...all].sort((a, b) => a.localeCompare(b));
  }

  read(file: string): string | undefined {
    return this.fs.read(file);
  }

  supporting(id: string): SupportingFile | undefined {
    return this.schema.files.find((f) => f.id === id);
  }

  private walk(dir: string): string[] {
    if (!this.fs.isDirectory(dir)) return [];
    const out: string[] = [];
    for (const name of this.fs.list(dir).sort()) {
      const full = path.join(dir, name);
      if (this.fs.isDirectory(full)) {
        if (name !== "node_modules" && !name.startsWith(".")) out.push(...this.walk(full));
      } else {
        out.push(full);
      }
    }
    return out;
  }
}

function add(map: Map<string, string[]>, key: string, ...files: string[]): void {
  const list = map.get(key);
  if (list) list.push(...files);
  else map.set(key, [...files]);
}
