import * as fs from "fs";
import { FileSystem } from "./project";

/** The project's files, read from disk. */
export const nodeFileSystem: FileSystem = {
  isDirectory(p) {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  list(dir) {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  },
  read(file) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  },
};
