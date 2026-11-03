import * as fs from "fs";
import * as path from "path";

/**
 * The shape of `mtr-schema.json` (generated from Maitento's code; see `sdks/mtr-schema.json`). Only what the extension
 * reads is typed here.
 */
export interface MtrSchema {
  schemaVersion: number;
  syntax: Syntax;
  kinds: Kind[];
  types: Record<string, ObjectType>;
  referenceTargets: Record<string, ReferenceTarget>;
  files: SupportingFile[];
}

export interface Syntax {
  extension: string;
  comment: string;
  includes: Include[];
  resourceNames: { pattern: string; maxLength: number; uniqueIgnoringCase?: boolean; description: string };
  rules: { id: string; text: string; wrong: string; right: string }[];
}

export interface Include {
  directive: string;
  form: string;
  resolves: string;
  description: string;
}

export interface Kind {
  id: string;
  title: string;
  folder: string;
  perSubfolder?: boolean;
  maxFiles?: number;
  nameFrom: "file" | "folder";
  name: string;
  description: string;
  properties: Property[];
}

export interface ObjectType {
  description?: string;
  properties: Property[];
}

export type ValueType = "string" | "number" | "integer" | "boolean" | "reference" | "object" | "array" | "map";

export interface ValueShape {
  type: ValueType;
  format?: "duration" | "url" | "http-method" | "json";
  enum?: { value: string; description?: string }[];
  references?: string;
  object?: string;
  items?: ValueShape;
}

export interface Property extends ValueShape {
  name: string;
  required?: boolean;
  default?: unknown;
  description: string;
}

export interface ReferenceTarget {
  title: string;
  description: string;
  kinds: string[];
  source?: string;
}

export interface SupportingFile {
  id: string;
  title: string;
  folder: string;
  perSubfolder?: boolean;
  nested?: boolean;
  extension?: string;
  fileName?: string;
  language?: string;
  description: string;
}

export const SUPPORTED_SCHEMA_VERSION = 1;

/** Reads a schema file and checks it is a version this extension understands. */
export function loadSchema(file: string): MtrSchema {
  const schema = JSON.parse(fs.readFileSync(file, "utf8")) as MtrSchema;
  if (schema.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`${path.basename(file)} is schema version ${schema.schemaVersion}; this extension reads version ${SUPPORTED_SCHEMA_VERSION}.`);
  }
  return schema;
}

/** The schema bundled with the extension (copied from `sdks/mtr-schema.json` by `npm run build`). */
export function bundledSchemaPath(): string {
  // out/src/mtr/schema.js -> <extension>/schema/mtr-schema.json
  return path.resolve(__dirname, "..", "..", "..", "schema", "mtr-schema.json");
}

/** The properties of the object shape a property's value (or its list's items) has, if it has one. */
export function objectProperties(schema: MtrSchema, shape: ValueShape): Property[] | undefined {
  const id = shape.type === "object" ? shape.object : shape.type === "array" && shape.items?.type === "object" ? shape.items.object : undefined;
  return id ? schema.types[id]?.properties : undefined;
}

/** A short, plain description of what a value looks like: "text", "a reference to an agent", "a list of blocks". */
export function describeShape(schema: MtrSchema, shape: ValueShape): string {
  switch (shape.type) {
    case "string":
      if (shape.format === "duration") return 'a duration, "hh:mm:ss"';
      if (shape.format === "url") return "a URL";
      if (shape.format === "http-method") return "an HTTP method";
      if (shape.format === "json") return "JSON text";
      if (shape.enum) return `one of ${shape.enum.map((e) => `"${e.value}"`).join(", ")}`;
      return "text";
    case "number":
      return "a number";
    case "integer":
      return "a whole number";
    case "boolean":
      return "true or false";
    case "reference": {
      const title = schema.referenceTargets[shape.references ?? ""]?.title ?? "definition";
      return `a reference to ${article(title)}`;
    }
    case "object":
      return "a block { ... }";
    case "map":
      return "a map, one line per entry";
    case "array": {
      const items = shape.items;
      if (!items) return "a list";
      if (items.type === "object") return "a list of blocks";
      if (items.type === "reference") return `a list of references to ${plural(schema.referenceTargets[items.references ?? ""]?.title ?? "definition")}`;
      return `a list of ${items.type === "string" ? "text" : describeShape(schema, items).replace(/^an? /, "")}`;
    }
  }
}

export const article = (word: string): string => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
export const plural = (word: string): string => (word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`);
