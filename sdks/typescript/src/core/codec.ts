import { parseDotNetDateTime, parseDotNetTimeSpan, toDotNetTimeSpan } from "../generated/runtime.js";
import { CODEC_TABLE } from "../codec-table.js";

/** One model's entry in the generated codec table (see scripts/generate-models.mjs). */
export interface CodecEntry {
  /** The discriminator property and the value this concrete type carries. */
  readonly d?: readonly [string, string];
  /** The fields to visit, with their wire types. */
  readonly f?: Readonly<Record<string, string>>;
  /** A union: its discriminator property and member type by discriminator value. */
  readonly u?: readonly [string, Readonly<Record<string, string>>];
}

export type CodecTable = Readonly<Record<string, CodecEntry>>;

type TypeNode =
  | { readonly kind: "primitive"; readonly name: string }
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "array" | "map" | "nullable"; readonly element: TypeNode };

const parsed = new Map<string, TypeNode>();

/** Parses the wire type notation of routes.json / models.json (`Agent[]`, `map<string, T>`, `T | null`). */
export function parseType(text: string): TypeNode {
  let node = parsed.get(text);
  if (!node) {
    node = parseUncached(text.trim());
    parsed.set(text, node);
  }
  return node;
}

function parseUncached(s: string): TypeNode {
  if (s.endsWith(" | null")) {
    return { kind: "nullable", element: parseUncached(s.slice(0, -" | null".length)) };
  }
  if (s.endsWith("[]")) {
    let inner = s.slice(0, -2);
    if (inner.startsWith("(") && inner.endsWith(")")) {
      inner = inner.slice(1, -1);
    }
    return { kind: "array", element: parseUncached(inner) };
  }
  if (s.startsWith("map<string, ") && s.endsWith(">")) {
    return { kind: "map", element: parseUncached(s.slice("map<string, ".length, -1)) };
  }
  if (/^[a-z]/.test(s)) {
    return { kind: "primitive", name: s };
  }
  return { kind: "named", name: s };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Converts a parsed JSON response of wire type `type` to the SDK's shape, IN PLACE: dates become `Date`s and .NET
 * TimeSpans become milliseconds. Anything unexpected (an unknown field, a value of another type) is left as it is:
 * the server may grow, and a newer field never makes a response unreadable.
 */
export function decode(type: string, value: unknown, table: CodecTable = CODEC_TABLE): unknown {
  return decodeNode(parseType(type), value, table);
}

function decodeNode(node: TypeNode, value: unknown, table: CodecTable): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  switch (node.kind) {
    case "nullable":
      return decodeNode(node.element, value, table);
    case "array":
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          value[i] = decodeNode(node.element, value[i], table);
        }
      }
      return value;
    case "map":
      if (isPlainObject(value)) {
        for (const key of Object.keys(value)) {
          value[key] = decodeNode(node.element, value[key], table);
        }
      }
      return value;
    case "primitive":
      return decodePrimitive(node.name, value);
    case "named":
      return decodeNamed(node.name, value, table);
  }
}

const NO_OFFSET = /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

function decodePrimitive(name: string, value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    if (name === "datetime") {
      // The server stores UTC; a value it wrote without an offset (an "unspecified" DateTime) is UTC too.
      return parseDotNetDateTime(NO_OFFSET.test(value) ? value + "Z" : value);
    }
    if (name === "timespan") {
      return parseDotNetTimeSpan(value);
    }
  } catch {
    // Not in the expected format: hand the raw value through rather than fail the whole response.
  }
  return value;
}

function decodeNamed(name: string, value: unknown, table: CodecTable): unknown {
  const entry = table[name];
  if (!entry || !isPlainObject(value)) {
    return value;
  }
  if (entry.u) {
    const [property, members] = entry.u;
    const tag = value[property];
    const member = typeof tag === "string" ? members[tag] : undefined;
    return member ? decodeNamed(member, value, table) : value;
  }
  if (entry.f) {
    for (const [field, fieldType] of Object.entries(entry.f)) {
      if (field in value) {
        value[field] = decodeNode(parseType(fieldType), value[field], table);
      }
    }
  }
  return value;
}

/**
 * Converts a request value of wire type `type` to its JSON-ready wire shape, WITHOUT changing the caller's object:
 * milliseconds become .NET TimeSpan strings, `Date`s become ISO-8601 strings, and a polymorphic object gets its
 * discriminator (`$type` / `type`) as its FIRST property, which the server requires.
 */
export function encode(type: string, value: unknown, table: CodecTable = CODEC_TABLE): unknown {
  return encodeNode(parseType(type), value, table);
}

function encodeNode(node: TypeNode, value: unknown, table: CodecTable): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  switch (node.kind) {
    case "nullable":
      return encodeNode(node.element, value, table);
    case "array":
      return Array.isArray(value) ? value.map((item) => encodeNode(node.element, item, table)) : value;
    case "map": {
      if (!isPlainObject(value)) {
        return value;
      }
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        result[key] = encodeNode(node.element, item, table);
      }
      return result;
    }
    case "primitive":
      return encodePrimitive(node.name, value);
    case "named":
      return encodeNamed(node.name, value, table);
  }
}

function encodePrimitive(name: string, value: unknown): unknown {
  if (name === "timespan" && typeof value === "number") {
    return toDotNetTimeSpan(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function encodeNamed(name: string, value: unknown, table: CodecTable): unknown {
  const entry = table[name];
  if (!entry || !isPlainObject(value)) {
    return value;
  }
  if (entry.u) {
    const [property, members] = entry.u;
    const tag = value[property];
    const member = typeof tag === "string" ? members[tag] : undefined;
    return member ? encodeNamed(member, value, table) : discriminatorFirst(property, value);
  }
  const result: Record<string, unknown> = {};
  let discriminator: string | undefined;
  if (entry.d) {
    discriminator = entry.d[0];
    result[discriminator] = value[discriminator] ?? entry.d[1];
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === discriminator) {
      continue;
    }
    const fieldType = entry.f?.[key];
    result[key] = fieldType ? encodeNode(parseType(fieldType), item, table) : item;
  }
  return result;
}

function discriminatorFirst(property: string, value: Record<string, unknown>): Record<string, unknown> {
  if (!(property in value)) {
    return value;
  }
  const result: Record<string, unknown> = { [property]: value[property] };
  for (const [key, item] of Object.entries(value)) {
    if (key !== property) {
      result[key] = item;
    }
  }
  return result;
}
