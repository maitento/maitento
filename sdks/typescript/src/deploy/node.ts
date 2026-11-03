import { isServerRuntime, nodeModule } from "../core/env.js";
import { MaitentoError } from "../core/errors.js";
import { PROJECT_EXTENSIONS, ProjectError, type ProjectFiles } from "./project.js";

interface Dirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

interface FsPromises {
  readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean; size: number }>;
}

interface PathModule {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  basename(path: string): string;
}

/** Folders never read into a project. */
const SKIPPED_FOLDERS = new Set(["node_modules", ".git"]);

/**
 * Reads a resource project folder (server runtimes only): every `.mtr`, `.mtc`, `.md` and `.json` file below it, by
 * relative POSIX path. Hidden folders and `node_modules` are skipped.
 */
export async function readProjectFolder(folder: string): Promise<ProjectFiles> {
  if (!isServerRuntime()) {
    throw new MaitentoError(
      "Reading a project folder needs Node (or Bun / Deno). In a browser, pass the files as { \"agents/x.mtr\": \"…\" }.",
    );
  }
  const fs = await nodeModule<FsPromises>("fs/promises");
  const path = await nodeModule<PathModule>("path");
  const root = path.resolve(folder);
  let info: { isDirectory(): boolean };
  try {
    info = await fs.stat(root);
  } catch (cause) {
    throw new ProjectError(`Project folder not found: ${folder}`, { cause });
  }
  if (!info.isDirectory()) {
    throw new ProjectError(`Not a folder: ${folder}`);
  }

  const files: Record<string, string> = {};
  const walk = async (directory: string, relative: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIPPED_FOLDERS.has(entry.name)) continue;
        await walk(full, rel);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (PROJECT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
          // A UTF-8 byte-order mark is not part of the text (editors on Windows like to add one).
          files[rel] = (await fs.readFile(full, "utf8")).replace(/^﻿/, "");
        }
      }
    }
  };
  await walk(root, "");
  return files;
}
