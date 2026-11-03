import { Placement, ProjectIndex } from "./project";
import { describeShape, MtrSchema, objectProperties, Property, ValueShape } from "./schema";
import { kindSnippet } from "./snippets";
import { Token, tokenize } from "./tokenizer";

/**
 * Completions at a point in a `.mtr` file, worked out from the text before it (which is usually half-written, so
 * this reads tokens, not a parse): property names for the block the cursor is in, values for the property after `=`,
 * and names of what the project declares inside `@ref("`, `@prompt("` and `@json("`.
 */
export interface Suggestion {
  label: string;
  kind: "property" | "value" | "reference" | "file" | "file-template";
  /** VS Code snippet syntax when `isSnippet`, else plain text. */
  insertText: string;
  isSnippet: boolean;
  detail?: string;
  documentation?: string;
  /** Where the replaced text starts (the part of a word already typed); the cursor is where it ends. */
  replaceFrom: number;
  sortText?: string;
}

export interface CompletionOptions {
  schema: MtrSchema;
  placement?: Placement;
  project?: ProjectIndex;
}

interface Frame {
  /** A block's properties, or (for a list) the list's property. */
  properties?: Property[];
  list?: Property;
  set: Set<string>;
}

export function complete(text: string, offset: number, options: CompletionOptions): Suggestion[] {
  const { schema, placement } = options;
  if (!placement) return [];
  const before = text.slice(0, offset);
  const tokens = tokenize(before).filter((t) => t.kind !== "comment");
  const last = tokens[tokens.length - 1];

  // Inside a string that is still open: what the string is for.
  if (last?.kind === "string" && last.unterminated) {
    return insideString(tokens, options, scopeOf(tokens.slice(0, -1), placement.kind.properties, schema));
  }

  const scope = scopeOf(tokens, placement.kind.properties, schema);
  // The word being typed, if the cursor is at the end of one.
  const typing = last && last.end === offset && (last.kind === "word" || last.kind === "at") ? last : undefined;
  const context = typing ? tokens.slice(0, -1) : tokens;
  const replaceFrom = typing ? typing.start : offset;
  const prev = context[context.length - 1];
  const prev2 = context[context.length - 2];

  if (prev?.kind === "word" && prev.value === "=" && prev2?.kind === "word") {
    const property = findProperty(scope.top, prev2.value);
    return property ? values(property, property, replaceFrom, options) : [];
  }
  // Right after @: the directive is being typed; the snippets and value completions cover it.
  if (prev?.kind === "at") return [];
  if (scope.top.list && (prev?.kind === "lbracket" || prev?.kind === "comma")) {
    const list = scope.top.list;
    return list.items ? values(list.items, list, replaceFrom, options, true) : [];
  }
  if (!scope.top.properties) return [];

  const nameSuggestions = names(scope.top, replaceFrom, schema);
  const onlyComments = tokenize(text).every((t) => t.kind === "comment");
  if (onlyComments && scope.depth === 0) {
    const snippet = kindSnippet(schema, placement.kind);
    nameSuggestions.unshift({
      label: `${placement.kind.title.toLowerCase()} file`,
      kind: "file-template",
      insertText: snippet.body.join("\n"),
      isSnippet: true,
      detail: `Every required property of ${articleTitle(placement.kind.title)}`,
      documentation: placement.kind.description,
      replaceFrom,
      sortText: "0",
    });
  }
  return nameSuggestions;
}

interface Scope {
  top: Frame;
  depth: number;
  /** The property whose value is being written (after `name =`), if any. */
  pending?: Property;
}

/** Walks the tokens before the cursor, tracking which block or list it is in and what has been set there. */
function scopeOf(tokens: Token[], root: Property[], schema: MtrSchema): Scope {
  const stack: Frame[] = [{ properties: root, set: new Set() }];
  let pending: Property | undefined;
  let pendingUnknown = false;
  // Inside `@ref(...)` / `@prompt(...)` / `@json(...)`: still the same value.
  let inDirective = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const top = stack[stack.length - 1]!;
    const next = tokens[i + 1];
    if (inDirective) {
      if (t.kind === "rparen") {
        inDirective = false;
        pending = undefined;
        pendingUnknown = false;
      }
      continue;
    }
    if (t.kind === "at") {
      if (next?.kind === "word" && tokens[i + 2]?.kind === "lparen") {
        inDirective = true;
        i += 2;
      }
      continue;
    }
    if (t.kind === "word" && next?.kind === "word" && next.value === "=" && top.properties) {
      const base = t.value.split(":")[0]!;
      top.set.add(base);
      pending = findProperty(top, base);
      pendingUnknown = !pending;
      i++;
      continue;
    }
    switch (t.kind) {
      case "lbrace": {
        let properties: Property[] | undefined;
        if (pending?.type === "object") properties = objectProperties(schema, pending);
        else if (!pending && !pendingUnknown && top.list?.items?.type === "object") properties = objectProperties(schema, top.list);
        stack.push({ properties: properties ?? undefined, set: new Set() });
        pending = undefined;
        pendingUnknown = false;
        break;
      }
      case "lbracket":
        stack.push({ list: pending?.type === "array" ? pending : undefined, set: new Set() });
        pending = undefined;
        pendingUnknown = false;
        break;
      case "rbrace":
      case "rbracket":
        if (stack.length > 1) stack.pop();
        pending = undefined;
        break;
      case "lparen":
      case "comma":
        break;
      default:
        // A value (or the end of one): what follows is a new entry.
        if (t.kind !== "word" || t.value !== "=") {
          pending = undefined;
          pendingUnknown = false;
        }
    }
  }
  return { top: stack[stack.length - 1]!, depth: stack.length - 1, pending };
}

function findProperty(frame: Frame, name: string): Property | undefined {
  return frame.properties?.find((p) => p.name === name.split(":")[0]);
}

/** Property names that can go here, required ones first, leaving out those already set (except maps). */
function names(frame: Frame, replaceFrom: number, schema: MtrSchema): Suggestion[] {
  return (frame.properties ?? [])
    .filter((p) => p.type === "map" || !frame.set.has(p.name))
    .map((p, index) => ({
      label: p.type === "map" ? `${p.name}:` : p.name,
      kind: "property" as const,
      insertText: p.type === "map" ? `${p.name}:\${1:key} = "\${2}"` : `${p.name} = ${valueSnippet(p, p.default)}`,
      isSnippet: true,
      detail: `${p.required ? "required · " : ""}${describeShape(schema, p)}`,
      documentation: p.description,
      replaceFrom,
      sortText: `${p.required ? "1" : "2"}${String(index).padStart(3, "0")}`,
    }));
}

/** The snippet for a property's value, with tab stops. */
export function valueSnippet(shape: ValueShape, defaultValue?: unknown): string {
  switch (shape.type) {
    case "string":
      if (shape.enum && shape.format !== "http-method") return `"\${1|${shape.enum.map((e) => e.value).join(",")}|}"`;
      if (shape.format === "http-method") return `"\${1|${shape.enum!.slice(0, 5).map((e) => e.value).join(",")}|}"`;
      if (shape.format === "duration") return '"${1:00:05:00}"';
      if (shape.format === "url") return '"${1:https://}"';
      if (shape.format === "json") return '@json("${1}")';
      return '"${1}"';
    case "number":
    case "integer":
      return `\${1:${typeof defaultValue === "number" ? defaultValue : shape.type === "integer" ? 1 : 0.5}}`;
    case "boolean":
      return "${1|true,false|}";
    case "reference":
      return '@ref("${1}")';
    case "object":
      return "{\n\t$0\n}";
    case "array":
      if (shape.items?.type === "object") return "[\n\t{\n\t\t$0\n\t}\n]";
      if (shape.items?.type === "reference") return '[ @ref("${1}") ]';
      return '[ "${1}" ]';
    case "map":
      return '"${1}"';
  }
}

/** What can follow `name = ` (or start a list item) for a property. */
function values(shape: ValueShape, property: Property, replaceFrom: number, options: CompletionOptions, item = false): Suggestion[] {
  const { schema, project } = options;
  const out: Suggestion[] = [];
  const plain = (label: string, insertText: string, documentation?: string, kind: Suggestion["kind"] = "value"): Suggestion =>
    ({ label, kind, insertText, isSnippet: false, documentation, replaceFrom, detail: property.name });
  switch (shape.type) {
    case "string":
      if (shape.enum) for (const e of shape.enum) out.push(plain(`"${e.value}"`, `"${e.value}"`, e.description));
      if (!item && project) {
        if (shape.format === "json" || !shape.enum) {
          const files = shape.format === "json" ? project.json : project.prompts;
          const directive = shape.format === "json" ? "json" : "prompt";
          for (const name of [...files.keys()].sort()) out.push(plain(`@${directive}("${name}")`, `@${directive}("${name}")`, undefined, "file"));
        }
      }
      if (!shape.enum && shape.format !== "json") out.push({ ...plain('"..."', valueSnippet(shape)), isSnippet: true });
      break;
    case "boolean":
      out.push(plain("true", "true"), plain("false", "false"));
      break;
    case "reference": {
      const target = schema.referenceTargets[shape.references ?? ""];
      if (target && project) for (const name of project.names(target.kinds)) out.push(plain(`@ref("${name}")`, `@ref("${name}")`, undefined, "reference"));
      out.push({ ...plain('@ref("...")', '@ref("${1}")', target?.description), isSnippet: true });
      break;
    }
    case "object":
      out.push({ ...plain("{ ... }", "{\n\t$0\n}"), isSnippet: true });
      break;
    case "array":
      out.push({ ...plain("[ ... ]", valueSnippet(shape)), isSnippet: true });
      break;
    case "number":
    case "integer":
      if (property.default !== undefined) out.push(plain(String(property.default), String(property.default), "The default"));
      break;
  }
  return out;
}

/** Completions inside an open string: names in `@ref("`, file names in `@prompt("` / `@json("`, or an enum's values. */
function insideString(tokens: Token[], options: CompletionOptions, scope: Scope): Suggestion[] {
  const { schema, project } = options;
  const open = tokens[tokens.length - 1]!;
  const replaceFrom = open.start + 1;
  const [lparen, directive, at] = [tokens[tokens.length - 2], tokens[tokens.length - 3], tokens[tokens.length - 4]];
  const plain = (label: string, documentation?: string, kind: Suggestion["kind"] = "value"): Suggestion =>
    ({ label, kind, insertText: label, isSnippet: false, documentation, replaceFrom });

  if (lparen?.kind === "lparen" && directive?.kind === "word" && at?.kind === "at") {
    if (directive.value === "prompt" && project) return [...project.prompts.keys()].sort().map((n) => plain(n, undefined, "file"));
    if (directive.value === "json" && project) return [...project.json.keys()].sort().map((n) => plain(n, undefined, "file"));
    if (directive.value === "ref" && project) {
      const property = scope.pending ?? scope.top.list;
      const shape = property?.type === "array" ? property.items : property;
      const target = schema.referenceTargets[shape?.references ?? ""];
      return target ? project.names(target.kinds).map((n) => plain(n, target.description, "reference")) : [];
    }
    return [];
  }

  const property = scope.pending ?? scope.top.list;
  const shape = property?.type === "array" ? property.items : property;
  if (shape?.enum) return shape.enum.map((e) => plain(e.value, e.description));
  return [];
}

const articleTitle = (title: string): string => (/^[aeiou]/i.test(title) ? `an ${title.toLowerCase()}` : `a ${title.toLowerCase()}`);
